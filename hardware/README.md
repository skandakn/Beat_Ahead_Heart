# BeatAhead Hardware Interface Guide: Arduino UNO & AD8232 ECG Sensor

This guide explains how to connect your physical **SparkFun / Analog Devices AD8232** Heart Rate & ECG Monitor to an **Arduino UNO** and stream live cardiac waveforms directly into the BeatAhead platform.

---

## 1. Pin Wiring Diagram

| AD8232 ECG Board Pin | Arduino UNO Pin | Wire Color Recommendation | Notes |
| :--- | :--- | :--- | :--- |
| **GND** | **GND** | Black / Brown | Common ground reference |
| **3.3V** | **3.3V** | Red / Orange | Powers the AD8232 analog front-end |
| **OUTPUT** | **A0 (Analog 0)** | Yellow | Raw analog ECG voltage (0 to 3.3V mapped to 0–1023 ADC) |
| **LO-** | **Pin 11 (Digital 11)** | Green | Leads-Off negative threshold detection |
| **LO+** | **Pin 10 (Digital 10)** | Blue | Leads-Off positive threshold detection |
| **SDN** | *Not Connected* | — | Shutdown pin (leave floating / open) |

---

## 2. Electrode Pad Placement on Body (Lead II)

For optimal cardiac axis orientation (Lead II), snap the 3-lead cables onto gel pads before attaching to clean, dry skin:

1. **RA (Red - Right Arm):** Place just below the right clavicle (collarbone) near the right shoulder.
2. **LA (Yellow - Left Arm):** Place below the left clavicle near the left shoulder or along the left lower rib cage.
3. **RL (Green - Right Leg / Reference):** Place on the right lower abdomen or right hip (acts as the electrical ground reference to eliminate 50/60 Hz ambient interference).

---

## 3. Uploading Code to Arduino

1. Open the [arduino_ad8232_beatahead.ino](file:///c:/ischemic/hardware/arduino_ad8232_beatahead/arduino_ad8232_beatahead.ino) sketch in the Arduino IDE.
2. Select your board: **Tools > Board > Arduino UNO**.
3. Select the serial port: **Tools > Port > COMxx** (e.g., `COM16` on Windows, `/dev/ttyUSB0` on Linux/macOS).
4. Click **Upload** (Arrow button).
5. Open **Tools > Serial Plotter** at **9600 baud** to confirm that the blue ECG tracing shows clear P-Q-R-S-T complexes.

---

## 4. Connecting Directly to BeatAhead Web App

1. Open the live BeatAhead application: [https://beataheadheart-l4x4.vercel.app/monitor](https://beataheadheart-l4x4.vercel.app/monitor) in Google Chrome or Microsoft Edge.
2. Click **"Connect Arduino USB (Web Serial)"**.
3. Select your Arduino UNO from the browser prompt and click **Connect**.
4. The live sweeping medical oscilloscope will immediately begin rendering the cardiac waveform, detecting instantaneous heart rate, and tracking ST-segment ischemic deviations in real time!
