"""Which camera and microphone Poco is listening and looking through.

The C270 is mounted on the penguin and is what Poco sees and hears through.
It takes camera index 0 when plugged in; without it, index 0 is the MacBook's
own camera, so check with `uv run emotion_demo.py --list-cameras` after any
hardware change.

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
MIC = "C270"

# Where Poco's voice comes out, matched the same way. This is the speaker on
# Poco, not the laptop's own - his voice should come from him. Pinned rather
# than left to the system default, which follows whatever was plugged in last,
# so a monitor or a dock silently becomes the thing Poco talks through.
# None would mean "use the system default".
SPEAKER = "MT"
