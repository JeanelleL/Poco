"""Social mode: Poco watches a face and listens, and builds the context an LLM
would act on.

    uv run social_demo.py --mic MacBook
    uv run social_demo.py --mic MacBook --headless --seconds 60

Each time the other person finishes a sentence it is paired with how they
looked while saying it, and printed as one turn. Once there is something worth
reacting to and Poco has not just spoken, the assembled prompt is shown - that
is the handoff point for the LLM, the gesture and the voice.

Press q or Esc to quit.
"""

import argparse
import time
from concurrent.futures import Future, ThreadPoolExecutor

import cv2

from emotion_demo import COLORS, WARMUP_SECONDS, draw
from poco.audio import SpeechListener
from poco.devices import CAMERA, MIC
from poco.bridge import action_for, event_for, move_seconds
from poco.social import Coach, Memory, SocialContext
from poco.voice import Voice
from poco.vision import EmotionDetector


def overlay(frame, ctx, listener, turn, suggestion=None):
    """Show what Poco is hearing and the last thing it understood."""
    h, w = frame.shape[:2]
    if listener.muted:
        state, colour = "Poco speaking", (0, 255, 255)
    elif listener.speaking:
        state, colour = "hearing speech", (0, 220, 0)
    else:
        state, colour = "listening", (160, 160, 160)
    cv2.putText(frame, state, (w - 200, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)
    if turn is not None:
        colour = COLORS.get(turn.emotion, (200, 200, 200))
        text = turn.text if len(turn.text) < 64 else turn.text[:61] + "..."
        cv2.putText(frame, text, (10, h - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
    if suggestion is not None and suggestion.say:
        cv2.putText(frame, suggestion.say[:62], (10, h - 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=CAMERA)
    ap.add_argument("--mic", default=MIC, help="device name fragment")
    ap.add_argument("--model", default="base.en")
    ap.add_argument("--seconds", type=float)
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--cooldown", type=float, default=20.0,
                    help="minimum gap between Poco's suggestions")
    ap.add_argument("--no-llm", action="store_true",
                    help="build the context but do not call Claude")
    ap.add_argument("--effort", default="low", help="low / medium / high")
    ap.add_argument("--no-voice", action="store_true", help="print Poco's lines instead of speaking them")
    ap.add_argument("--memory", action="store_true",
                    help="remember facts about the friend between sessions "
                         "(off by default: it stores personal details about "
                         "someone who never agreed to be remembered)")
    ap.add_argument("--style", type=float, default=1.0, help="ElevenLabs exaggeration, 0..1")
    ap.add_argument("--stability", type=float, default=0.5,
                    help="v3: 0.0 creative / 0.5 natural / 1.0 robust")
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.camera, cv2.CAP_AVFOUNDATION)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if not cap.isOpened():
        raise SystemExit(f"Could not open camera {args.camera}")

    detector = EmotionDetector()
    listener = SpeechListener(model_name=args.model, device=args.mic)
    ctx = SocialContext(suggest_cooldown=args.cooldown)
    coach = None if args.no_llm else Coach(effort=args.effort)
    voice = None if (args.no_voice or args.no_llm) else Voice(
        style=args.style, stability=args.stability)
    memory = Memory() if (args.memory and not args.no_llm) else None
    if memory is not None:
        print(f"memory: {len(memory.all())} fact(s) recalled from previous conversations")

    def think(ctx_now):
        """Runs on the worker thread: recall, ask Claude, then store anything
        durable. All three are off the camera loop."""
        facts = [f.text for f in memory.all()] if memory is not None else []
        result = coach.suggest(ctx, ctx_now, memories=facts)
        if memory is not None and result.suggestion.remember:
            memory.remember_async(result.suggestion.remember)
        return result
    # Claude takes a couple of seconds to answer. That happens on its own thread
    # so the camera loop keeps running - freezing the video while Poco thinks
    # would lose the face at exactly the moment it matters.
    pool = ThreadPoolExecutor(max_workers=1)
    pending: Future | None = None
    suggestion = None

    print(f"loading {args.model}...", flush=True)
    listener.start()
    t0 = time.monotonic()
    while time.monotonic() - t0 < WARMUP_SECONDS:
        cap.read()
    print("social mode: watching and listening.\n", flush=True)

    started = time.monotonic()
    last_turn = None
    fps = 0.0
    last = started
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            now = time.monotonic()
            face, _ = detector.process(frame, now)
            ctx.observe_face(face, now)

            utterance = listener.poll()
            if utterance:
                last_turn = ctx.add_utterance(utterance)
                print(f"[{last_turn.end - started:6.1f}s] {last_turn.describe()}", flush=True)

                if ctx.ready_to_suggest(now) and pending is None:
                    if coach is None:
                        emotion, confidence = ctx.current_emotion(now=now)
                        print("\n  --- context (--no-llm) ---")
                        for line in ctx.to_prompt(now).splitlines():
                            print(f"  {line}")
                        print(f"  now: {emotion} ({confidence:.0%})\n", flush=True)
                    else:
                        pending = pool.submit(think, now)
                    # Marked at submit, not on reply: otherwise the cooldown does
                    # not start until Claude answers and a second call slips in.
                    ctx.mark_suggested(now)

            if pending is not None and pending.done():
                try:
                    result = pending.result()
                except Exception as exc:  # a dropped network should not stop Poco
                    print(f"  (coach unavailable: {exc})", flush=True)
                else:
                    suggestion = result.suggestion
                    if suggestion.say and voice is not None:
                        # Off the camera loop, and handing over the listener so
                        # Poco's microphone is deaf while its own voice is in
                        # the room.
                        voice.say_async(suggestion.say, emotion=suggestion.belly,
                                        listener=listener)
                    # The two shapes the app and the robot actually receive.
                    event = event_for(suggestion.belly, suggestion.say, suggestion.reason)
                    action = action_for(suggestion.gesture, suggestion.belly,
                                        suggestion.say)
                    spoken = f'says "{suggestion.say}"' if suggestion.say else "stays quiet"
                    print(f"\n  POCO {spoken}")
                    print(f"       -> app   {event.to_json()}")
                    print(f"       -> robot {action}  ({move_seconds(action['move']):.1f}s)")
                    if suggestion.remember:
                        print(f"       remembers: {suggestion.remember}")
                    print(f"       [{result.latency:.1f}s, {result.input_tokens} in "
                          f"+ {result.cached_tokens} cached, {result.output_tokens} out"
                          + (", REFUSED" if result.refused else "") + "]\n", flush=True)
                pending = None

            dt = now - last
            fps = 0.9 * fps + 0.1 / max(dt, 1e-6)
            last = now

            if not args.headless:
                draw(frame, face, fps, detector)
                overlay(frame, ctx, listener, last_turn, suggestion)
                cv2.imshow("Poco social mode", frame)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
            if args.seconds and now - started >= args.seconds:
                break
    except KeyboardInterrupt:
        pass
    finally:
        listener.stop()
        pool.shutdown(wait=False)
        cap.release()
        cv2.destroyAllWindows()

    elapsed = time.monotonic() - started
    print(f"\n{len(ctx.turns)} turn(s) in {elapsed:.0f}s at {fps:.0f} fps")
    if ctx.turns:
        seen = sum(1 for t in ctx.turns if t.emotion is not None)
        print(f"{seen}/{len(ctx.turns)} turns had the speaker's face in view")


if __name__ == "__main__":
    main()
