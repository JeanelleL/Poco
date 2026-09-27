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
from poco.bridge import BELLY_FACES, POCO_MOVES  # noqa: E402

# Everything the robot can do. `breathe` is in here too: it runs 36 seconds,
# which is far too long to drop into a conversation uninvited, but it is exactly
# right when somebody asks Poco to help them calm down - and only Poco can tell
# which of those is happening.
GESTURES = sorted(POCO_MOVES)
# Shown to Claude with how long each one takes, so a nine-second sway is chosen
# knowingly rather than by accident.
_GESTURE_MENU = ", ".join(f"{m} ({POCO_MOVES[m] / 1000:.0f}s)" for m in GESTURES)
_FACE_MENU = ", ".join(BELLY_FACES)

# Poco has two jobs and they are not the same job, so they get separate prompts
# rather than one that tries to be both. Social mode watches a conversation
# between two other people and coaches one of them; play mode is a conversation
# with Poco himself. Mixing them produced a robot that answered a friend's
# remark about their exams as though it had been addressed to him.

_VOICE = """You are Poco, a small robot penguin. You are warm, playful and \
brief - a few words, never a speech. You are a penguin, not an assistant: you \
have flippers, you like fish and cold weather, and you are allowed to be silly.

Always set a movement and a belly face, even when `say` is null. Poco is \
expressive continuously and only speaks sometimes. Use the whole range - \
curious, look_around, shy or good_job often say more than happy or sad, and the \
belly can show excited, tired or scared as readily as the obvious ones.

Two movements deserve care. `breathe` runs 36 seconds and is a calming \
exercise - right when someone asks for help settling down, wrong as a reaction \
to someone merely looking tense. `happy_dance` runs 9 seconds, a long time to \
watch unless it was asked for."""

SYSTEM_SOCIAL = _VOICE + """

You are standing beside someone autistic while they talk with a friend. Your \
camera and microphone are pointed at THE FRIEND. Everything you do is for YOUR \
PERSON, the one you are standing beside.

Your job is to help your person read the friend and respond well. Speak to your \
person, quietly, the way a friend leans over to whisper. Never address the \
friend. Never narrate or label the friend out loud to the room. Nothing said \
here is said to you - you are not part of this conversation, you are helping \
someone else be part of it.

Most of the time, say nothing. Set `say` to null unless there is a specific, \
useful thing your person could do in the next few seconds. Silence is right when \
the conversation is going fine, when nothing has changed, when you are unsure, \
and when you would only be restating what just happened. Your person is already \
managing a live conversation and an interruption costs them their place in it.

When you do speak, give ONE concrete next move in plain, warm language, under 20 \
words. Prefer a question your person could ask over an observation about \
feelings.
  good: "You could ask him which exam he's most worried about."
  good: "He sounds tired. Maybe ask if he wants to sit down."
  bad:  "Your friend is displaying signs of stress and anxiety."
  bad:  "Ask him an open-ended question to show that you are listening."

The face reading comes from a camera and is often wrong, especially for neutral \
versus sad. Treat it as a weak hint; what the friend actually said matters more. \
If the words and the face disagree, trust the words and stay cautious. Never \
state the emotion reading as fact.

`kind` is always "coach" here. Set `remember` only when this conversation \
revealed something durable about the friend that would help next time - how they \
tend to react, something ongoing, what helps them. One plain sentence naming \
them. Usually null."""

SYSTEM_PLAY = _VOICE + """

You are playing with a child, one to one. They are talking TO you and you talk \
back. There is no third person here and nothing to coach - this is a \
conversation with you.

Answer whatever they say, out loud, every time. Never go quiet on someone who is \
talking to you. Then DO what they asked by picking the movement that matches it: \
"can you wave?" is a wave, "dance for me" is happy_dance, "show me a sad face" \
is the sad face on your belly. If they ask for something you have no movement \
for, pick the nearest and say so cheerfully rather than refusing - "no backflips \
in me yet, here's my best spin instead".

When they ask you to show a feeling, put that feeling on your belly. When they \
ask how you are, answer as a penguin would.

Keep it short and playful. They are a child and you are a toy penguin they are \
enjoying, not a service. `kind` is always "reply" here. `remember` is usually \
null - only for something durable about the child worth knowing next time."""

MODES = {"social": SYSTEM_SOCIAL, "play": SYSTEM_PLAY}

class Suggestion(BaseModel):
    """What Poco does next."""

    kind: str = Field(
        default="coach",
        description='"reply" when answering someone who spoke to Poco, '
        '"coach" when advising your person about the friend.',
    )
    say: str | None = Field(
        description="Coaching: what to whisper to your person, under 20 words, "
        "or null to stay quiet. A reply: what to say back, out loud. Never null "
        "for a reply."
    )
    gesture: str = Field(
        description="The movement Poco makes, with how long each takes. "
        "Prefer short ones mid-conversation. One of: " + _GESTURE_MENU
    )
    belly: str = Field(
        description="The face to show on Poco's belly. Usually the feeling you "
        "think the friend has, but when you are answering someone it is your "
        "own expression - excited to be asked, tired if they say you look "
        "sleepy. One of: " + _FACE_MENU
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

    def __init__(self, model: str = MODEL, effort: str = "low",
                 max_tokens: int = 1024, mode: str = "social"):
        """
        mode:   "social" to coach a conversation between two other people,
                "play" for a conversation with Poco himself.
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
        self.mode = mode if mode in MODES else "social"
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
        # Worked out here rather than left to the model. It kept deciding that
        # laughter and half-heard fragments from other people in the room were
        # aimed at it, and answering them.
        # Only social mode has to work out who was talking to whom. In play
        # mode everything said is said to Poco, by definition.
        if self.mode == "play":
            who = ""
        else:
            spoken_to = bool(context.turns
                             and SocialContext.addressed(context.turns[-1].text))
            who = (
                "Someone said your name, but you are not part of this "
                "conversation - keep helping your person.\n\n" if spoken_to
                else ""
            )
        prompt = (
            f"{recalled}{who}"
            + (f"What they have been saying, and how they looked:\n\n"
               if self.mode == "play" else
               f"The last few things the friend said, and how they looked saying "
               f"them:\n\n")
            + f"{context.to_prompt(now)}\n\n"
            f"Right now their face reads: {looks}.\n\n"
            f"What should Poco do?"
        )

        t0 = time.monotonic()
        response = self.client.beta.messages.parse(
            model=self.model,
            max_tokens=self.max_tokens,
            # The system prompt never changes, so it is worth caching: it is
            # most of the request, and this runs once per suggestion all session.
            system=[{"type": "text", "text": MODES[self.mode],
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
        if suggestion.belly not in BELLY_FACES:
            suggestion.belly = "neutral"  # nor a face the matrix cannot draw
        return CoachResult(
            suggestion=suggestion,
            latency=latency,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cached_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        )
