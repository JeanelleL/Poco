"""What Poco remembers about the people its person talks to, via Backboard.

Poco meets the same friends repeatedly, and the useful things are the ones that
do not fit in a single conversation: that Jamie goes quiet rather than saying he
is struggling, that asking about his brother always lands well. Those outlive
the session, so they live here rather than in SocialContext, which only holds
the last few minutes.

This is off unless someone asks for it (`--memory`). The facts are about the
friend, who is sitting in front of Poco because they came to talk to a child,
not because they agreed to be written down on a vendor's server. Poco's own user
is covered by the adult who set him up; the friend is not covered by anyone.

Backboard is deliberately NOT on the path between hearing something and saying
something. A full message round trip measured 3-12.6s against 2.4-3.4s for
calling Claude directly, which would roughly double a pipeline that is already
slow enough. Only the memory store is used: reading every fact takes ~0.2s and
writing one ~1.2s, and both happen off the critical path.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass

BASE_URL = "https://app.backboard.io/api"
ASSISTANT_NAME = "Poco"


@dataclass
class Fact:
    text: str
    id: str | None = None
    # Set by recall(). This is a DISTANCE, not a similarity: lower means closer.
    # Searching "running and exercise" scored the running fact 0.56 and an
    # unrelated one about disliking phone calls 0.92. Results come back nearest
    # first, so ordering is right - it is only a threshold that inverts, and
    # `score > 0.7` would keep precisely the wrong facts.
    score: float | None = None

    @property
    def closeness(self) -> float | None:
        """Distance flipped so that bigger is more relevant, for sorting."""
        return None if self.score is None else -self.score


class Memory:
    """Durable facts about the people Poco's person talks to.

        memory = Memory()
        memory.remember("Jamie goes quiet when he is overwhelmed")
        for fact in memory.all():
            ...
    """

    def __init__(self, assistant_name: str = ASSISTANT_NAME, timeout: float = 30.0):
        import requests

        from poco.social.coach import load_env

        load_env()
        key = os.environ.get("BACKBOARD_API_KEY")
        if not key:
            raise SystemExit(
                "No BACKBOARD_API_KEY. Put it in .env (gitignored) or export it."
            )
        self._session = requests.Session()
        self._session.headers.update(
            {"X-API-Key": key, "Content-Type": "application/json"}
        )
        self.timeout = timeout
        self.assistant_name = assistant_name
        self._lock = threading.Lock()
        self.assistant_id = self._resolve_assistant()

    # -- setup -------------------------------------------------------------

    def _resolve_assistant(self) -> str:
        """Find Poco's assistant, creating it the first time.

        Looked up by name rather than by a stored id, so a fresh checkout or a
        wiped .env recovers on its own instead of silently starting a second
        pile of memories.
        """
        r = self._session.get(f"{BASE_URL}/assistants", timeout=self.timeout)
        r.raise_for_status()
        payload = r.json()
        existing = payload if isinstance(payload, list) else payload.get("assistants", [])
        for a in existing:
            if a.get("name") == self.assistant_name:
                found = a.get("id") or a.get("assistant_id")
                if found:
                    return found
        r = self._session.post(
            f"{BASE_URL}/assistants",
            json={
                "name": self.assistant_name,
                "description": "Durable facts about the people Poco's person talks with.",
                "system_prompt": "You store durable facts about the people Poco's person talks with.",
            },
            timeout=self.timeout,
        )
        r.raise_for_status()
        body = r.json()
        return body.get("id") or body.get("assistant_id")

    # -- reading -----------------------------------------------------------

    def all(self, limit: int = 50) -> list[Fact]:
        """Every fact. Cheap enough (~0.2s) to refresh on a timer."""
        r = self._session.get(
            f"{BASE_URL}/assistants/{self.assistant_id}/memories", timeout=self.timeout
        )
        r.raise_for_status()
        return [
            Fact(text=m["content"], id=m.get("id"))
            for m in r.json().get("memories", [])[:limit]
        ]

    def recall(self, query: str, limit: int = 5) -> list[Fact]:
        """Facts related to `query`, by meaning rather than keyword (~1.4s)."""
        r = self._session.post(
            f"{BASE_URL}/assistants/{self.assistant_id}/memories/search",
            json={"query": query, "limit": limit},
            timeout=self.timeout,
        )
        r.raise_for_status()
        return [
            Fact(text=m["content"], id=m.get("id"), score=m.get("score"))
            for m in r.json().get("memories", [])
        ]

    # -- writing -----------------------------------------------------------

    def remember(self, fact: str) -> bool:
        """Store one fact. Returns whether it stuck."""
        fact = fact.strip()
        if not fact:
            return False
        with self._lock:
            r = self._session.post(
                f"{BASE_URL}/assistants/{self.assistant_id}/memories",
                json={"content": fact},
                timeout=self.timeout,
            )
        return r.status_code < 300

    def remember_async(self, fact: str) -> threading.Thread:
        """Store a fact without making the conversation wait for it."""
        thread = threading.Thread(target=self.remember, args=(fact,), daemon=True)
        thread.start()
        return thread

    def forget(self, fact_id: str) -> bool:
        r = self._session.delete(
            f"{BASE_URL}/assistants/{self.assistant_id}/memories/{fact_id}",
            timeout=self.timeout,
        )
        return r.status_code < 300
