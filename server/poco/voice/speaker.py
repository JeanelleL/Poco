"""Poco's voice, via ElevenLabs.

Poco speaks out loud in the same room its microphone is listening to, so every
line it says comes straight back in. Left alone, Whisper transcribes Poco's own
voice, SocialContext files it as something the friend said, and Poco ends up
advising your person about a sentence it made up itself. So the listener is
deafened for exactly as long as the clip lasts, plus a moment for the room to
stop ringing.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass

import numpy as np
import sounddevice as sd

def find_output_device(name_hint: str | None):
    """Resolve an output device by a fragment of its name."""
    if not name_hint:
        return None
    for i, d in enumerate(sd.query_devices()):
        if d["max_output_channels"] > 0 and name_hint.lower() in d["name"].lower():
            return i
    print(f"  [voice] no output device matching {name_hint!r}; using the default. "
          f"Have: " + ", ".join(repr(d["name"]) for d in sd.query_devices()
                                if d["max_output_channels"] > 0), flush=True)
    return None


VOICE_ID = "vGQNBgLaiM3EdZtxIiuY"
MODEL = "eleven_v3"
SAMPLE_RATE = 24000  # pcm_24000: raw int16, so it plays without a decoder

# How long after a clip finishes before the microphone is trusted again.
# Covers the tail of the room's reverb.
ECHO_TAIL = 0.4

# Worst-case clip length, used to deafen the microphone before a streamed clip
# whose duration is not known until it ends. Shortened to the real length the
# moment the stream finishes.
MAX_CLIP_SECONDS = 30.0

# Silence written after the last sample, on top of the device's own reported
# output latency, so the real audio is pushed all the way out of the speaker
# before the stream closes.
DRAIN_PAD = 0.3

# v3 acts on inline tags. Poco is a robot penguin for children, so the delivery
# carries as much as the words - the tag is taken from the feeling Poco reads in
# the friend, not from the feeling Poco is describing.
EMOTION_TAGS = {
    "happy": "[cheerful]",
    "sad": "[gentle]",
    "angry": "[calm]",
    "surprised": "[curious]",
    "worried": "[reassuring]",
    "neutral": "[warm]",
}


@dataclass
class Spoken:
    text: str
    latency: float  # request -> audio in hand
    duration: float  # how long the clip plays for
    characters: int  # what it cost, in ElevenLabs' billing unit


class Voice:
    """Turns a line of Poco's into sound.

        voice = Voice()
        voice.say("You could ask what he's most worried about", emotion="sad")
    """

    def __init__(
        self,
        voice_id: str = VOICE_ID,
        model: str = MODEL,
        style: float = 1.0,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        use_tags: bool = True,
        speaker: str | int | None = None,
    ):
        """
        style:     ElevenLabs' exaggeration control, 0..1. Pinned to the top.
        stability: v3 takes 0.0 Creative / 0.5 Natural / 1.0 Robust. Natural
                   keeps the delivery steady while still acting on the tags
                   above. Creative is more expressive but wanders; Robust would
                   flatten the tags out, which is the opposite of what a penguin
                   wants.
        use_tags:  prepend an emotion tag from EMOTION_TAGS.
        speaker:   output device, by name fragment. Defaults to devices.SPEAKER
                   rather than the system default, which drifts to whatever was
                   plugged in last.
        """
        from elevenlabs import VoiceSettings
        from elevenlabs.client import ElevenLabs

        from poco.social.coach import load_env

        load_env()
        if not os.environ.get("ELEVENLABS_API_KEY"):
            raise SystemExit(
                "No ELEVENLABS_API_KEY. Put it in .env (gitignored) or export it."
            )
        if speaker is None:
            from poco.devices import SPEAKER
            speaker = SPEAKER
        self.speaker = (find_output_device(speaker) if isinstance(speaker, str)
                        else speaker)
        self.client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
        self.voice_id = voice_id
        self.model = model
        self.use_tags = use_tags
        self.settings = VoiceSettings(
            stability=stability,
            similarity_boost=similarity_boost,
            style=style,
            use_speaker_boost=True,
        )
        self.speaking = False
        self._lock = threading.Lock()

    def render(self, text: str, emotion: str | None = None) -> tuple[np.ndarray, float, int]:
        """Fetch the audio without playing it."""
        line = text
        if self.use_tags and emotion in EMOTION_TAGS:
            line = f"{EMOTION_TAGS[emotion]} {text}"
        t0 = time.monotonic()
        chunks = self.client.text_to_speech.convert(
            voice_id=self.voice_id,
            text=line,
            model_id=self.model,
            output_format=f"pcm_{SAMPLE_RATE}",
            voice_settings=self.settings,
        )
        raw = b"".join(chunks)
        latency = time.monotonic() - t0
        audio = np.frombuffer(raw, dtype=np.int16)
        return audio, latency, len(line)

    def say(self, text: str, emotion: str | None = None, listener=None) -> Spoken:
        """Speak a line, starting as soon as the first audio arrives.

        Streaming rather than rendering the whole clip first: waiting for the
        last byte added about a second before Poco made any sound at all, which
        on top of everything else made him feel slow to answer.

        `listener` is a SpeechListener to deafen while the clip plays, so Poco
        does not hear itself.
        """
        with self._lock:
            line = text
            if self.use_tags and emotion in EMOTION_TAGS:
                line = f"{EMOTION_TAGS[emotion]} {text}"

            t0 = time.monotonic()
            chunks = self.client.text_to_speech.stream(
                voice_id=self.voice_id,
                text=line,
                model_id=self.model,
                output_format=f"pcm_{SAMPLE_RATE}",
                voice_settings=self.settings,
                # No optimize_streaming_latency: v3 rejects it outright.
            )

            # Deafen generously up front. The clip's length is unknown until the
            # stream ends, and guessing short would let Poco hear his own tail.
            if listener is not None:
                listener.mute_for(MAX_CLIP_SECONDS)

            self.speaking = True
            first_audio = None
            played = 0
            stream = self._open_stream()
            try:
                stream.start()
                tail = b""
                for chunk in chunks:
                    if not chunk:
                        continue
                    if first_audio is None:
                        first_audio = time.monotonic() - t0
                    buf = tail + chunk
                    # int16 frames must not be split across a write.
                    usable = len(buf) - (len(buf) % 2)
                    tail = buf[usable:]
                    stream.write(buf[:usable])
                    played += usable // 2
                if tail:
                    # An odd trailing byte is half a sample; pad it rather than
                    # drop it, so the buffer ends on a frame boundary.
                    stream.write(tail + b"\x00")
                    played += 1
                if played:
                    # Push the last word out of the speaker. Writing it only
                    # means PortAudio has it queued, and the device holds more
                    # still - stopping there cut the final syllable off every
                    # sentence. Timing it with a clock from the first chunk was
                    # not enough either: the stream arrives in bursts, every gap
                    # between them plays as silence and pushes the real end
                    # later than the clock thinks. Silence behind the audio,
                    # sized to the device's own latency, cannot come out before
                    # the audio does.
                    pad = int((max(stream.latency, 0.0) + DRAIN_PAD) * SAMPLE_RATE)
                    stream.write(b"\x00\x00" * pad)
            finally:
                # stop() plays out everything queued; abort() would drop it.
                stream.stop()
                stream.close()
                self.speaking = False
                duration = played / SAMPLE_RATE
                if listener is not None:
                    # Now the real length is known, release the microphone at
                    # the right moment rather than the worst case. This has to
                    # SET the deadline: mute_for only ever extends, so using it
                    # here left the microphone deaf for the full 30s guess.
                    listener.unmute_in(ECHO_TAIL)
            return Spoken(text=text, latency=first_audio or (time.monotonic() - t0),
                          duration=duration, characters=len(line))

    def _open_stream(self):
        """Open the output, falling back to the system default.

        PortAudio raises -9986 when the chosen device has gone away - a
        monitor unplugged, a Bluetooth speaker asleep - and the failure
        arrives as an exception inside a background thread, so the only
        symptom is Poco silently not talking. Falling back keeps him audible;
        the message says what happened.
        """
        try:
            return sd.RawOutputStream(samplerate=SAMPLE_RATE, channels=1,
                                      dtype="int16", device=self.speaker)
        except Exception as exc:
            if self.speaker is None:
                raise
            print(f"  [voice] output device {self.speaker} failed ({exc}); "
                  f"falling back to the system default", flush=True)
            self.speaker = None
            return sd.RawOutputStream(samplerate=SAMPLE_RATE, channels=1,
                                      dtype="int16", device=None)

    def _say_safely(self, text, emotion, listener) -> None:
        try:
            self.say(text, emotion, listener)
        except Exception as exc:
            # Otherwise this dies inside a daemon thread and the only sign is
            # silence, which is indistinguishable from Poco choosing not to talk.
            print(f"  [voice] could not speak {text[:40]!r}: "
                  f"{type(exc).__name__}: {exc}", flush=True)

    def say_async(self, text: str, emotion: str | None = None, listener=None) -> threading.Thread:
        """Speak without blocking the caller's loop."""
        thread = threading.Thread(
            target=self._say_safely, args=(text, emotion, listener), daemon=True
        )
        thread.start()
        return thread
