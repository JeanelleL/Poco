"""Live webcam demo of Poco's emotion detection.

    uv run emotion_demo.py --list-cameras
    uv run emotion_demo.py --camera 0
    uv run emotion_demo.py --camera 0 --headless --seconds 10
    uv run emotion_demo.py --camera 0 --record session.mp4
    uv run emotion_demo.py --replay session.mp4 --headless --hold-seconds 1.5

Recording a session once and replaying it is the way to compare thresholds:
the same faces go through every setting, so the numbers are actually
comparable. Replay times `hold_seconds` against the video, not the wall clock,
so it gives the same answer at any speed.

In the live window, press q or Esc to quit. The detection thresholds can be
nudged while it runs so they can be tuned against a real face:

    [ ]   min_confidence   -/+ 0.05
    ; '   min_margin       -/+ 0.05  (gap the winner needs over the runner-up)
    - =   hold_seconds     -/+ 0.1
    , .   smoothing        -/+ 0.05
    r     forget the current emotion and start over
"""

import argparse
import time
from collections import Counter

import cv2

from poco.devices import CAMERA
from poco.vision import EMOTIONS, EmotionDetector

# BGR colors for the overlay (roughly what the belly LEDs could show).
COLORS = {
    "happy": (0, 215, 255),
    "sad": (200, 90, 30),
    "angry": (40, 40, 220),
    "surprised": (220, 120, 255),
    "worried": (161, 119, 255),
    "neutral": (158, 158, 150),
}

WARMUP_SECONDS = 2.5

# With --guide, the first stretch of each prompt is the face still arriving.
# Only the settled remainder is labelled, so the sweep is not scored against
# a face that is halfway between two expressions.
SETTLE_SECONDS = 2.0


class Guide:
    """Walks through the emotions on a timer and records what was asked for."""

    def __init__(self, hold_each: float, lead_in: float = 3.0):
        self.order = ["neutral", "happy", "sad", "surprised", "angry", "worried", "neutral"]
        self.hold_each = hold_each
        # Never let the settle-in eat the whole prompt, or the span inverts.
        self.settle = min(SETTLE_SECONDS, hold_each * 0.25)
        self.lead_in = lead_in
        self.spans: list[tuple[float, float, str]] = []
        self._announced: str | None = None

    @property
    def total(self) -> float:
        return self.lead_in + self.hold_each * len(self.order)

    def asked_at(self, t: float) -> str | None:
        if t < self.lead_in:
            return None
        i = int((t - self.lead_in) // self.hold_each)
        return self.order[i] if i < len(self.order) else None

    def tick(self, t: float) -> str:
        """Returns the on-screen instruction, noting each span as it starts."""
        want = self.asked_at(t)
        if want is None:
            return f"get ready... {max(0.0, self.lead_in - t):.0f}"
        i = int((t - self.lead_in) // self.hold_each)
        start = self.lead_in + i * self.hold_each
        key = f"{i}:{want}"
        if key != self._announced:
            self._announced = key
            self.spans.append((start + self.settle, start + self.hold_each, want))
            print(f"[{t:5.1f}s] make a {want.upper()} face", flush=True)
        left = start + self.hold_each - t
        return f"{want.upper()}  ({left:.0f}s)"

    def save(self, path: str) -> None:
        with open(path, "w") as fh:
            fh.write("start,end,emotion\n")
            for a, b, e in self.spans:
                fh.write(f"{a:.3f},{b:.3f},{e}\n")
        print(f"saved {path} ({len(self.spans)} labelled spans)")


def list_cameras(max_index: int = 5) -> None:
    """Snapshot every camera. Each one gets a couple of seconds first: the
    first frames off a webcam come out black while auto-exposure ramps up."""
    for i in range(max_index):
        cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
        if not cap.isOpened():
            cap.release()
            continue
        frame = None
        t0 = time.monotonic()
        while time.monotonic() - t0 < WARMUP_SECONDS:
            ok, f = cap.read()
            if ok:
                frame = f
        cap.release()
        if frame is None:
            print(f"camera {i}: opened but returned no frames")
            continue
        h, w = frame.shape[:2]
        print(f"camera {i}: {w}x{h}  (mean brightness {frame.mean():.0f})")
        cv2.imwrite(f"camera_{i}.jpg", frame)
    print("Saved a snapshot per camera (camera_N.jpg) so you can tell which is the C270.")


def draw(frame, face, fps, detector):
    if face is not None:
        x, y, w, h = face.box
        color = COLORS[face.emotion]
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        cv2.putText(frame, f"{face.emotion} {face.confidence:.0%}", (x, max(20, y - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        for i, name in enumerate(EMOTIONS):
            p = face.smoothed[name]
            y0 = 20 + i * 22
            cv2.rectangle(frame, (10, y0), (10 + int(p * 150), y0 + 16), COLORS[name], -1)
            cv2.putText(frame, name, (170, y0 + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    else:
        cv2.putText(frame, "no face", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    params = (f"conf>{detector.min_confidence:.2f} [ ]   "
              f"gap>{detector.min_margin:.2f} ; '   "
              f"hold {detector.hold_seconds:.1f}s - =   "
              f"smooth {detector.smoothing:.2f} , .")
    cv2.putText(frame, params, (10, frame.shape[0] - 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, f"{fps:.0f} fps", (10, frame.shape[0] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)


def handle_key(key: int, detector: EmotionDetector) -> bool:
    """Apply a tuning keystroke. Returns False when it is time to quit."""
    if key in (ord("q"), 27):
        return False
    if key == ord("["):
        detector.min_confidence = round(max(0.05, detector.min_confidence - 0.05), 2)
    elif key == ord("]"):
        detector.min_confidence = round(min(0.95, detector.min_confidence + 0.05), 2)
    elif key == ord(";"):
        detector.min_margin = round(max(0.0, detector.min_margin - 0.05), 2)
    elif key == ord("'"):
        detector.min_margin = round(min(0.95, detector.min_margin + 0.05), 2)
    elif key == ord("-"):
        detector.hold_seconds = round(max(0.0, detector.hold_seconds - 0.1), 1)
    elif key == ord("="):
        detector.hold_seconds = round(detector.hold_seconds + 0.1, 1)
    elif key == ord(","):
        detector.smoothing = round(max(0.05, detector.smoothing - 0.05), 2)
    elif key == ord("."):
        detector.smoothing = round(min(1.0, detector.smoothing + 0.05), 2)
    elif key == ord("r"):
        detector.current = None
    else:
        return True
    print(f"  min_confidence={detector.min_confidence}  min_margin={detector.min_margin}  "
          f"hold_seconds={detector.hold_seconds}  smoothing={detector.smoothing}", flush=True)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=CAMERA,
                    help="see poco/devices.py")
    ap.add_argument("--list-cameras", action="store_true")
    ap.add_argument("--headless", action="store_true", help="no preview window (for ssh / background runs)")
    ap.add_argument("--seconds", type=float, help="stop after this long and print a summary")
    ap.add_argument("--min-confidence", type=float, default=0.40)
    ap.add_argument("--min-margin", type=float, default=0.0,
                    help="gap the top emotion needs over the runner-up before announcing")
    ap.add_argument("--record", metavar="PATH", help="save this session's frames for replay")
    ap.add_argument("--guide", action="store_true",
                    help="with --record: prompt through each emotion and label the recording")
    ap.add_argument("--hold-each", type=float, default=8.0, help="--guide seconds per emotion")
    ap.add_argument("--replay", metavar="PATH", help="read frames from a recording instead of a camera")
    ap.add_argument("--hold-seconds", type=float, default=1.6)
    ap.add_argument("--smoothing", type=float, default=0.15)
    args = ap.parse_args()

    if args.list_cameras:
        list_cameras()
        return

    if args.replay:
        cap = cv2.VideoCapture(args.replay)
        if not cap.isOpened():
            raise SystemExit(f"Could not open recording {args.replay}")
        source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    else:
        cap = cv2.VideoCapture(args.camera, cv2.CAP_AVFOUNDATION)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        if not cap.isOpened():
            raise SystemExit(f"Could not open camera {args.camera}")
        source_fps = 30.0

    detector = EmotionDetector(
        min_confidence=args.min_confidence,
        min_margin=args.min_margin,
        hold_seconds=args.hold_seconds,
        smoothing=args.smoothing,
    )

    if not args.replay:
        # The first frames are black while the webcam's auto-exposure settles;
        # feeding those to the detector just produces a "no face" spell at startup.
        t0 = time.monotonic()
        while time.monotonic() - t0 < WARMUP_SECONDS:
            cap.read()

    guide = Guide(args.hold_each) if args.guide else None
    if guide is not None:
        if not args.record:
            raise SystemExit("--guide needs --record so the labels have a recording to describe")
        print(f"{guide.total:.0f}s guided session: " + " -> ".join(guide.order))

    writer = None
    if args.record:
        ok, probe = cap.read()
        if not ok:
            raise SystemExit("Camera gave no frames to record")
        h, w = probe.shape[:2]
        writer = cv2.VideoWriter(args.record, cv2.VideoWriter_fourcc(*"mp4v"), source_fps, (w, h))
        print(f"recording {w}x{h} to {args.record}")

    started = time.monotonic()
    last = started
    fps = 0.0
    frames = 0
    faces_seen = 0
    time_by_emotion: Counter[str] = Counter()
    events: list[tuple[float, str, float]] = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if writer is not None:
            writer.write(frame)

        # On replay the frame index is the only honest clock: the file is read
        # as fast as the CPU allows, which is nothing like the original pace.
        now = started + frames / source_fps if args.replay else time.monotonic()
        face, event = detector.process(frame, now)

        dt = now - last
        fps = 0.9 * fps + 0.1 / max(dt, 1e-6)
        last = now
        frames += 1
        if face is not None:
            faces_seen += 1
            time_by_emotion[face.emotion] += dt

        if event:
            # This is where Poco will trigger the matching gesture / belly color / speech.
            events.append((now - started, event.emotion, event.confidence))
            print(f'[{now - started:5.1f}s] Poco: "Your friend looks {event.emotion}!" '
                  f'({event.confidence:.0%})', flush=True)

        if guide is not None:
            # Paced by frame index, not the clock: the labels have to line up with
            # the recording, and the camera does not deliver exactly source_fps.
            guide_t = frames / source_fps
            instruction = guide.tick(guide_t)
            cv2.putText(frame, instruction, (frame.shape[1] // 2 - 120, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            if guide_t >= guide.total:
                break

        if not args.headless:
            draw(frame, face, fps, detector)
            cv2.imshow(f"Poco emotion (camera {args.camera})", frame)
            if not handle_key(cv2.waitKey(1) & 0xFF, detector):
                break
        if args.seconds and now - started >= args.seconds:
            break

    elapsed = (frames / source_fps) if args.replay else (time.monotonic() - started)
    cap.release()
    if writer is not None:
        writer.release()
        print(f"saved {args.record}")
    if guide is not None:
        guide.save(args.record.rsplit(".", 1)[0] + ".labels.csv")
    cv2.destroyAllWindows()

    gaps = [b[0] - a[0] for a, b in zip(events, events[1:])]
    print(f"\n{frames} frames in {elapsed:.1f}s ({frames / max(elapsed, 1e-6):.1f} fps), "
          f"a face in {faces_seen / max(frames, 1):.0%} of them")
    if time_by_emotion:
        print("time on top:", "  ".join(
            f"{name} {secs / elapsed:.0%}" for name, secs in time_by_emotion.most_common()))
    if gaps:
        churn = sum(1 for g in gaps if g < 2.0)
        print(f"gap between announcements: median {sorted(gaps)[len(gaps) // 2]:.1f}s, "
              f"shortest {min(gaps):.1f}s, {churn} under 2s")
    print(f"{len(events)} announcement(s) ({len(events) / max(elapsed, 1e-6) * 60:.1f}/min) at "
          f"min_confidence={detector.min_confidence} min_margin={detector.min_margin} "
          f"hold_seconds={detector.hold_seconds} smoothing={detector.smoothing}")


if __name__ == "__main__":
    main()
