/*
 * servo_test.ino -- serial-controlled servo firmware for an Arduino Uno
 * with a Keyestudio 16-channel 12-bit PWM shield (PCA9685).
 *
 * The Uno does nothing clever: it listens on USB serial for one-line
 * commands and drives the PWM chip. All logic (computer vision, tracking,
 * whatever comes later) lives in Python on the host.
 *
 * Wiring:
 *   - Shield plugs onto the Uno headers. I2C is A4 (SDA) / A5 (SCL).
 *   - Servo on a 3-pin header: GND (brown/black) on the inner row,
 *     V+ (red) centre, signal (orange/yellow) on the PWM row.
 *   - Servo power from the green screw terminal, 5-6V, own supply.
 *     The Uno's USB rail cannot source servo current.
 *
 * Library: "Adafruit PWM Servo Driver" via the IDE Library Manager.
 *
 * PROTOCOL (115200 baud, newline terminated, one line in -> one line out)
 *   lines beginning with '#' are informational; the host ignores them
 *   every command answers with exactly one "OK ..." or "ERR ..." line
 *
 *   ping                -> OK pong
 *   a <ch> <deg>        -> OK a <ch> <deg> <us>      angle, 0-180
 *   u <ch> <us>         -> OK u <ch> <us>            raw pulse width
 *   m <ch> <us> [<ch> <us> ...]  -> OK m <count>     several pulses at once
 *   off <ch>            -> OK off <ch>               stop pulsing, go limp
 *   range <min> <max>   -> OK range <min> <max>      us endpoints for 0/180
 *   sweep <0|1>         -> OK sweep <0|1>            autonomous test sweep
 *   selftest            -> OK selftest               one slow demo sweep
 *   help                -> informational lines, then OK help
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

const uint16_t SERVO_FREQ_HZ = 50;    // standard analog servo frame rate
const uint16_t PULSE_FLOOR   = 400;   // refuse anything outside this window
const uint16_t PULSE_CEIL    = 2600;

// Conservative defaults. Widen toward 500/2500 with the "range" command
// once you know the servo does not buzz or strain at the ends -- a servo
// driven past its mechanical stop stalls and cooks itself.
uint16_t pulseMinUs = 1000;
uint16_t pulseMaxUs = 2000;

// Tick length cached at boot. Adafruit's writeMicroseconds() re-reads the
// prescale register over I2C on every call, which halves the update rate
// when many servos move at once.
float    usPerTick    = 0;

bool     sweeping     = false;
uint8_t  sweepChannel = 0;

void writeUs(uint8_t ch, uint16_t us) {
  pwm.setPWM(ch, 0, (uint16_t)(us / usPerTick + 0.5));
}

uint16_t angleToUs(uint16_t deg) {
  if (deg > 180) deg = 180;
  return pulseMinUs + ((uint32_t)(pulseMaxUs - pulseMinUs) * deg) / 180;
}

// --- command parsing -------------------------------------------------

// Pulls the next whitespace-separated token off *p, advancing p past it.
// Returns NULL when the line is exhausted.
char *nextTok(char **p) {
  while (**p == ' ' || **p == '\t') (*p)++;
  if (**p == '\0') return NULL;
  char *start = *p;
  while (**p && **p != ' ' && **p != '\t') (*p)++;
  if (**p) { **p = '\0'; (*p)++; }
  return start;
}

// Parses a token as an integer, rejecting junk like "12abc" or "".
bool parseInt(const char *tok, long *out) {
  if (tok == NULL || *tok == '\0') return false;
  char *end;
  long v = strtol(tok, &end, 10);
  if (*end != '\0') return false;
  *out = v;
  return true;
}

bool getChannel(char **p, uint8_t *out) {
  long v;
  if (!parseInt(nextTok(p), &v) || v < 0 || v > 15) return false;
  *out = (uint8_t)v;
  return true;
}

void handleLine(char *line) {
  char *p = line;
  char *cmd = nextTok(&p);
  if (cmd == NULL) return;             // blank line, stay quiet

  if (!strcmp(cmd, "ping")) {
    Serial.println(F("OK pong"));

  } else if (!strcmp(cmd, "a")) {
    uint8_t ch; long deg;
    if (!getChannel(&p, &ch))         { Serial.println(F("ERR channel 0-15")); return; }
    if (!parseInt(nextTok(&p), &deg)) { Serial.println(F("ERR want: a <ch> <deg>")); return; }
    if (deg < 0 || deg > 180)         { Serial.println(F("ERR angle 0-180")); return; }
    uint16_t us = angleToUs(deg);
    sweeping = false;
    writeUs(ch, us);
    Serial.print(F("OK a ")); Serial.print(ch);
    Serial.print(' '); Serial.print(deg);
    Serial.print(' '); Serial.println(us);

  } else if (!strcmp(cmd, "u")) {
    uint8_t ch; long us;
    if (!getChannel(&p, &ch))        { Serial.println(F("ERR channel 0-15")); return; }
    if (!parseInt(nextTok(&p), &us)) { Serial.println(F("ERR want: u <ch> <us>")); return; }
    if (us < PULSE_FLOOR || us > PULSE_CEIL) {
      Serial.println(F("ERR pulse 400-2600")); return;
    }
    sweeping = false;
    writeUs(ch, us);
    Serial.print(F("OK u ")); Serial.print(ch);
    Serial.print(' '); Serial.println(us);

  } else if (!strcmp(cmd, "m")) {
    // Validate every pair before moving anything, so a bad line never
    // leaves the robot half-updated.
    uint8_t  chs[16];
    uint16_t uss[16];
    uint8_t  n = 0;
    char *tok;
    while ((tok = nextTok(&p)) != NULL) {
      long ch, us;
      if (n >= 16 || !parseInt(tok, &ch) || ch < 0 || ch > 15 ||
          !parseInt(nextTok(&p), &us) || us < PULSE_FLOOR || us > PULSE_CEIL) {
        Serial.println(F("ERR want: m <ch> <us> ... (ch 0-15, us 400-2600)")); return;
      }
      chs[n] = ch; uss[n] = us; n++;
    }
    if (n == 0) { Serial.println(F("ERR want: m <ch> <us> ...")); return; }
    sweeping = false;
    for (uint8_t i = 0; i < n; i++) writeUs(chs[i], uss[i]);
    Serial.print(F("OK m ")); Serial.println(n);

  } else if (!strcmp(cmd, "off")) {
    uint8_t ch;
    if (!getChannel(&p, &ch)) { Serial.println(F("ERR channel 0-15")); return; }
    if (ch == sweepChannel) sweeping = false;
    pwm.setPWM(ch, 0, 4096);           // full-off bit, kills the pulse train
    Serial.print(F("OK off ")); Serial.println(ch);

  } else if (!strcmp(cmd, "range")) {
    long lo, hi;
    if (!parseInt(nextTok(&p), &lo) || !parseInt(nextTok(&p), &hi)) {
      Serial.println(F("ERR want: range <min> <max>")); return;
    }
    if (lo < PULSE_FLOOR || hi > PULSE_CEIL || lo >= hi) {
      Serial.println(F("ERR range must sit inside 400-2600 with min < max")); return;
    }
    pulseMinUs = lo; pulseMaxUs = hi;
    Serial.print(F("OK range ")); Serial.print(lo);
    Serial.print(' '); Serial.println(hi);

  } else if (!strcmp(cmd, "sweep")) {
    long on;
    if (!parseInt(nextTok(&p), &on) || (on != 0 && on != 1)) {
      Serial.println(F("ERR want: sweep <0|1>")); return;
    }
    sweeping = (on == 1);
    Serial.print(F("OK sweep ")); Serial.println(on);

  } else if (!strcmp(cmd, "selftest")) {
    selfTest();
    Serial.println(F("OK selftest"));

  } else if (!strcmp(cmd, "help")) {
    Serial.println(F("# ping                 -> OK pong"));
    Serial.println(F("# a <ch> <deg>         angle 0-180"));
    Serial.println(F("# u <ch> <us>          raw pulse 400-2600"));
    Serial.println(F("# m <ch> <us> ...      several raw pulses in one line"));
    Serial.println(F("# off <ch>             stop pulsing, servo goes limp"));
    Serial.println(F("# range <min> <max>    us endpoints mapped to 0/180"));
    Serial.println(F("# sweep <0|1>          autonomous sweep on channel 0"));
    Serial.println(F("# selftest             one slow demo sweep on ch 0"));
    Serial.println(F("OK help"));

  } else {
    Serial.print(F("ERR unknown command: ")); Serial.println(cmd);
  }
}

// --- lifecycle -------------------------------------------------------

// One slow out-and-back on channel 0. Run via the "selftest" command when
// you want to confirm the hardware without involving host logic.
void selfTest() {
  Serial.println(F("# self test: sweeping channel 0"));
  for (int d = 90; d <= 180; d += 2) { writeUs(0, angleToUs(d)); delay(12); }
  for (int d = 180; d >= 0; d -= 2)  { writeUs(0, angleToUs(d)); delay(12); }
  for (int d = 0; d <= 90; d += 2)   { writeUs(0, angleToUs(d)); delay(12); }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }

  Wire.begin();

  // Probe before trusting the shield -- a silent no-op is the most common
  // cause of a servo that will not move.
  Wire.beginTransmission(0x40);
  bool found = (Wire.endTransmission() == 0);

  pwm.begin();
  // Clone boards usually carry a 25 MHz crystal (Adafruit's own want ~27).
  // If a commanded 1500 us measures long or short, scale this to match.
  pwm.setOscillatorFrequency(25000000);
  pwm.setPWMFreq(SERVO_FREQ_HZ);
  delay(10);
  usPerTick = 1000000.0 * (pwm.readPrescale() + 1) / 25000000.0;
  Wire.setClock(400000);               // PCA9685 is fine at 400 kHz I2C

  // No self-test on boot. Opening the serial port resets the Uno, so an
  // automatic sweep here would run before every single host connection.
  // Use the "selftest" command when you actually want it.
  if (found) {
    Serial.println(F("# PCA9685 found at 0x40"));
  } else {
    Serial.println(F("# WARNING: nothing responding at I2C 0x40"));
    Serial.println(F("# check the shield is seated, powered, no address jumpers"));
  }

  // The host waits for this line before sending anything.
  Serial.println(F("READY"));
}

void loop() {
  static char    buf[128];              // room for an "m" line with 12+ servos
  static uint8_t len = 0;

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (len < sizeof(buf) - 1) buf[len++] = c;
      continue;
    }
    buf[len] = '\0';
    len = 0;
    handleLine(buf);
  }

  if (sweeping) {
    static uint16_t deg  = 90;
    static int8_t   dir  = 1;
    static uint32_t last = 0;
    if (millis() - last >= 15) {
      last = millis();
      deg += dir;
      if (deg >= 180) { deg = 180; dir = -1; }
      if (deg == 0)   { dir = 1; }
      writeUs(sweepChannel, angleToUs(deg));
    }
  }
}
