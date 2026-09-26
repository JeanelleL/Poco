"""Poco's gestures, built from poses recorded with pose_editor.py.

A gesture is a list of steps, played in order:
    ("pose", secs)            glide to a pose over secs
    ("pose", secs, hold)      ...then hold still for hold secs
    ("home:head", secs)       only the head servos of a pose
    (["a", "b"], secs)        several poses at once (e.g. head + arm)
    ("wait", secs)            hold still
    ("slow", "pose", secs[, hold])
                              like a normal move, but arms lowering are NOT
                              sped up -- for moves that must stay slow
    ("swing", "a", "b", period, cycles[, blend])
                              oscillate smoothly a -> b -> a, one continuous
                              motion; only b's servos oscillate. blend secs
                              fades in from the current position while
                              already swinging, so there is no pause

repeat(steps, n) repeats a block. Groups: head, left_arm, right_arm, arms,
legs, all.

Poses these starters expect (record them in pose_editor.py):
    home                                   all servos, neutral standing
    yes_a  yes_b  no_a  no_b  look_left  look_right  look_up  look_down
    tilt_left  tilt_right  tilt_left_small  tilt_right_small  bob_up   head (recorded)
    flap_out                                                           arms (recorded)
    right_wave  right_wave_low  left_wave  left_wave_low               arms (recorded)
    right_leg_down  left_leg_down                                      legs (recorded)
    left_foot_up  right_foot_up  feet_centre                           legs (recorded)
"""


def repeat(steps, n):
    return steps * n


GESTURES = {
    # Glide every servo to its home position.
    "home": [
        ("home", 1.2),
    ],
    # Nod: head pitch swings evenly either side of home. Fades in from
    # wherever the head is, then glides back home.
    "yes": [
        ("swing", "yes_a", "yes_b", 0.6, 3, 0.3),
        ("home:head", 0.4),
    ],
    # Shake: head turret swings evenly either side of home.
    "no": [
        ("swing", "no_a", "no_b", 0.8, 3, 0.4),
        ("home:head", 0.5),
    ],
    # Puzzled penguin: tilt one way and hold, then the other.
    "curious": [
        ("tilt_left", 0.6, 0.8),
        ("tilt_right", 0.9, 0.8),
        ("home:head", 0.6),
    ],
    # Slow scan of the room: left, up, right, back to centre.
    "look_around": [
        (["home:head", "look_left"], 1.0, 0.6),
        (["home:head", "look_up"], 0.9, 0.5),
        (["home:head", "look_right"], 1.0, 0.6),
        ("home:head", 0.8),
    ],
    # Right arm raised high, elbow swinging top <-> middle, right leg pushed
    # to its bottom stop so the body tilts. The raise blends straight into
    # the swing (last number) so there is no pause. Tuned live.
    "wave_right": [
        ("swing", ["right_wave", "right_leg_down"], "right_wave_low", 0.7, 5, 0.9),
        ("home:right_arm,legs", 0.9),
    ],
    # Mirror image of wave_right (poses made with poco_motion.mirror).
    "wave_left": [
        ("swing", ["left_wave", "left_leg_down"], "left_wave_low", 0.7, 5, 0.9),
        ("home:left_arm,legs", 0.9),
    ],
    # Excited flap: both arm rolls swing out and back together.
    "flap": [
        ("swing", "home:arms", "flap_out", 0.7, 4, 0.2),
        ("home:arms", 0.5),
    ],
    # Full-range foot rock: one foot to its top stop while the other goes to
    # its bottom stop, tipping Poco side to side. Tuned live: 0.8 s per side.
    "sway": [
        ("feet_centre", 0.5),
        *repeat([("left_foot_up", 0.8), ("right_foot_up", 0.8)], 5),
        ("feet_centre", 0.4),
    ],
    # Sway with the head tilting into each rock, then flap with a head bob.
    # Every phase blends into the next.
    "happy_dance": [
        ("swing", ["left_foot_up", "tilt_left_small"],
                  ["right_foot_up", "tilt_right_small"], 1.6, 3, 0.8),
        ("swing", ["feet_centre", "home:arms,head"],
                  ["flap_out", "bob_up"], 0.7, 4, 0.4),
        ("home", 1.0),
    ],
    # --- Emotions ---------------------------------------------------------
    # One gesture per feeling, always the same, for "how does Poco feel?"
    # teaching. Deliberately unhurried; every one starts and ends at home.

    # Bouncy half-sway, head up, a small flap on each rock.
    "happy": [
        ("swing", "happy_a", "happy_b", 1.2, 3, 0.6),
        ("home", 1.0),
    ],
    # Head slowly droops, one slow sigh, then slowly recovers.
    "sad": [
        ("sad_down", 2.0, 1.0),
        ("swing", "sad_down", "sad_sigh", 3.0, 1),
        ("wait", 0.8),
        ("home", 2.0),
    ],
    # Quick but small: arms up, head back, hold, relax.
    "surprised": [
        ("surprised", 0.4, 1.2),
        ("home", 1.2),
    ],
    # Turns away with arms up in front, trembles, peeks back nervously,
    # hides again, then settles.
    "worried": [
        ("worried", 1.0, 0.2),
        ("swing", "worried_tremble_a", "worried_tremble_b", 0.3, 5, 0.15),
        ("worried_peek", 0.6, 0.5),
        ("worried", 0.35, 0.8),
        ("home", 1.5),
    ],
    # Slow, gentle rock with the head level.
    "calm": [
        ("swing", "calm_a", "calm_b", 4.0, 2, 2.0),
        ("home:legs", 1.5),
    ],
    # Head drifts down, lifts back partway, drifts again, then wakes up.
    "tired": [
        ("tired_droop", 2.5, 0.4),
        ("tired_lift", 0.6, 0.5),
        ("tired_droop", 2.0, 0.6),
        ("home", 1.2),
    ],
    # Looks away with an arm up in front, peeks back, hides again.
    "shy": [
        ("shy", 1.2, 0.8),
        ("shy_peek", 0.7, 0.6),
        ("shy", 0.7, 0.8),
        ("home", 1.5),
    ],
    # Head down, arms stiff, a slow head shake.
    "frustrated": [
        ("frustrated", 0.8, 0.3),
        ("swing", "frustrated_l", "frustrated_r", 1.4, 2, 0.5),
        ("home", 1.2),
    ],

    # --- Social cues ------------------------------------------------------
    # Simple, consistent signals for turn-taking and conversation.

    # A slower, softer wave with a head tilt.
    "goodbye": [
        ("swing", "goodbye_a", "right_wave_low", 1.2, 3, 1.0),
        ("home", 1.2),
    ],
    # Head tilts toward the child, two slow nods while listening.
    "listen": [
        ("listen", 0.8, 0.8),
        ("swing", "listen", "listen_nod", 1.2, 2),
        ("listen", 0.3, 0.8),
        ("home:head", 0.8),
    ],
    # Joint attention: point and look, glance back at the child, look again.
    "look_there": [
        ("look_there", 1.0, 1.0),
        ("look_there_check", 0.6, 0.6),
        ("look_there", 0.6, 1.0),
        ("home", 1.2),
    ],
    # Mini celebration: both arms up, bouncing out, head up.
    "good_job": [
        ("swing", "good_job_a", "good_job_b", 0.6, 4, 0.6),
        ("home", 1.0),
    ],

    # --- Regulation -------------------------------------------------------

    # Breathing exercise to do together: arms rise and open while breathing
    # in (4 s), hold, then slowly lower while breathing out (6 s). Three
    # breaths. "slow" keeps the out-breath at a true 6 s.
    "breathe": [
        *repeat([
            ("breathe_in", 4.0, 1.0),
            ("slow", "home:arms,head", 6.0, 1.0),
        ], 3),
    ],

    "hello": [
        ("home", 0.8),
        (["look_up", "right_wave"], 0.8),
        ("swing", "right_wave", "right_wave_low", 1.0, 3),
        ("tilt_left", 0.3, 0.5),
        ("home", 0.8),
    ],
}
