"""Facial emotion detection for Poco.

Pipeline per frame:
  YuNet face detector -> crop the largest face -> HSEmotion classifier
  -> exponential smoothing -> "stable emotion" events.

The robot should react to how someone *is* feeling, not to every single-frame
flicker, so an emotion is only announced once it has been the clear winner for
`hold_seconds`.
"""

from __future__ import annotations

import time
import urllib.request  # noqa: F401  hsemotion_onnx uses urllib.request without importing it
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from hsemotion_onnx.facial_emotions import HSEmotionRecognizer

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)

# The ids the iPad app uses, from src/poco/emotions.ts. The app knows twelve;
# these are the six this classifier can actually tell apart from a face. The
# others (calm, excited, tired, silly, shy, frustrated) are teaching tiles the
# adult triggers, not things a camera reads - notably `calm`, which looks
# identical to `neutral` and is a judgement about someone, not an expression.
EMOTIONS = ["happy", "sad", "angry", "surprised", "worried", "neutral"]

# HSEmotion's eight classes folded onto those six. Two are deliberately absent:
#
#   Disgust is dropped. The model cannot separate it from anger - a disgusted
#   face scored Anger 56% / Disgust 10% - so Poco would be teaching a name it
#   cannot reliably attach to a face. Its probability is renormalised away in
#   _to_poco rather than being dumped onto angry.
#
#   Contempt counts as neutral. On a resting face the model puts 10-11% on it,
#   and folding that into a real feeling was enough to make Poco call a calm
#   face "disgusted".
_MODEL_TO_POCO = {
    "Anger": "angry",
    "Contempt": "neutral",
    "Fear": "worried",  # the app renamed scared -> worried
    "Happiness": "happy",
    "Neutral": "neutral",
    "Sadness": "sad",
    "Surprise": "surprised",
}


@dataclass
class Face:
    box: tuple[int, int, int, int]  # x, y, w, h
    raw: dict[str, float]  # this frame's probabilities
    smoothed: dict[str, float]  # probabilities after temporal smoothing

    @property
    def emotion(self) -> str:
        return max(self.smoothed, key=self.smoothed.get)

    @property
    def confidence(self) -> float:
        return self.smoothed[self.emotion]


@dataclass
class EmotionEvent:
    emotion: str
    confidence: float
    timestamp: float = field(default_factory=time.time)


class EmotionDetector:
    def __init__(
        self,
        model_name: str = "enet_b0_8_best_vgaf",
        smoothing: float = 0.15,
        min_confidence: float = 0.40,
        min_margin: float = 0.0,
        hold_seconds: float = 1.6,
        face_score_threshold: float = 0.8,
    ):
        """
        smoothing:       EMA weight of the newest frame (lower = steadier, slower).
        min_confidence:  smoothed probability required before announcing.
        min_margin:      how far the top emotion must beat the runner-up. The model
                         often splits a resting face between sad and disgusted; a
                         near-tie is a guess, and for a kid who is being taught what
                         these faces mean a confident wrong label is worse than
                         Poco saying nothing. 0.0 keeps every winner.
        hold_seconds:    how long the same emotion must stay on top to be announced.
        """
        if not YUNET_PATH.exists():
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(YUNET_URL, YUNET_PATH)
        self._detector = cv2.FaceDetectorYN.create(
            str(YUNET_PATH), "", (320, 320), face_score_threshold
        )
        self._classifier = HSEmotionRecognizer(model_name=model_name)
        self.smoothing = smoothing
        self.min_confidence = min_confidence
        self.min_margin = min_margin
        self.hold_seconds = hold_seconds

        self._smoothed: np.ndarray | None = None
        self._candidate: str | None = None
        self._candidate_since = 0.0
        self.current: str | None = None  # last announced emotion

    def process(
        self, frame_bgr: np.ndarray, now: float | None = None
    ) -> tuple[Face | None, EmotionEvent | None]:
        """Analyze one frame. Returns the tracked face (if any) and an event
        when the stable emotion changes.

        `now` overrides the clock, so a recorded session can be replayed at any
        speed and still time `hold_seconds` against the video rather than the
        wall clock."""
        if now is None:
            now = time.monotonic()
        box = self._largest_face(frame_bgr)
        if box is None:
            self._reset()
            return None, None

        crop = self._crop(frame_bgr, box)
        _, scores = self._classifier.predict_emotions(
            cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), logits=False
        )
        probs = self._to_poco(scores)

        if self._smoothed is None:
            self._smoothed = probs
        else:
            self._smoothed = self.smoothing * probs + (1 - self.smoothing) * self._smoothed

        face = Face(
            box=box,
            raw=dict(zip(EMOTIONS, probs.tolist())),
            smoothed=dict(zip(EMOTIONS, self._smoothed.tolist())),
        )
        return face, self._update_state(face, now)

    def _update_state(self, face: Face, now: float) -> EmotionEvent | None:
        top = face.emotion
        runner_up = max((p for name, p in face.smoothed.items() if name != top), default=0.0)
        if face.confidence < self.min_confidence or face.confidence - runner_up < self.min_margin:
            self._candidate = None
            return None
        if top != self._candidate:
            self._candidate, self._candidate_since = top, now
            return None
        if top != self.current and now - self._candidate_since >= self.hold_seconds:
            self.current = top
            return EmotionEvent(top, face.confidence)
        return None

    def _reset(self) -> None:
        self._smoothed = None
        self._candidate = None
        self.current = None

    def _largest_face(self, frame: np.ndarray) -> tuple[int, int, int, int] | None:
        h, w = frame.shape[:2]
        self._detector.setInputSize((w, h))
        _, faces = self._detector.detect(frame)
        if faces is None or len(faces) == 0:
            return None
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
        return int(x), int(y), int(fw), int(fh)

    @staticmethod
    def _crop(frame: np.ndarray, box: tuple[int, int, int, int], margin: float = 0.15) -> np.ndarray:
        x, y, w, h = box
        mx, my = int(w * margin), int(h * margin)
        H, W = frame.shape[:2]
        x0, y0 = max(0, x - mx), max(0, y - my)
        x1, y1 = min(W, x + w + mx), min(H, y + h + my)
        return frame[y0:y1, x0:x1]

    def _to_poco(self, scores: np.ndarray) -> np.ndarray:
        """Fold the model's eight classes into Poco's, renormalising over what
        is left so the dropped ones do not quietly deflate every score."""
        out = np.zeros(len(EMOTIONS), dtype=np.float32)
        for i, p in enumerate(scores):
            label = _MODEL_TO_POCO.get(self._classifier.idx_to_class[i])
            if label is not None:
                out[EMOTIONS.index(label)] += p
        total = out.sum()
        return out / total if total > 0 else out
