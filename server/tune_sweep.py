"""Sweep Poco's announcement thresholds against a recorded session.

    uv run emotion_demo.py --camera 0 --record session.mp4
    uv run tune_sweep.py session.mp4

Face detection and classification are the slow part and they do not depend on
any of the thresholds, so the video is decoded once and every setting is scored
against the cached per-frame probabilities.

The state machine itself is the real one from EmotionDetector, so what this
prints is what the robot would have said.
"""

import argparse
import csv
import itertools
import os

import cv2
import numpy as np

from poco.vision import EMOTIONS, EmotionDetector
from poco.vision.emotion import Face


def analyze(path: str) -> tuple[list[tuple[float, np.ndarray | None]], float]:
    """Decode the recording once, returning (timestamp, probabilities) per frame."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"Could not open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    det = EmotionDetector()
    frames: list[tuple[float, np.ndarray | None]] = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        box = det._largest_face(frame)
        if box is None:
            frames.append((i / fps, None))
        else:
            crop = det._crop(frame, box)
            _, scores = det._classifier.predict_emotions(
                cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), logits=False
            )
            frames.append((i / fps, det._to_poco(scores)))
        i += 1
        if i % 300 == 0:
            print(f"  ...{i} frames", flush=True)
    cap.release()
    faces = sum(1 for _, p in frames if p is not None)
    print(f"{len(frames)} frames, {len(frames) / fps:.1f}s, face in {faces / max(len(frames), 1):.0%}\n")
    return frames, fps


def score(frames, min_confidence, min_margin, hold_seconds, smoothing):
    """Replay the real state machine over cached probabilities."""
    det = EmotionDetector.__new__(EmotionDetector)  # no model loading needed
    det.smoothing = smoothing
    det.min_confidence = min_confidence
    det.min_margin = min_margin
    det.hold_seconds = hold_seconds
    det._smoothed = None
    det._candidate = None
    det._candidate_since = 0.0
    det.current = None

    events = []
    for t, probs in frames:
        if probs is None:
            det._reset()
            continue
        det._smoothed = (probs if det._smoothed is None
                         else smoothing * probs + (1 - smoothing) * det._smoothed)
        face = Face(box=(0, 0, 0, 0),
                    raw=dict(zip(EMOTIONS, probs.tolist())),
                    smoothed=dict(zip(EMOTIONS, det._smoothed.tolist())))
        ev = det._update_state(face, t)
        if ev:
            events.append((t, ev.emotion))
    return events


def load_labels(recording: str) -> list[tuple[float, float, str]]:
    """Spans written by `emotion_demo.py --guide`, if there are any."""
    path = recording.rsplit(".", 1)[0] + ".labels.csv"
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        spans = [(float(r["start"]), float(r["end"]), r["emotion"]) for r in csv.DictReader(fh)]
    print(f"{len(spans)} labelled spans from {os.path.basename(path)}\n")
    return spans


def grade(events, spans):
    """Score announcements against what was actually being asked for.

    An announcement in the gap between two prompts is neither right nor wrong:
    the face is mid-change and there is no truth to compare it to.
    """
    right = wrong = 0
    covered = set()
    for t, emotion in events:
        for i, (a, b, want) in enumerate(spans):
            if a <= t <= b:
                if emotion == want:
                    right += 1
                    covered.add(i)
                else:
                    wrong += 1
                break
    return right, wrong, len(spans) - len(covered)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("recording")
    ap.add_argument("--churn-seconds", type=float, default=2.0,
                    help="two announcements closer than this count as babble")
    args = ap.parse_args()

    frames, fps = analyze(args.recording)
    duration = len(frames) / fps
    spans = load_labels(args.recording)

    grid = list(itertools.product(
        (0.40, 0.45, 0.50, 0.55, 0.60),   # min_confidence
        (0.00, 0.10, 0.15, 0.20, 0.25),   # min_margin
        (0.8, 1.2, 1.6, 2.0),             # hold_seconds
        (0.15, 0.20, 0.30),               # smoothing
    ))
    print(f"{len(grid)} settings over {duration:.0f}s\n")
    header = (f"{'conf':>5} {'gap':>5} {'hold':>5} {'smooth':>7} "
              f"{'says':>5} {'/min':>6} {'churn':>6}")
    print(header + (f" {'right':>6} {'wrong':>6} {'missed':>7}" if spans else f" {'kinds':>6}  emotions"))
    print("-" * (len(header) + 22))

    rows = []
    for conf, margin, hold, smooth in grid:
        ev = score(frames, conf, margin, hold, smooth)
        gaps = [b[0] - a[0] for a, b in zip(ev, ev[1:])]
        churn = sum(1 for g in gaps if g < args.churn_seconds)
        kinds = len({e for _, e in ev})
        right, wrong, missed = grade(ev, spans) if spans else (0, 0, 0)
        rows.append((conf, margin, hold, smooth, len(ev), churn, kinds, ev, right, wrong, missed))

    # A good setting says something occasionally, rarely contradicts itself
    # within a couple of seconds, and can still name a range of feelings.
    shown = sorted(rows, key=lambda r: (-(r[8] - r[9]), r[5])) if spans else rows
    for conf, margin, hold, smooth, n, churn, kinds, ev, right, wrong, missed in shown[:40]:
        line = (f"{conf:5.2f} {margin:5.2f} {hold:5.1f} {smooth:7.2f} "
                f"{n:5d} {n / duration * 60:6.1f} {churn:6d}")
        if spans:
            print(line + f" {right:6d} {wrong:6d} {missed:7d}")
        else:
            counts = {}
            for _, e in ev:
                counts[e] = counts.get(e, 0) + 1
            print(line + f" {kinds:6d}  " +
                  " ".join(f"{k}:{v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))

    if spans:
        print("\nBest by (right - wrong), then fewest contradictions:")
        for conf, margin, hold, smooth, n, churn, kinds, ev, right, wrong, missed in shown[:8]:
            print(f"  conf {conf:.2f}  gap {margin:.2f}  hold {hold:.1f}  smooth {smooth:.2f}"
                  f"  -> {right} right, {wrong} wrong, {missed}/{len(spans)} spans missed, "
                  f"{churn} churn")
    else:
        print("\nNo labels found - run with --guide to score correctness, not just churn.")


if __name__ == "__main__":
    main()
