"""Check everything Poco needs, in one go. Run it before a demo.

    uv run demo_check.py

Says what is wrong and what to do about it, rather than failing somewhere
deep in a session with nobody able to tell why.
"""

import socket
import subprocess
import sys
import time

OK, BAD, WARN = "  OK  ", " FAIL ", " WARN "
problems: list[str] = []


def report(state: str, what: str, detail: str = "", fix: str = "") -> None:
    print(f"[{state}] {what:<22} {detail}", flush=True)
    if state is BAD:
        problems.append(f"{what}: {fix or detail}")


def check_board() -> None:
    import glob

    from poco.devices import CAMERA  # noqa: F401  (import cost, not use)

    ports = glob.glob("/dev/cu.usbmodem*")
    if not ports:
        report(BAD, "Arduino", "no /dev/cu.usbmodem*",
               "plug Poco's USB cable into the laptop")
        return
    try:
        import serial

        s = serial.Serial(ports[0], 500000, timeout=2)
        time.sleep(2.5)
        banner = s.read(200).decode("ascii", "replace")
        s.reset_input_buffer()
        s.write(b"ping\n")
        pong = s.readline().decode().strip()
        s.write(b"?")
        leds = s.read(3)
        s.close()
        servos = "pong" in pong
        belly = leds[:1] == b"R"
        pca = "PCA9685 found" in banner
        report(OK if servos and belly else BAD, "Arduino",
               f"{ports[0]}  servos={'yes' if servos else 'NO'} "
               f"belly={'yes' if belly else 'NO'} shield={'yes' if pca else 'NO'}",
               "reflash firmware/poco_firmware, or check the board")
        if servos and not pca:
            report(WARN, "servo shield", "PCA9685 not answering at 0x40 - "
                   "check it is seated and powered")
    except Exception as exc:
        report(BAD, "Arduino", f"{type(exc).__name__}: {exc}",
               "unplug and replug, then try again")


def check_camera() -> None:
    import cv2

    from poco.devices import CAMERA
    from poco.vision import EmotionDetector

    cap = cv2.VideoCapture(CAMERA, cv2.CAP_AVFOUNDATION)
    if not cap.isOpened():
        report(BAD, "camera", f"index {CAMERA} will not open",
               "check the C270 is plugged in, then --list-cameras")
        return
    t0 = time.monotonic()
    frame = None
    while time.monotonic() - t0 < 2.5:
        ok, f = cap.read()
        if ok:
            frame = f
    cap.release()
    if frame is None:
        report(BAD, "camera", "opened but returned no frames", "replug the C270")
        return
    h, w = frame.shape[:2]
    bright = frame.mean()
    face = EmotionDetector()._largest_face(frame)
    report(OK, "camera", f"index {CAMERA}  {w}x{h}  brightness {bright:.0f}")
    report(OK if face is not None else WARN, "face in frame",
           "someone is visible" if face is not None
           else "nobody visible - sit in front of Poco for the emotion half")
    if bright < 50:
        report(WARN, "lighting", f"dim ({bright:.0f}) - emotion reading suffers")


def check_audio() -> None:
    import numpy as np
    import sounddevice as sd

    from poco.devices import MIC, SPEAKER

    # Keep the real device indices: a position in a filtered list is not one,
    # and passing it opens some other device or none at all.
    ins = {i: d["name"] for i, d in enumerate(sd.query_devices())
           if d["max_input_channels"] > 0}
    outs = {i: d["name"] for i, d in enumerate(sd.query_devices())
            if d["max_output_channels"] > 0}
    hit_i = next((i for i, n in ins.items() if MIC.lower() in n.lower()), None)
    hit = ins.get(hit_i)
    report(OK if hit else BAD, "microphone", hit or f"nothing matching {MIC!r}",
           f"plug the C270 in, or change MIC in poco/devices.py. "
           f"Have: {list(ins.values())}")
    out = next((n for n in outs.values() if SPEAKER.lower() in n.lower()), None)
    report(OK if out else BAD, "speaker", out or f"nothing matching {SPEAKER!r}",
           f"change SPEAKER in poco/devices.py. Have: {list(outs.values())}")
    if hit_i is not None:
        rec = sd.rec(int(1.5 * 16000), samplerate=16000, channels=1,
                     dtype="float32", device=hit_i)
        sd.wait()
        rms = float(np.sqrt(np.mean(rec**2)))
        db = 20 * np.log10(rms + 1e-9)
        report(OK if db > -70 else BAD, "mic is live", f"{db:.0f} dBFS",
               "the microphone is silent - check permission and the cable")


def check_keys_and_apis() -> None:
    import os

    from poco.social.coach import load_env

    load_env()
    for name in ("ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY"):
        report(OK if os.environ.get(name) else BAD, name.split("_")[0].lower() + " key",
               "set" if os.environ.get(name) else "missing from server/.env")
    try:
        import anthropic

        t0 = time.monotonic()
        anthropic.Anthropic().messages.create(
            model="claude-opus-5", max_tokens=8,
            messages=[{"role": "user", "content": "say ok"}])
        report(OK, "Claude reachable", f"{time.monotonic() - t0:.1f}s")
    except Exception as exc:
        report(BAD, "Claude reachable", f"{type(exc).__name__}: {str(exc)[:60]}",
               "check the key and the network")


def check_network() -> None:
    host = subprocess.run(["scutil", "--get", "LocalHostName"],
                          capture_output=True, text=True).stdout.strip()
    ip = subprocess.run(["ipconfig", "getifaddr", "en0"],
                        capture_output=True, text=True).stdout.strip()
    report(OK if ip else BAD, "wi-fi", ip or "not on wi-fi",
           "join the same network as the iPad, or use the laptop's hotspot")
    try:
        with socket.create_connection(("127.0.0.1", 8765), timeout=1):
            report(OK, "server", f"http://{host}.local:8765")
    except OSError:
        report(WARN, "server", "not running yet - uv run run_server.py")


def main() -> int:
    print("\nChecking Poco...\n")
    for check in (check_board, check_camera, check_audio,
                  check_keys_and_apis, check_network):
        try:
            check()
        except Exception as exc:
            report(BAD, check.__name__, f"{type(exc).__name__}: {exc}")
    print()
    if problems:
        print(f"{len(problems)} thing(s) to fix before the demo:\n")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("Everything Poco needs is working.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
