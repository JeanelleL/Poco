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

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self.running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
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

            detector = EmotionDetector()
            listener = SpeechListener(model_name=self.model, device=self.mic)
            ctx = SocialContext(suggest_cooldown=self.cooldown)
            coach = Coach(effort=self.effort)
            memory = Memory() if self.use_memory else None
            listener.start()

            # The first frames off a webcam are black while auto-exposure
            # settles; feeding those in just starts the session "no face".
            t0 = time.monotonic()
            while time.monotonic() - t0 < WARMUP_SECONDS and not self._stop.is_set():
                cap.read()

            last = time.monotonic()
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    break
                now = time.monotonic()
                face, _ = detector.process(frame, now)
                ctx.observe_face(face, now)

                utterance = listener.poll()
                if utterance:
                    ctx.add_utterance(utterance)
                    if ctx.ready_to_suggest(now) and pending is None:
                        pending = pool.submit(self._think, coach, ctx, memory, now)
                        ctx.mark_suggested(now)

                if pending is not None and pending.done():
                    self._deliver(pending, listener)
                    pending = None

                self.fps = 0.9 * self.fps + 0.1 / max(now - last, 1e-6)
                last = now
        except Exception as exc:
            self.last_error = str(exc)
        finally:
            self.running = False
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

    # -- for a belly that tracks the moment, not the last sentence ---------

    @staticmethod
    def resting_move(feeling: str) -> str:
        return move_for(feeling)
