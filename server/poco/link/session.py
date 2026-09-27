"""Social Mode: the loop that watches, listens, and decides.

This is what social_demo.py does, with the printing replaced by a callback, so
the iPad can switch it on and off and receive what Poco notices.

It runs on its own thread because none of it is async: OpenCV blocks on every
frame grab, and Whisper and Claude block for seconds at a time. Events are
handed back through `on_event`, which is called from this thread - the server
bounces them onto the asyncio loop before sending.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor

import cv2

from poco.audio import SpeechListener
from poco.bridge import PocoEvent, event_for, move_for
from poco.devices import CAMERA, MIC
from poco.social import Coach, Memory, SocialContext
from poco.vision import EmotionDetector

WARMUP_SECONDS = 2.5


class Session:
    """One run of Social Mode."""

    def __init__(
        self,
        on_event: Callable[[PocoEvent], None],
        robot=None,
        voice=None,
        camera: int = CAMERA,
        mic: str = MIC,
        model: str = "base.en",
        effort: str = "low",
        cooldown: float = 20.0,
        use_memory: bool = False,
    ):
        self.on_event = on_event
        self.robot = robot
        self.voice = voice
        self.camera = camera
        self.mic = mic
        self.model = model
        self.effort = effort
        self.cooldown = cooldown
        self.use_memory = use_memory

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.running = False
        self.fps = 0.0
        self.last_error: str | None = None

        # Live telemetry for the debug page. Plain attributes, written from the
        # loop thread and read from the server's - all single values, so a torn
        # read is at worst one stale number on a screen refreshing 5x a second.
        self.face: str | None = None      # emotion the camera reads right now
        self.face_confidence = 0.0
        self.face_seen = False
        self.mic_db = -90.0               # input level, for "is the mic live"
        self.hearing_speech = False       # Silero thinks someone is talking
        self.mic_muted = False            # deaf while Poco talks
        self.heard: list[dict] = []       # recent transcripts
        self.thinking = False             # a Claude call is in flight
        self.stopped_because: str | None = None   # why the last run ended
        self.phase = "stopped"            # stopped | starting | watching
        self._detector = None             # kept between runs; loading is slow
        self._coach = None
        self.next_suggestion_in = 0.0     # seconds until Poco may speak again

    def start(self) -> None:
        if self.running:
            return
        self.stopped_because = None
        self.phase = "starting"
        self._stop.clear()
        self.running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self, because: str = "asked to") -> None:
        if self.running and self.stopped_because is None:
            self.stopped_because = because
        self._stop.set()
        if self._thread is not None:
            # Long enough for a frame grab and a model call to finish, so the
            # camera and microphone are released rather than left open.
            self._thread.join(timeout=10)
        self.running = False

    # -- the loop ----------------------------------------------------------

    def _run(self) -> None:
        cap = listener = None
        pool = ThreadPoolExecutor(max_workers=1)
        pending: Future | None = None
        try:
            cap = cv2.VideoCapture(self.camera, cv2.CAP_AVFOUNDATION)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            if not cap.isOpened():
                raise RuntimeError(f"could not open camera {self.camera}")

            # Built once and kept. Rebuilding these every time Social Mode
            # started cost about 11 seconds before the first frame, which looks
            # exactly like the robot being broken.
            if self._detector is None:
                self._detector = EmotionDetector()
            if self._coach is None:
                self._coach = Coach(effort=self.effort)
            detector = self._detector
            listener = SpeechListener(model_name=self.model, device=self.mic)
            ctx = SocialContext(suggest_cooldown=self.cooldown)
            coach = self._coach
            memory = Memory() if self.use_memory else None
            listener.start()

            # The first frames off a webcam are black while auto-exposure
            # settles; feeding those in just starts the session "no face".
            t0 = time.monotonic()
            while time.monotonic() - t0 < WARMUP_SECONDS and not self._stop.is_set():
                cap.read()

            self.phase = "watching"
            last = time.monotonic()
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    # A dead camera looked exactly like a clean stop before:
                    # the loop just ended and the telemetry sat there frozen.
                    self.stopped_because = "the camera stopped returning frames"
                    break
                now = time.monotonic()
                face, _ = detector.process(frame, now)
                ctx.observe_face(face, now)

                self.face_seen = face is not None
                self.face = face.emotion if face is not None else None
                self.face_confidence = face.confidence if face is not None else 0.0
                self.mic_db = listener.level_db
                self.hearing_speech = listener.speaking
                self.mic_muted = listener.muted

                utterance = listener.poll()
                if utterance:
                    ctx.add_utterance(utterance)
                    self.heard.append({
                        "text": utterance.text,
                        "confidence": round(utterance.confidence, 2),
                        "seconds": round(utterance.duration, 1),
                        "at": time.time(),
                    })
                    del self.heard[:-12]
                    if ctx.ready_to_suggest(now) and pending is None:
                        self.thinking = True
                        pending = pool.submit(self._think, coach, ctx, memory, now)
                        ctx.mark_suggested(now)

                if pending is not None and pending.done():
                    self._deliver(pending, listener)
                    self.thinking = False
                    pending = None

                # Counts down to when Poco may next speak. Without it, the
                # cooldown looks identical to Poco being broken - it is 20s by
                # default, which is a long time to sit watching nothing happen.
                self.next_suggestion_in = max(
                    0.0, ctx.suggest_cooldown - (now - ctx._last_suggested))

                self.fps = 0.9 * self.fps + 0.1 / max(now - last, 1e-6)
                last = now
        except Exception as exc:
            self.last_error = str(exc)
        finally:
            self.running = False
            self.phase = "stopped"
            # Clear the live numbers. Leaving the last frame's fps, face and
            # "thinking" in place made a stopped session look like a running
            # one, which is how this went unnoticed in the first place.
            self.fps = 0.0
            self.face = None
            self.face_confidence = 0.0
            self.face_seen = False
            self.hearing_speech = False
            self.mic_muted = False
            self.mic_db = -90.0
            self.thinking = False
            self.next_suggestion_in = 0.0
            pool.shutdown(wait=False)
            if listener is not None:
                listener.stop()
            if cap is not None:
                cap.release()

    def _think(self, coach, ctx, memory, now):
        facts = [f.text for f in memory.all()] if memory is not None else []
        result = coach.suggest(ctx, now, memories=facts)
        if memory is not None and result.suggestion.remember:
            memory.remember_async(result.suggestion.remember)
        return result

    def _deliver(self, pending: Future, listener) -> None:
        try:
            suggestion = pending.result().suggestion
        except Exception as exc:
            self.last_error = f"coach: {exc}"
            return
        if self.robot is not None:
            self.robot.perform(suggestion.gesture, suggestion.belly)
        if suggestion.say and self.voice is not None:
            # The listener is handed over so Poco's microphone is deaf while its
            # own voice is in the room.
            self.voice.say_async(suggestion.say, emotion=suggestion.belly,
                                 listener=listener)
        self.on_event(event_for(suggestion.belly, suggestion.say, suggestion.reason))

    def telemetry(self) -> dict:
        """Everything the debug page shows."""
        return {
            "running": self.running,
            "phase": self.phase,
            "fps": round(self.fps, 1),
            "face": self.face,
            "faceConfidence": round(self.face_confidence, 2),
            "faceSeen": self.face_seen,
            "micDb": round(self.mic_db, 1),
            "hearingSpeech": self.hearing_speech,
            "micMuted": self.mic_muted,
            "thinking": self.thinking,
            "nextIn": round(self.next_suggestion_in, 1),
            "stoppedBecause": self.stopped_because,
            "heard": self.heard[-8:],
            "error": self.last_error,
        }

    # -- for a belly that tracks the moment, not the last sentence ---------

    @staticmethod
    def resting_move(feeling: str) -> str:
        return move_for(feeling)
