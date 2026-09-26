// matrix_firmware.ino
// Turns the Arduino into a "dumb display": Python on your computer sends
// commands over USB serial, and this sketch just puts them on the LEDs.
//
// Protocol (every command gets a 1-byte reply):
//   'F' + NUM_LEDS*3 bytes (R,G,B per LED, in strip order)  -> show frame, reply 'K'
//   'B' + 1 byte (0-255)                                    -> set brightness, reply 'K'
//   '?'                                                      -> reply 'R' + NUM_LEDS as 2 bytes (high, low)
// On a timeout or bad packet it replies 'E' and discards input until the line goes quiet.

#include <Adafruit_NeoPixel.h>

#define DATA_PIN   6        // Arduino digital pin connected to DIN
#define NUM_LEDS   64     // Must match width * height in the Python code
#define BAUD       500000   // Must match the Python code. Use 115200 if you get errors.

Adafruit_NeoPixel matrix(NUM_LEDS, DATA_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(BAUD);
  Serial.setTimeout(100);   // ms to wait for the rest of a packet before giving up
  matrix.begin();
  matrix.setBrightness(30); // Keep low while testing; Python can change it
  matrix.clear();
  matrix.show();
  Serial.write('R');        // Tell Python we've booted
}

void loop() {
  if (!Serial.available()) return;

  char cmd = Serial.read();
  switch (cmd) {
    case 'F': readFrame();      break;
    case 'B': readBrightness(); break;
    case '?': sendInfo();       break;
    default:  break;            // Ignore stray bytes
  }
}

void readFrame() {
  uint8_t rgb[3];
  for (uint16_t i = 0; i < NUM_LEDS; i++) {
    if (Serial.readBytes((char*)rgb, 3) != 3) { fail(); return; }
    matrix.setPixelColor(i, rgb[0], rgb[1], rgb[2]);
  }
  // show() briefly disables interrupts, so incoming serial bytes would be lost.
  // That's why Python waits for 'K' before sending anything else.
  matrix.show();
  Serial.write('K');
}

void readBrightness() {
  uint8_t b;
  if (Serial.readBytes((char*)&b, 1) != 1) { fail(); return; }
  matrix.setBrightness(b);
  matrix.show();
  Serial.write('K');
}

void sendInfo() {
  Serial.write('R');
  Serial.write((uint8_t)(NUM_LEDS >> 8));
  Serial.write((uint8_t)(NUM_LEDS & 0xFF));
}

void fail() {
  Serial.write('E');
  // Throw away whatever is left of the broken packet so it isn't read as commands
  unsigned long last = millis();
  while (millis() - last < 50) {
    if (Serial.available()) { Serial.read(); last = millis(); }
  }
}
