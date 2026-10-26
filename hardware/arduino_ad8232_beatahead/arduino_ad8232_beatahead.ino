/*
  BeatAhead - Arduino UNO & AD8232 ECG Sensor Telemetry Sketch
  
  Pins Configuration:
  -------------------
  AD8232 Pin  ->  Arduino UNO Pin
  -------------------------------
  GND         ->  GND
  3.3V        ->  3.3V
  OUTPUT      ->  A0 (Analog 0)
  LO-         ->  Pin 11 (Digital 11)
  LO+         ->  Pin 10 (Digital 10)
  SDN         ->  Not Connected (Leave Open)

  Electrode Placement (Lead II Standard):
  ---------------------------------------
  RA (Red)    ->  Right Arm / Right Clavicle (below right shoulder)
  LA (Yellow) ->  Left Arm / Left Rib (anterior axillary line)
  RL (Green)  ->  Right Leg / Lower Right Abdomen (Ground / Reference)

  Serial Protocol:
  ----------------
  Baud rate: 9600 bps
  - If electrodes disconnect (LO+ or LO- is HIGH): prints '!'
  - When leads are connected: prints raw ADC value from A0 (0 to 1023)
  
  Compatible with:
  1. Arduino Serial Plotter (Tools -> Serial Plotter)
  2. BeatAhead Web Serial Direct Browser Interface (Chrome / Edge)
  3. BeatAhead Python Signal Processing Bridge (arduino_ecg_bridge.py)
*/

void setup() {
  // Initialize serial communication at 9600 baud rate:
  Serial.begin(9600);
  
  // Setup digital pins for leads off detection:
  pinMode(10, INPUT); // LO +
  pinMode(11, INPUT); // LO -
}

void loop() {
  // Check if either leads-off detection pin is active:
  if ((digitalRead(10) == 1) || (digitalRead(11) == 1)) {
    Serial.println('!');
  } else {
    // Send the raw analog value of input 0 (0 - 1023):
    Serial.println(analogRead(A0));
  }
  
  // Wait 2 milliseconds to keep serial data rate stable (~250-400 Hz sampling):
  delay(2);
}
