"""Poco's servo channel map and measured hard-stop limits.

calibrate_limits.py rewrites this file every time a stop is recorded, so
edit by hand only when it is not running. Values are raw pulse widths in
microseconds; stop1/stop2 are in the order they were recorded, None means
not measured yet.
"""

SERVOS = {
    0: "left_leg",
    1: "right_leg",
    2: "head_turret",
    3: "right_arm_pitch",
    4: "left_arm_pitch",
    5: "head_roll",
    6: "head_pitch",
    7: "left_arm_roll",
    8: "left_arm_elbow",
    9: "right_arm_roll",
    10: "right_arm_elbow",
}

LIMITS = {
    0: {'stop1': 1400, 'stop2': 2335},
    1: {'stop1': 2300, 'stop2': 1420},
    2: {'stop1': 640, 'stop2': 1550},
    3: {'stop1': 2500, 'stop2': 480},
    4: {'stop1': 560, 'stop2': 2590},
    5: {'stop1': 1720, 'stop2': 710},
    6: {'stop1': 2130, 'stop2': 1170},
    7: {'stop1': 2490, 'stop2': 570},
    8: {'stop1': 2180, 'stop2': 500},
    9: {'stop1': 480, 'stop2': 2400},
    10: {'stop1': 480, 'stop2': 2090},
}


def pulse_range(channel):
    """(low_us, high_us) for a channel, or None until both stops are known."""
    lim = LIMITS[channel]
    if lim["stop1"] is None or lim["stop2"] is None:
        return None
    return tuple(sorted((lim["stop1"], lim["stop2"])))
