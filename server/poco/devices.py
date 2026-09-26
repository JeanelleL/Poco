"""Which camera and microphone Poco is listening and looking through.

Development currently runs on the MacBook's built-in camera and mic. The C270
is off being mounted on the penguin; when it comes back, set:

    CAMERA = 0          # the C270 took index 0 when it was plugged in
    MIC = "C270"

and check with `uv run emotion_demo.py --list-cameras`.

Camera indices are worth re-checking every time the hardware changes. OpenCV
has no way to ask a camera its name, so a camera is only ever an index, and
those renumber when a USB device is plugged in or pulled out - unplugging the
C270 moved the MacBook's own camera from 1 to 0, and its microphone from 2 to
1. Microphones do report names, so MIC is matched by name and survives the
shuffle; CAMERA cannot be, so it is pinned here rather than spelled out in
three different demos.
"""

# OpenCV/AVFoundation device index. Check with --list-cameras after any change.
CAMERA = 0

# Matched against a substring of the input device's name.
MIC = "MacBook"
