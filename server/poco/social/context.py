"""Puts Poco's eyes and ears on one timeline.

Social mode watches someone talking to Poco's user and works out what to
suggest. That needs both halves at once: the words carry the subject, the face
carries how they feel about it, and either alone is misleading. "I'm fine" said
by a sad face is the whole reason this robot exists.

The two pipelines already share a clock - EmotionDetector and SpeechListener
both stamp with time.monotonic() - so an utterance can be matched against the
faces seen while it was being said.

Note that EmotionEvent is not what gets matched here. Events fire only when the
stable emotion *changes*, so a whole sentence can pass without one. What is
needed is the face during those particular seconds, so every frame's reading is
recorded and the span is queried when the utterance lands.
"""

from __future__ import annotations

import time
from collections import Counter, deque
from dataclasses import dataclass, field

from poco.audio import Utterance
from poco.vision import Face

# How far back to keep per-frame face readings. Only needs to outlive the
# longest utterance, with room to spare.
TRACK_SECONDS = 60.0


@dataclass
class Turn:
    """Something the other person said, and how they looked saying it."""

    text: str
    start: float
    end: float
    speech_confidence: float
    emotion: str | None = None  # dominant expression across the utterance
    emotion_confidence: float = 0.0
    emotion_from: str | None = None  # where the face started...
    emotion_to: str | None = None  # ...and ended, when it moved
    face_seen: float = 0.0  # fraction of the utterance with a face in view
    timestamp: float = field(default_factory=time.time)

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def shifted(self) -> bool:
        return self.emotion_from is not None and self.emotion_from != self.emotion_to

    def describe(self) -> str:
        """One line, as the LLM should read it."""
        if self.emotion is None:
            return f'(face not visible) "{self.text}"'
        if self.shifted:
            look = f"looked {self.emotion_from}, then {self.emotion_to}"
        else:
            look = f"looked {self.emotion} ({self.emotion_confidence:.0%})"
        if self.face_seen < 0.5:
            # Say so, rather than letting a glimpse read as a steady observation.
            look += f", only in view {self.face_seen:.0%} of the time"
        return f'({look}) "{self.text}"'


class SocialContext:
    """Collects turns from the two pipelines and renders them for an LLM.

        ctx = SocialContext()
        # in the camera loop, every frame:
        ctx.observe_face(face)
        # whenever the listener produces one:
        turn = ctx.add_utterance(utterance)
    """

    def __init__(self, history: int = 8, suggest_cooldown: float = 20.0):
        """
        history:          turns kept for the LLM. Enough for the thread of a
                          conversation without burying the present moment.
        suggest_cooldown: minimum gap between Poco's suggestions. A robot that
                          comments on every sentence is noise, and the person
                          it is helping is already managing a conversation.
        """
        self.history = history
        self.suggest_cooldown = suggest_cooldown
        self.turns: deque[Turn] = deque(maxlen=history)
        self._track: deque[tuple[float, str | None, float]] = deque()
        # Start the clock now, not at zero: against a monotonic clock zero is
        # always long past, which had Poco commenting on the first sentence it
        # ever heard, before it had any sense of the conversation.
        self._last_suggested = time.monotonic()
        self._turns_at_last_suggestion = 0
        self._turns_seen = 0

    # -- inputs ------------------------------------------------------------

    def observe_face(self, face: Face | None, now: float | None = None) -> None:
        """Record this frame's reading. Call it every frame, face or not -
        the gaps matter too, since they mean the speaker was not in view."""
        now = time.monotonic() if now is None else now
        if face is None:
            self._track.append((now, None, 0.0))
        else:
            self._track.append((now, face.emotion, face.confidence))
        cutoff = now - TRACK_SECONDS
        while self._track and self._track[0][0] < cutoff:
            self._track.popleft()

    def add_utterance(self, utterance: Utterance) -> Turn:
        """Pair an utterance with the face that was on screen while it was said."""
        window = [(t, e, c) for t, e, c in self._track
                  if utterance.start <= t <= utterance.end]
        turn = Turn(
            text=utterance.text,
            start=utterance.start,
            end=utterance.end,
            speech_confidence=utterance.confidence,
        )
        if window:
            seen = [(e, c) for _, e, c in window if e is not None]
            turn.face_seen = len(seen) / len(window)
            if seen:
                counts = Counter(e for e, _ in seen)
                turn.emotion = counts.most_common(1)[0][0]
                matching = [c for e, c in seen if e == turn.emotion]
                turn.emotion_confidence = sum(matching) / len(matching)
                # Did the face move during the sentence? Compare the opening
                # third with the closing third - "started fine, ended upset" is
                # worth more to a coach than either half on its own.
                third = max(1, len(seen) // 3)
                turn.emotion_from = Counter(e for e, _ in seen[:third]).most_common(1)[0][0]
                turn.emotion_to = Counter(e for e, _ in seen[-third:]).most_common(1)[0][0]
        self.turns.append(turn)
        self._turns_seen += 1
        return turn

    # -- output ------------------------------------------------------------

    def ready_to_suggest(self, now: float | None = None) -> bool:
        """Enough time has passed, and there is something new to react to.

        Being spoken to skips the wait. The cooldown exists so Poco does not
        chatter over a conversation, but somebody who just asked him a question
        is owed an answer now - twenty seconds later is worse than never.
        """
        now = time.monotonic() if now is None else now
        if not self.turns or self._turns_seen <= self._turns_at_last_suggestion:
            return False
        if self.addressed(self.turns[-1].text):
            return True
        return now - self._last_suggested >= self.suggest_cooldown

    @staticmethod
    def addressed(text: str) -> bool:
        """Does this sound like it was said TO Poco rather than near him?

        Just his name, deliberately. Anything cleverer would have to guess, and
        guessing wrong in the talkative direction is what the cooldown is there
        to prevent. Someone who wants Poco's attention says his name - which is
        also what a child is taught to do.
        """
        lowered = text.lower()
        # Whisper hears "poco" as "pocko", "poko", "po co" often enough to matter.
        return any(name in lowered for name in ("poco", "poko", "pocko", "po co"))

    def mark_suggested(self, now: float | None = None) -> None:
        self._last_suggested = time.monotonic() if now is None else now
        self._turns_at_last_suggestion = self._turns_seen

    def current_emotion(self, seconds: float = 2.0,
                        now: float | None = None) -> tuple[str | None, float]:
        """How the person looks right now, for a gesture or belly colour that
        should track the moment rather than the last thing said."""
        now = time.monotonic() if now is None else now
        recent = [(e, c) for t, e, c in self._track if t >= now - seconds and e is not None]
        if not recent:
            return None, 0.0
        top = Counter(e for e, _ in recent).most_common(1)[0][0]
        matching = [c for e, c in recent if e == top]
        return top, sum(matching) / len(matching)

    def to_prompt(self, now: float | None = None) -> str:
        """The conversation so far, as the LLM should see it."""
        now = time.monotonic() if now is None else now
        if not self.turns:
            return "(nothing said yet)"
        lines = []
        for turn in self.turns:
            lines.append(f"[{now - turn.end:.0f}s ago] {turn.describe()}")
        return "\n".join(lines)
