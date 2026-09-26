"""Turns what Poco saw and heard into something to do about it.

The context goes to Claude, which answers with a gesture, a belly colour, and
usually nothing to say. Saying nothing is the common case on purpose: Poco is
standing next to someone who is already managing a live conversation, and an
interruption costs them their place in it. A suggestion has to be worth that.

Everything here is advice for Poco's user about the person they are talking to.
Poco never addresses that other person, and never narrates them out loud.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from poco.social.context import SocialContext

MODEL = "claude-opus-5"

# The movements the servos can actually perform, from src/poco/pocoClient.ts
# (and servos/gestures.py, where the keyframes live). Claude picks from this
# list only, and it is filtered below: anything that occupies the robot for
# eight seconds or more is a poor fit for a live conversation.
from poco.bridge import POCO_MOVES, SLOW_MOVES  # noqa: E402

GESTURES = sorted(m for m in POCO_MOVES if m not in SLOW_MOVES)
# Shown to Claude with how long each one takes, so a nine-second sway is chosen
# knowingly rather than by accident.
_GESTURE_MENU = ", ".join(f"{m} ({POCO_MOVES[m] / 1000:.0f}s)" for m in GESTURES)

SYSTEM = """You are Poco, a small robot penguin standing beside someone autistic \
while they talk with a friend. You watch the friend's face and listen to what \
they say. Your job is to help your person read the friend and respond well.

You are coaching YOUR PERSON, never talking to the friend. Address your person \
directly and quietly, as a friend leaning over to whisper. Never narrate or \
label the friend out loud to the room.

Most of the time, say nothing. Set `say` to null unless there is a specific, \
useful thing your person could do in the next few seconds. Silence is the right \
answer when the conversation is going fine, when nothing has changed, when you \
are unsure, or when you would only be restating what just happened. A robot that \
comments on every sentence makes the conversation harder, not easier.

When you do speak, give ONE concrete next move in plain, warm language, under 20 \
words. Prefer a question your person could ask over an observation about feelings.
  good: "You could ask him which exam he's most worried about."
  good: "He sounds tired. Maybe ask if he wants to sit down."
  bad:  "Your friend is displaying signs of stress and anxiety."
  bad:  "Ask him an open-ended question to show that you are listening."

The face reading comes from a camera and is often wrong, especially for neutral \
versus sad. Treat it as a weak hint. What the friend actually said matters more. \
If the words and the face disagree, trust the words and stay cautious. Never \
state the emotion reading as fact to your person.

Pick a gesture that matches the moment, and a belly colour naming the feeling \
you think the friend has. Both are always set, even when `say` is null - Poco is \
expressive continuously, and only speaks occasionally.

You may be given things Poco remembers about this friend from previous \
conversations. Use them to make your suggestion more specific, but never repeat \
one back as if the friend just said it.

Set `remember` only when this conversation revealed something durable about the \
friend that would help next time - how they tend to react, something ongoing in \
their life, what helps them. Write it as one plain sentence naming the person. \
Leave it null for anything that is only true right now, anything already \
remembered, and for the ordinary run of conversation. Most turns remember \
nothing."""


class Suggestion(BaseModel):
    """What Poco does next."""

    say: str | None = Field(
        description="What to whisper to your person, under 20 words, or null to stay quiet."
    )
    gesture: str = Field(
        description="The movement Poco makes, with how long each takes. "
        "Prefer short ones mid-conversation. One of: " + _GESTURE_MENU
    )
    belly: str = Field(
        description="The feeling you think the friend has: happy, sad, angry, "
        "surprised, worried, or neutral."
    )
    reason: str = Field(
        description="One short line on why, for the log. Never spoken aloud."
    )
    remember: str | None = Field(
        default=None,
        description="A durable fact about the friend worth keeping for next "
        "time, as one sentence naming them, or null. Usually null.",
    )


@dataclass
class CoachResult:
    suggestion: Suggestion
    latency: float
    input_tokens: int  # billed at full rate; the cached prefix is not counted here
    output_tokens: int
    cached_tokens: int = 0
    refused: bool = False


def load_env(path: str | Path = ".env") -> None:
    """Read KEY=value lines from .env into the environment.

    Kept deliberately dumb, and it never overwrites a variable that is already
    set, so an exported key still wins over a stale file.
    """
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class Coach:
    """Asks Claude what Poco should do about the conversation so far."""

    def __init__(self, model: str = MODEL, effort: str = "low", max_tokens: int = 1024):
        """
        effort: how hard Claude thinks before answering. This runs inside a live
                conversation, so it is traded against latency - "low" keeps the
                round trip short. Raise it if the suggestions feel shallow.
        """
        import anthropic

        load_env()
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise SystemExit(
                "No ANTHROPIC_API_KEY. Put it in .env (gitignored) or export it."
            )
        self.client = anthropic.Anthropic()
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens

    def suggest(
        self,
        context: SocialContext,
        now: float | None = None,
        memories: list[str] | None = None,
    ) -> CoachResult:
        """`memories` are facts from previous conversations. They are passed in
        rather than fetched here: this runs while someone is waiting for Poco to
        react, and a lookup belongs on a background thread, not in the middle of
        it."""
        emotion, confidence = context.current_emotion(now=now)
        looks = f"{emotion} ({confidence:.0%})" if emotion else "not visible"
        recalled = ""
        if memories:
            lines = "\n".join(f"- {m}" for m in memories)
            recalled = f"What Poco remembers about this friend:\n{lines}\n\n"
        prompt = (
            f"{recalled}"
            f"The last few things your friend said, and how they looked saying "
            f"them:\n\n{context.to_prompt(now)}\n\n"
            f"Right now their face reads: {looks}.\n\n"
            f"What should Poco do?"
        )

        t0 = time.monotonic()
        response = self.client.beta.messages.parse(
            model=self.model,
            max_tokens=self.max_tokens,
            # The system prompt never changes, so it is worth caching: it is
            # most of the request, and this runs once per suggestion all session.
            system=[{"type": "text", "text": SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
            output_format=Suggestion,
            output_config={"effort": self.effort},
            # A conversation can wander somewhere the model declines to answer
            # about. Poco going mute mid-conversation is the worst outcome, so
            # let the server retry on another model rather than return nothing.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        latency = time.monotonic() - t0

        if response.stop_reason == "refusal":
            return CoachResult(
                suggestion=Suggestion(
                    say=None, gesture="listen", belly="neutral",
                    reason="declined to answer",
                ),
                latency=latency,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                cached_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                refused=True,
            )

        suggestion = response.parsed_output
        if suggestion.gesture not in GESTURES:
            suggestion.gesture = "listen"  # never hand the robot a move it cannot do
        return CoachResult(
            suggestion=suggestion,
            latency=latency,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cached_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        )
