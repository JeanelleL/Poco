"""The laptop's half of the iPad app's PocoClient.

One port serves both the built app and the WebSocket. That is deliberate: the
iPad then connects back to whatever host it loaded the page from, so nobody has
to type an IP, and the two can never point at different machines. It also has to
be plain http - an https page is not allowed to open a ws:// socket to a device
on the LAN, so hosting the app anywhere else breaks the robot.

Every message is a JSON object with an "op". The app's side of this is
src/poco/wsPocoClient.ts; the shapes it sends and expects are in
src/poco/pocoClient.ts, which is the source of truth for both.

    app -> laptop   {"op": "hello"}
                    {"op": "perform",    "action": {move|mix, belly, say}}
                    {"op": "settings",   "settings": {...}}
                    {"op": "stop"}
                    {"op": "interacting","on": true|false}

    laptop -> app   {"op": "ready",  "servos": bool, "belly": bool, "leds": int}
                    {"op": "event",  "event": {type, feeling, said?, why?, at}}
                    {"op": "error",  "message": "..."}
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
from pathlib import Path

from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.http11 import Response

from poco.bridge import SPEED, PocoEvent
from poco.link.session import Session

PORT = 8765
# server/poco/link/server.py -> repo root -> the app's production build
APP_DIR = Path(__file__).resolve().parents[3] / "dist"


class PocoServer:
    def __init__(self, port: int = PORT, app_dir: Path | None = None,
                 robot=None, voice=None, **session_kwargs):
        self.port = port
        self.app_dir = Path(app_dir) if app_dir else APP_DIR
        self.robot = robot
        self.voice = voice
        self.session_kwargs = session_kwargs
        self.clients: set[ServerConnection] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.session = Session(on_event=self._on_event, robot=robot, voice=voice,
                               **session_kwargs)

    # -- serving the app ---------------------------------------------------

    def _static(self, connection: ServerConnection, request) -> Response | None:
        """Serve the built app for ordinary GETs; let WebSocket upgrades pass."""
        if request.headers.get("Upgrade", "").lower() == "websocket":
            return None

        path = request.path.split("?", 1)[0]
        target = self.app_dir / path.lstrip("/")
        if path == "/" or not target.is_file():
            # A single-page app: unknown paths are routes, not missing files.
            target = self.app_dir / "index.html"
        try:
            target = target.resolve()
            target.relative_to(self.app_dir.resolve())  # no climbing out of dist/
        except (ValueError, OSError):
            return Response(403, "Forbidden", Headers(), b"forbidden")
        if not target.is_file():
            return Response(
                404, "Not Found", Headers({"Content-Type": "text/plain"}),
                b"No built app here. Run `npm run build` in the repo root.",
            )
        body = target.read_bytes()
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return Response(200, "OK", Headers({
            "Content-Type": kind,
            "Content-Length": str(len(body)),
            # The iPad caches aggressively and the bundle name changes anyway.
            "Cache-Control": "no-cache",
        }), body)

    # -- talking to the app -------------------------------------------------

    def _on_event(self, event: PocoEvent) -> None:
        """Called from the session's thread; hop onto the loop to send."""
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(
            lambda: asyncio.create_task(self.broadcast({"op": "event",
                                                        "event": event.to_json()}))
        )

    async def broadcast(self, message: dict) -> None:
        if not self.clients:
            return
        payload = json.dumps(message)
        await asyncio.gather(
            *(c.send(payload) for c in list(self.clients)),
            return_exceptions=True,  # a client that left should not stop the rest
        )

    async def _handle(self, connection: ServerConnection) -> None:
        self.clients.add(connection)
        print(f"  app connected ({len(self.clients)} open)", flush=True)
        try:
            await connection.send(json.dumps(self._ready()))
            async for raw in connection:
                try:
                    await self._command(connection, json.loads(raw))
                except Exception as exc:
                    await connection.send(json.dumps({"op": "error",
                                                      "message": str(exc)}))
        finally:
            self.clients.discard(connection)
            print(f"  app disconnected ({len(self.clients)} open)", flush=True)
            if not self.clients and self.session.running:
                # Nobody is watching. The app pauses Poco when its screen goes
                # away, and a dropped Wi-Fi connection should do the same rather
                # than leave him running unseen with the camera on.
                print("  no apps left - pausing Social Mode", flush=True)
                self.session.stop()

    def _ready(self) -> dict:
        return {
            "op": "ready",
            "servos": bool(self.robot and self.robot.servos_ready),
            "belly": bool(self.robot and self.robot.belly_ready),
            "interacting": self.session.running,
        }

    async def _command(self, connection: ServerConnection, msg: dict) -> None:
        op = msg.get("op")
        if op == "hello":
            await connection.send(json.dumps(self._ready()))

        elif op == "perform":
            action = msg.get("action") or {}
            if self.robot is not None:
                move = action.get("move") or ""
                if move:
                    self.robot.perform(move)
                belly = action.get("belly")
                if belly and belly.get("pattern"):
                    # Draw what the app sent. It owns the faces, including the
                    # ones the adult drew, which have no name to look up.
                    self.robot.draw(belly["pattern"], belly.get("color", "#E8833A"),
                                    float(belly.get("brightness", 1.0)))
            say = action.get("say")
            if say and self.voice is not None:
                self.voice.say_async(say)

        elif op == "settings":
            s = msg.get("settings") or {}
            if self.robot is not None:
                # "Gentle" is slower AND smaller, the way play.py pairs them.
                name = s.get("speed", "Normal")
                self.robot.set_speed(SPEED.get(name, 1.0),
                                     0.6 if name == "Gentle" else 1.0)
                brightness = s.get("brightness")
                if brightness is not None:
                    # The app's slider is 0..100; the matrix wants 0..255.
                    self.robot.set_brightness(round(brightness * 255 / 100))

        elif op == "stop":
            if self.robot is not None:
                self.robot.stop()

        elif op == "interacting":
            if msg.get("on"):
                self.session.start()
            else:
                self.session.stop()
            await self.broadcast(self._ready())

        else:
            raise ValueError(f"unknown op {op!r}")

    # -- running -----------------------------------------------------------

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        built = (self.app_dir / "index.html").is_file()
        async with serve(self._handle, "", self.port,
                         process_request=self._static) as server:
            print(f"Poco on http://localhost:{self.port}  (ws on the same port)")
            print(f"  app: {'serving ' + str(self.app_dir) if built else 'NOT BUILT - run npm run build'}")
            if self.robot is not None:
                print(f"  robot: servos={self.robot.servos_ready} "
                      f"belly={self.robot.belly_ready}")
            await server.serve_forever()
