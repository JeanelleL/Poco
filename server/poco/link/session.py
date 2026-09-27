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

# Wait this long after someone stops talking before asking Claude anything.
# The endpointer cuts at any pause, so "Poco, can you..." and "...make a frowny
# face" arrive as two utterances - and with no cooldown each got its own answer,
# which is why asking twice produced four replies. Waiting a beat merges them
# into the one question that was actually asked. It costs this much latency and
# is worth it: answering half a sentence twice is slower in practice than
# answering the whole one once.
# Social mode waits for a real stop, not a breath. Someone explaining
# something pauses constantly, and jumping into those pauses is talking over
# them - which is the one thing a robot standing next to a conversation must
# not do.
SETTLE_SECONDS = 1.6

# Play mode is a back-and-forth with a child, where being quick matters more
# than merging a split sentence, so it waits less.
PLAY_SETTLE = 0.35

# After Poco suggests something in social mode, he holds off. A long answer
# arrives as many utterances, and without this each one earned its own
# suggestion - a stream of advice about a single thing somebody said.
SOCIAL_QUIET = 10.0

# Play mode: how long Poco stays in a conversation after being spoken to.
# Without this he answers the whole room, because in play mode everything said
# is treated as said to him - which is true one-to-one and badly false in a
# hall full of people. Saying his name opens the window; every exchange inside
# it pushes it out again, so a real conversation never has to keep saying it.
ENGAGED_SECONDS = 45.0


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
        cooldown: float | None = None,
        use_memory: bool = False,
        mode: str = "social",
    ):
        self.on_event = on_event
        self.robot = robot
        self.voice = voice
        self.camera = camera
        self.mic = mic
        self.model = model
        self.effort = effort
        # Social mode wants a gap between suggestions; play mode is a
        # back-and-forth and wants none.
        self.cooldown = (SOCIAL_QUIET if mode == "social" else 0.0) \
            if cooldown is None else cooldown
        self.use_memory = use_memory
        self.mode = mode
        self.asked = threading.Event()   # the adult pressed "Ask Poco"
        self.engaged = False             # play mode: in a conversation with him

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
        self._coaches: dict = {}          # one per mode, both kept warm
        self._memories: dict = {}         # one store per mode, kept separate
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
        last_heard = 0.0
        engaged_until = 0.0
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
            if self.mode not in self._coaches:
                self._coaches[self.mode] = Coach(effort=self.effort, mode=self.mode)
            detector = self._detector
            listener = SpeechListener(model_name=self.model, device=self.mic)
            ctx = SocialContext(
                suggest_cooldown=(SOCIAL_QUIET if self.mode == "social" else 0.0)
            )
            coach = self._coaches[self.mode]
            # Separate stores per mode. Social mode remembers other people's
            # friends; play mode remembers the child Poco belongs to. Mixing
            # those in one pile would be wrong in both directions.
            memory = None
            if self.use_memory:
                if self.mode not in self._memories:
                    self._memories[self.mode] = Memory(
                        assistant_name="Poco" if self.mode == "social" else "Poco-child"
                    )
                memory = self._memories[self.mode]
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
                    last_heard = now
                    if ctx.addressed(utterance.text):
                        engaged_until = now + ENGAGED_SECONDS

                # Collect the finished answer first, so the check below can use
                # the slot it frees on this same frame.
                if pending is not None and pending.done():
                    self._deliver(pending, listener, ctx)
                    # Answering keeps the conversation open, so a child talking
                    # with him does not have to keep saying his name.
                    engaged_until = max(engaged_until, time.monotonic() + ENGAGED_SECONDS)
                    self.thinking = False
                    pending = None

                # Checked every frame, not just when an utterance lands.
                # Nested in the `if utterance` above, anything said while Poco
                # was still thinking about the previous line was added to the
                # conversation and then never asked about - no call was made
                # for it, and nothing retried. Two questions in a row meant the
                # second was answered late, with the answer to the first.
                settle = SETTLE_SECONDS if self.mode == "social" else PLAY_SETTLE
                # Never start thinking while they are still talking. The
                # endpointer has not cut yet, so anything Poco said now would
                # land on top of them mid-sentence.
                quiet = now - last_heard >= settle
                if self.mode == "social":
                    # Only here does a robot need to wait for a real stop.
                    quiet = quiet and not listener.speaking
                asked = self.asked.is_set()
                # In play mode, only answer while in a conversation with him.
                listening = self.mode != "play" or now < engaged_until
                self.engaged = listening
                if pending is None and last_heard and (asked or quiet) \
                        and (asked or listening) \
                        and (asked or ctx.ready_to_suggest(now)):
                    self.asked.clear()
                    self.thinking = True
                    pending = pool.submit(self._think, coach, ctx, memory, now)
                    ctx.mark_suggested(now)
                    self.thinking = True
                    pending = pool.submit(self._think, coach, ctx, memory, now)
                    ctx.mark_suggested(now)

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

    def _deliver(self, pending: Future, listener, ctx=None) -> None:
        try:
            suggestion = pending.result().suggestion
        except Exception as exc:
            self.last_error = f"coach: {exc}"
            return
        if self.robot is not None:
            self.robot.perform(suggestion.gesture, suggestion.belly)
        # Social mode only. There, Poco is beside somebody else's conversation
        # and must not cut in. In play mode the child asked him something, and
        # staying silent because they are still making noise reads as broken.
        if (self.mode == "social" and suggestion.say
                and listener is not None and listener.speaking):
            # They started again while Poco was thinking. The belly and the
            # movement still happen; the words wait for another opening rather
            # than cutting across them.
            print(f"  [{suggestion.kind}] held back (they are talking): "
                  f"{suggestion.say}", flush=True)
            return
        if suggestion.say and self.voice is not None:
            # The listener is handed over so Poco's microphone is deaf while its
            # own voice is in the room.
            self.voice.say_async(suggestion.say, emotion=suggestion.belly,
                                 listener=listener)
        if suggestion.say and ctx is not None:
            # Poco's own turn goes into the history too, so the next thing said
            # to him has something to refer back to.
            ctx.add_poco_line(suggestion.say)
        print(f"  [{suggestion.kind}] {suggestion.say or '(quiet)'}"
              f"  -> {suggestion.gesture} / {suggestion.belly}", flush=True)
        # PocoEvent.feeling is "the emotion of the person Poco is facing", so it
        # is what the camera read - not the face Poco chose to pull. Those are
        # different things now that he can look excited at someone who is calm,
        # and the app's session history is a record of how well he reads people.
        feeling = self.face or (ctx.current_emotion()[0] if ctx else None) or "neutral"
        self.on_event(event_for(feeling, suggestion.say, suggestion.reason))

    def telemetry(self) -> dict:
        """Everything the debug page shows."""
        return {
            "running": self.running,
            "phase": self.phase,
            "mode": self.mode,
            "engaged": self.engaged,
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
