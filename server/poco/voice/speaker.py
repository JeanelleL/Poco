"""Poco's voice, via ElevenLabs.

Poco speaks out loud in the same room its microphone is listening to, so every
line it says comes straight back in. Left alone, Whisper transcribes Poco's own
voice, SocialContext files it as something the friend said, and Poco ends up
advising your person about a sentence it made up itself. So the listener is
deafened for exactly as long as the clip lasts, plus a moment for the room to
stop ringing.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass

import numpy as np
import sounddevice as sd

VOICE_ID = "vGQNBgLaiM3EdZtxIiuY"
MODEL = "eleven_v3"
SAMPLE_RATE = 24000  # pcm_24000: raw int16, so it plays without a decoder

# How long after a clip finishes before the microphone is trusted again.
# Covers the tail of the room's reverb.
ECHO_TAIL = 0.4

# v3 acts on inline tags. Poco is a robot penguin for children, so the delivery
# carries as much as the words - the tag is taken from the feeling Poco reads in
# the friend, not from the feeling Poco is describing.
EMOTION_TAGS = {
    "happy": "[cheerful]",
    "sad": "[gentle]",
    "angry": "[calm]",
    "surprised": "[curious]",
    "worried": "[reassuring]",
    "neutral": "[warm]",
}


@dataclass
class Spoken:
    text: str
    latency: float  # request -> audio in hand
    duration: float  # how long the clip plays for
    characters: int  # what it cost, in ElevenLabs' billing unit


class Voice:
    """Turns a line of Poco's into sound.

        voice = Voice()
        voice.say("You could ask what he's most worried about", emotion="sad")
    """

    def __init__(
        self,
        voice_id: str = VOICE_ID,
        model: str = MODEL,
        style: float = 1.0,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        use_tags: bool = True,
    ):
        """
        style:     ElevenLabs' exaggeration control, 0..1. Pinned to the top.
        stability: v3 takes 0.0 Creative / 0.5 Natural / 1.0 Robust. Natural
                   keeps the delivery steady while still acting on the tags
                   above. Creative is more expressive but wanders; Robust would
                   flatten the tags out, which is the opposite of what a penguin
                   wants.
        use_tags:  prepend an emotion tag from EMOTION_TAGS.
        """
        from elevenlabs import VoiceSettings
        from elevenlabs.client import ElevenLabs

        from poco.social.coach import load_env

        load_env()
        if not os.environ.get("ELEVENLABS_API_KEY"):
            raise SystemExit(
                "No ELEVENLABS_API_KEY. Put it in .env (gitignored) or export it."
            )
        self.client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
        self.voice_id = voice_id
        self.model = model
        self.use_tags = use_tags
        self.settings = VoiceSettings(
            stability=stability,
            similarity_boost=similarity_boost,
            style=style,
            use_speaker_boost=True,
        )
        self.speaking = False
        self._lock = threading.Lock()

    def render(self, text: str, emotion: str | None = None) -> tuple[np.ndarray, float, int]:
        """Fetch the audio without playing it."""
        line = text
        if self.use_tags and emotion in EMOTION_TAGS:
            line = f"{EMOTION_TAGS[emotion]} {text}"
        t0 = time.monotonic()
        chunks = self.client.text_to_speech.convert(
            voice_id=self.voice_id,
            text=line,
            model_id=self.model,
            output_format=f"pcm_{SAMPLE_RATE}",
            voice_settings=self.settings,
        )
        raw = b"".join(chunks)
        latency = time.monotonic() - t0
        audio = np.frombuffer(raw, dtype=np.int16)
        return audio, latency, len(line)

    def say(self, text: str, emotion: str | None = None, listener=None) -> Spoken:
        """Speak a line, blocking until it finishes.

        `listener` is a SpeechListener to deafen while the clip plays, so Poco
        does not hear itself.
        """
        with self._lock:
            audio, latency, chars = self.render(text, emotion)
            duration = len(audio) / SAMPLE_RATE
            if listener is not None:
                # Muted before the first sample, not after.
                listener.mute_for(duration + ECHO_TAIL)
            self.speaking = True
            try:
                sd.play(audio, samplerate=SAMPLE_RATE)
                sd.wait()
            finally:
                self.speaking = False
            return Spoken(text=text, latency=latency, duration=duration, characters=chars)

    def say_async(self, text: str, emotion: str | None = None, listener=None) -> threading.Thread:
        """Speak without blocking the caller's loop."""
        thread = threading.Thread(
            target=self.say, args=(text, emotion, listener), daemon=True
        )
        thread.start()
        return thread
