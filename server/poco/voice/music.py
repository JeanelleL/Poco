"""Background music for the Fun routines.

Played with afplay rather than through sounddevice: it handles m4a, mp3 and
everything else macOS knows, and it is a separate process, so stopping a track
is killing it rather than unpicking a stream.

Two things this has to get right. The microphone is listening while a routine
runs, and music is transcribed as speech - Poco would answer song lyrics. So
the listener is deafened for as long as the track plays. And Poco talks during
routines, so the music ducks rather than talking over him.

Tracks are not in the repository. Drop the file in server/music/ and name it in
TRACKS; music/ is gitignored, because the songs people want here are somebody
else's work.
"""

from __future__ import annotations

import subprocess
import threading
from pathlib import Path

MUSIC_DIR = Path(__file__).resolve().parents[2] / "music"

# Routine id -> (filename in music/, seconds to skip). Any extension afplay
# understands. The offset exists because songs open with an intro and a routine
# wants the part people recognise; afplay cannot seek, so an offset means the
# track is trimmed once into music/.cache/ and that copy is played.
TRACKS = {
    "party": ("un_poco_loco", 35.0),
}

# How loud the music sits under Poco's voice, 0..1.
VOLUME = 0.35
DUCKED = 0.12


def _trimmed(path: Path, start: float) -> Path:
    """A copy of `path` with the first `start` seconds cut off, cached.

    afplay has no seek, so the cut has to exist as a file. Written once and
    reused; delete music/.cache to force it again.
    """
    import av

    cache_dir = MUSIC_DIR / ".cache"
    cache_dir.mkdir(exist_ok=True)
    cache = cache_dir / f"{path.stem}@{start:g}.wav"
    if cache.exists() and cache.stat().st_mtime >= path.stat().st_mtime:
        return cache

    with av.open(str(path)) as inp, av.open(str(cache), "w") as out:
        stream = out.add_stream("pcm_s16le", rate=44100)
        stream.layout = "stereo"
        resampler = av.AudioResampler(format="s16", layout="stereo", rate=44100)
        inp.seek(int(start * av.time_base))
        for frame in inp.decode(audio=0):
            if frame.time is not None and frame.time < start:
                continue
            frame.pts = None
            for chunk in resampler.resample(frame):
                for packet in stream.encode(chunk):
                    out.mux(packet)
        for packet in stream.encode(None):
            out.mux(packet)
    return cache


def find_track(name: str) -> Path | None:
    """The file for a track name, whatever extension it was saved with."""
    if not MUSIC_DIR.is_dir():
        return None
    for path in sorted(MUSIC_DIR.iterdir()):
        if path.stem.lower() == name.lower() and path.is_file():
            return path
    return None


class Music:
    """One track at a time, stoppable."""

    def __init__(self, volume: float = VOLUME):
        self.volume = volume
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()

    @property
    def playing(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def play(self, track: str, listener=None, loop: bool = True) -> bool:
        """Start a track. Returns False if there is no such file."""
        entry = TRACKS.get(track, track)
        name, start = entry if isinstance(entry, tuple) else (entry, 0.0)
        path = find_track(name)
        if path is None:
            return False
        if start:
            try:
                path = _trimmed(path, start)
            except Exception as exc:
                print(f"  [music] could not skip to {start:g}s ({exc}); "
                      f"playing from the beginning", flush=True)
        self.stop()
        with self._lock:
            seconds = self._length(path)
            if listener is not None and seconds:
                # Otherwise Whisper transcribes the song and Poco answers the
                # lyrics. Deafened for the track, topped up by the loop below.
                listener.mute_for(seconds + 1.0)
            self._proc = subprocess.Popen(
                ["afplay", "-v", str(self.volume), str(path)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        if loop:
            threading.Thread(target=self._loop, args=(path, listener), daemon=True).start()
        return True

    def _loop(self, path: Path, listener) -> None:
        while True:
            proc = self._proc
            if proc is None:
                return
            proc.wait()
            with self._lock:
                if self._proc is not proc:
                    return  # stopped, or another track started
                seconds = self._length(path)
                if listener is not None and seconds:
                    listener.mute_for(seconds + 1.0)
                self._proc = subprocess.Popen(
                    ["afplay", "-v", str(self.volume), str(path)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )

    @staticmethod
    def _length(path: Path) -> float:
        try:
            out = subprocess.run(["afinfo", str(path)], capture_output=True,
                                 text=True, timeout=5).stdout
            for line in out.splitlines():
                if "estimated duration" in line:
                    return float(line.split(":")[1].strip().split()[0])
        except Exception:
            pass
        return 0.0

    def stop(self) -> None:
        with self._lock:
            proc, self._proc = self._proc, None
        if proc is not None and proc.poll() is None:
            proc.terminate()
