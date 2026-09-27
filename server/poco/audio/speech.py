"""Speech capture and transcription for Poco.

Pipeline:
  microphone -> endpointing (find where an utterance starts and stops)
  -> Whisper -> Utterance events

In social mode the speaker is the person Poco's user is talking *to*, so this
listens to open conversation rather than to commands. Conversation does not
arrive in tidy clips, so the work is mostly in deciding where one utterance
ends: cut too eagerly and a sentence is split down the middle, too late and
Poco is slow to respond.

Everything runs on this machine. Audio of someone else's conversation never
leaves it, which is the only version of this that seems fair to the person
being recorded.
"""

from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass, field

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 16000

# Loading Whisper takes several seconds, and a listener is built every time
# Social Mode starts. Keeping the model means the second start is immediate
# instead of leaving someone looking at a robot that appears to be ignoring
# them. It is read-only in use, so sharing one across listeners is safe.
_MODELS: dict[str, object] = {}


def load_model(name: str):
    from faster_whisper import WhisperModel

    if name not in _MODELS:
        _MODELS[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _MODELS[name]
FRAME_MS = 30
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000


@dataclass
class Utterance:
    """One stretch of speech, transcribed."""

    text: str
    start: float  # time.monotonic() when the speech began
    end: float
    confidence: float  # 0..1, from the model's average log probability
    timestamp: float = field(default_factory=time.time)

    @property
    def duration(self) -> float:
        return self.end - self.start


def find_input_device(name_hint: str | None) -> int | None:
    """Resolve a device by a fragment of its name, e.g. "C270"."""
    if name_hint is None:
        return None
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0 and name_hint.lower() in d["name"].lower():
            return i
    raise SystemExit(f"No input device matching {name_hint!r}. "
                     f"Try one of: " + ", ".join(
                         repr(d["name"]) for d in sd.query_devices()
                         if d["max_input_channels"] > 0))


class SpeechListener:
    """Listens in the background and emits an Utterance per sentence-ish chunk.

        listener = SpeechListener(device="C270")
        listener.start()
        while ...:
            u = listener.poll()
            if u:
                print(u.text)
    """

    def __init__(
        self,
        model_name: str = "base.en",
        device: str | int | None = None,
        silence_seconds: float = 0.7,
        min_speech_seconds: float = 0.35,
        max_speech_seconds: float = 15.0,
        speech_threshold: float = 0.5,
        pad_ms: int = 200,
    ):
        """
        silence_seconds:    pause that ends an utterance. Too short and a
                            sentence gets split at a breath; too long and Poco
                            is slow to react.
        min_speech_seconds: anything shorter is a cough or a chair, not speech.
        max_speech_seconds: force a cut so a monologue still gets transcribed.
        speech_threshold:   Silero's speech probability cutoff, 0..1.
        pad_ms:             audio kept either side of a segment, so the first
                            and last word are not clipped.
        """
        self.model_name = model_name
        if device is None:
            from poco.devices import MIC
            device = MIC
        self.device = find_input_device(device) if isinstance(device, str) else device
        self.silence_seconds = silence_seconds
        self.min_speech_seconds = min_speech_seconds
        self.max_speech_seconds = max_speech_seconds
        self.speech_threshold = speech_threshold
        self.pad_ms = pad_ms

        self._frames: queue.Queue[tuple[float, np.ndarray]] = queue.Queue()
        self._out: queue.Queue[Utterance] = queue.Queue()
        self._stop = threading.Event()
        self._stream: sd.InputStream | None = None
        self._worker: threading.Thread | None = None
        self._model = None

        self.speaking = False  # for a UI to show "listening" vs "hearing speech"
        self.level_db = -90.0
        self._muted_until = 0.0

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._model = load_model(self.model_name)
        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=1, dtype="float32",
            blocksize=FRAME_SAMPLES, device=self.device, callback=self._on_audio,
        )
        self._stream.start()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def stop(self) -> None:
        self._stop.set()
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
        if self._worker is not None:
            self._worker.join(timeout=5)

    def mute_for(self, seconds: float) -> None:
        """Ignore the microphone for a while.

        Used while Poco is talking: his voice reaches his own microphone, and
        without this he transcribes himself and treats the result as something
        the other person said.

        Never shortens an existing mute - two clips overlapping should not let
        the microphone open during the second one. Use `unmute_in` to shorten
        deliberately.
        """
        self._muted_until = max(self._muted_until, time.monotonic() + seconds)

    def unmute_in(self, seconds: float) -> None:
        """Set the mute deadline outright, shortening it if it was longer.

        A streamed clip has to be guarded by its worst-case length, because the
        real one is unknown until the audio stops arriving. This is how that
        guess gets corrected once it is known - without it the microphone stays
        deaf for the whole worst case, and the next thing anyone says is simply
        never heard.
        """
        self._muted_until = time.monotonic() + seconds

    @property
    def muted(self) -> bool:
        return time.monotonic() < self._muted_until

    def poll(self) -> Utterance | None:
        """Next finished utterance, or None. Never blocks."""
        try:
            return self._out.get_nowait()
        except queue.Empty:
            return None

    # -- audio thread ------------------------------------------------------

    def _on_audio(self, indata, frames, time_info, status) -> None:
        # Runs on PortAudio's thread: copy and get out, no work here.
        self._frames.put((time.monotonic(), indata[:, 0].copy()))

    # -- worker thread -----------------------------------------------------

    def _run(self) -> None:
        """Hold a rolling buffer of recent audio and let Silero say where the
        speech is.

        An energy threshold cannot do this job: it has to be calibrated against
        a room's noise floor, and a floor estimated during one quiet moment
        leaves it latched on for good. Silero asks whether a window sounds like
        a voice, which needs no calibration.
        """
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        opts = VadOptions(
            threshold=self.speech_threshold,
            min_silence_duration_ms=int(self.silence_seconds * 1000),
            max_speech_duration_s=self.max_speech_seconds,
            speech_pad_ms=self.pad_ms,
        )
        silence_samples = int(self.silence_seconds * SAMPLE_RATE)
        # Silero has already insisted on silence_seconds of quiet before it
        # closes a segment, so this margin only has to show the segment is not
        # still running at the edge of the buffer. Requiring the full silence
        # again here just adds that long to how late Poco hears anything.
        edge_margin = int((self.pad_ms / 1000 + 0.15) * SAMPLE_RATE)
        run_every = SAMPLE_RATE // 4  # re-scan roughly 4x a second

        buf = np.zeros(0, dtype=np.float32)
        buf_start: float | None = None  # monotonic time of buf[0]
        pending = 0

        while not self._stop.is_set():
            try:
                t, frame = self._frames.get(timeout=0.2)
            except queue.Empty:
                continue

            self.level_db = 20 * np.log10(float(np.sqrt(np.mean(frame**2))) + 1e-9)

            if t < self._muted_until:
                # Poco is talking. Drop the audio and the part-built utterance
                # with it, so a sentence interrupted by Poco is not stitched on
                # to whatever is said afterwards.
                buf = np.zeros(0, dtype=np.float32)
                buf_start = None
                pending = 0
                self.speaking = False
                continue

            if buf_start is None:
                buf_start = t - len(frame) / SAMPLE_RATE
            buf = np.concatenate([buf, frame])
            pending += len(frame)
            if pending < run_every:
                continue
            pending = 0

            segments = get_speech_timestamps(buf, opts)
            # A segment only counts as finished once enough silence follows it;
            # otherwise the speaker is mid-sentence and it just happens to be
            # where the buffer ends.
            done = [x for x in segments if len(buf) - x["end"] >= edge_margin]
            self.speaking = len(done) < len(segments)

            for x in done:
                length = (x["end"] - x["start"]) / SAMPLE_RATE
                if length >= self.min_speech_seconds:
                    self._transcribe(
                        buf[x["start"]:x["end"]],
                        buf_start + x["start"] / SAMPLE_RATE,
                        buf_start + x["end"] / SAMPLE_RATE,
                    )

            if done:
                cut = done[-1]["end"]
            elif not segments and len(buf) > silence_samples + SAMPLE_RATE:
                # Nothing but room tone: keep just enough to catch an onset.
                cut = len(buf) - silence_samples
            else:
                cut = 0
            if cut:
                buf = buf[cut:]
                buf_start += cut / SAMPLE_RATE

    def _transcribe(self, audio: np.ndarray, start: float, end: float) -> None:
        segments, _ = self._model.transcribe(
            audio, language="en", beam_size=1,
            condition_on_previous_text=False,  # stops one bad guess poisoning the next
        )
        segments = list(segments)
        text = " ".join(s.text for s in segments).strip()
        if not text:
            return
        # avg_logprob is roughly -1..0; map it to something readable.
        lp = float(np.mean([s.avg_logprob for s in segments]))
        self._out.put(Utterance(
            text=text, start=start, end=end,
            confidence=float(np.clip(np.exp(lp), 0.0, 1.0)),
        ))
