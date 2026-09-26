"""Live microphone demo of Poco's speech transcription.

    uv run speech_demo.py --list-mics
    uv run speech_demo.py --mic C270
    uv run speech_demo.py --mic C270 --seconds 30 --model small.en

Speak, pause, and each utterance is printed as Poco would receive it.
Ctrl-C to stop.
"""

import argparse
import time

import sounddevice as sd

from poco.audio import SpeechListener
from poco.devices import MIC


def list_mics() -> None:
    default = sd.default.device[0]
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            mark = "  <- default" if i == default else ""
            print(f"  {i}: {d['name']}{mark}")


def meter(level_db: float, speaking: bool, width: int = 30) -> str:
    lo, hi = -60.0, 0.0
    pos = int((max(lo, min(hi, level_db)) - lo) / (hi - lo) * width)
    bar = "".join("#" if i < pos else "-" for i in range(width))
    return f"[{bar}] {level_db:6.1f} dB  {'SPEAKING' if speaking else '        '}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mic", default=MIC, help="device name fragment")
    ap.add_argument("--list-mics", action="store_true")
    ap.add_argument("--model", default="base.en", help="tiny.en / base.en / small.en")
    ap.add_argument("--seconds", type=float, help="stop after this long")
    ap.add_argument("--silence", type=float, default=0.7, help="pause that ends an utterance")
    ap.add_argument("--speech-threshold", type=float, default=0.5,
                    help="Silero speech probability cutoff, 0..1")
    ap.add_argument("--quiet", action="store_true", help="no level meter, just the transcript")
    args = ap.parse_args()

    if args.list_mics:
        list_mics()
        return

    listener = SpeechListener(
        model_name=args.model, device=args.mic,
        silence_seconds=args.silence, speech_threshold=args.speech_threshold,
    )
    print(f"loading {args.model}...", flush=True)
    listener.start()
    print(f"listening on {args.mic or 'default mic'}. speak, then pause.\n", flush=True)

    started = time.monotonic()
    utterances = []
    try:
        while True:
            now = time.monotonic()
            u = listener.poll()
            if u:
                utterances.append(u)
                lag = now - u.end
                print(f"\r[{u.start - started:6.1f}s] ({u.duration:4.1f}s, conf {u.confidence:.0%}, "
                      f"+{lag:.1f}s) {u.text}", flush=True)
            elif not args.quiet:
                print("\r" + meter(listener.level_db, listener.speaking),
                      end="", flush=True)
            if args.seconds and now - started >= args.seconds:
                break
            time.sleep(0.03)
    except KeyboardInterrupt:
        pass
    finally:
        listener.stop()

    elapsed = time.monotonic() - started
    words = sum(len(u.text.split()) for u in utterances)
    print(f"\n\n{len(utterances)} utterance(s), {words} words in {elapsed:.0f}s")
    if utterances:
        print(f"median confidence "
              f"{sorted(u.confidence for u in utterances)[len(utterances) // 2]:.0%}")


if __name__ == "__main__":
    main()
