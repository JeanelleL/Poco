"""Serve the iPad app and drive Poco.

    uv run run_server.py                 # everything
    uv run run_server.py --no-robot      # no servos or belly
    uv run run_server.py --no-voice      # Poco thinks but stays silent

Open http://<this-laptop>.local:8765 on the iPad, on the same Wi-Fi. The app
connects its WebSocket back to whatever host it loaded from, so there is no IP
to type in.
"""

import argparse
import asyncio
import socket

from poco.link import PORT, PocoServer
from poco.robot import Robot
from poco.voice import Voice


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--no-robot", action="store_true")
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--memory", action="store_true",
                    help="remember the friend between sessions")
    ap.add_argument("--effort", default="low", help="low / medium / high")
    ap.add_argument("--cooldown", type=float, default=20.0)
    ap.add_argument("--gentle", action="store_true")
    args = ap.parse_args()

    robot = None
    if not args.no_robot:
        robot = Robot(speed=0.7 if args.gentle else 1.0,
                      amount=0.6 if args.gentle else 1.0)
        robot.connect()
    voice = None if args.no_voice else Voice()

    server = PocoServer(port=args.port, robot=robot, voice=voice,
                        effort=args.effort, cooldown=args.cooldown,
                        use_memory=args.memory)
    print(f"  open http://{socket.gethostname()}:{args.port} on the iPad")
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        server.session.stop()
        if robot is not None:
            robot.close()


if __name__ == "__main__":
    main()
