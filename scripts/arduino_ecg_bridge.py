#!/usr/bin/env python3
"""
scripts/arduino_ecg_bridge.py

BeatAhead Arduino Uno & AD8232 ECG Serial Bridge.
Reads live streaming analogRead(A0) data from Arduino over USB Serial,
applies real-time digital filtering (baseline wander, notch, bandpass),
computes instantaneous Heart Rate and ST-segment displacement,
and prints live telemetry or forwards to the BeatAhead web platform.

Usage:
    python scripts/arduino_ecg_bridge.py
    python scripts/arduino_ecg_bridge.py --port COM16 --baud 9600
"""

import sys
import time
import argparse
from pathlib import Path

# Add backend to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "backend"))

from backend.src.ecg_dsp import RealTimeECGFilter, analyze_ecg_window

# Optional PySerial
try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

# Optional NeuroKit2
try:
    import neurokit2 as nk
    HAS_NEUROKIT = True
except ImportError:
    HAS_NEUROKIT = False


def find_arduino_port() -> Optional[str]:
    """Auto-detect connected Arduino Uno or serial ports."""
    if not HAS_SERIAL:
        return None
    ports = serial.tools.list_ports.comports()
    for port in ports:
        desc = (port.description or "").lower()
        mfg = (port.manufacturer or "").lower()
        if "arduino" in desc or "ch340" in desc or "usb-serial" in desc or "arduino" in mfg:
            return port.device
    if ports:
        return ports[0].device
    return None


def main():
    parser = argparse.ArgumentParser(description="BeatAhead Arduino AD8232 ECG Signal Processor Bridge")
    parser.add_argument("--port", type=str, default=None, help="Serial port (e.g. COM16 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default 9600)")
    parser.add_argument("--demo", action="store_true", help="Run in synthetic simulation mode if no Arduino is connected")
    args = parser.parse_args()

    port = args.port
    if not port and HAS_SERIAL:
        port = find_arduino_port()

    print("=" * 65)
    print("  BeatAhead: Arduino AD8232 ECG Signal Processing Bridge")
    print(f"  PySerial: {'Available' if HAS_SERIAL else 'Not Installed (pip install pyserial)'}")
    print(f"  NeuroKit2: {'Available' if HAS_NEUROKIT else 'Optional (pip install neurokit2)'}")
    print("=" * 65)

    if not HAS_SERIAL or (not port and not args.demo):
        print("\n[!] PySerial is required for real hardware serial reading.")
        print("    Install via: pip install pyserial")
        print("    Or run with --demo to preview signal processing in simulation mode.\n")
        if not args.demo:
            sys.exit(1)

    print(f"Connecting to Serial Port: {port or 'SIMULATION'} @ {args.baud} baud...")

    filter_engine = RealTimeECGFilter(sampling_rate=250.0)
    window_buffer = []
    window_size = 500  # 2-second sliding window at 250 Hz
    sample_count = 0
    start_time = time.time()

    ser = None
    if port and HAS_SERIAL:
        try:
            ser = serial.Serial(port, args.baud, timeout=1.0)
            print(f"✓ Successfully opened {port}! Streaming live telemetry...")
            print("Press Ctrl+C to exit.\n")
        except Exception as e:
            print(f"[-] Could not open serial port {port}: {e}")
            print("Switching to simulation mode.\n")
            ser = None

    try:
        while True:
            raw_val = None
            if ser and ser.is_open:
                try:
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not line:
                        continue
                    if line == "!":
                        print("\r[LEADS OFF] ! Electrodes detached or poor skin contact!               ", end="", flush=True)
                        time.sleep(0.05)
                        continue
                    raw_val = float(line)
                except ValueError:
                    continue
                except Exception as e:
                    print(f"\nSerial read error: {e}")
                    break
            else:
                # Synthetic ECG demo if hardware not currently attached
                import math
                t = time.time() - start_time
                # Synthetic ECG waveform formula
                raw_val = 512.0 + 120.0 * math.sin(t * 2 * math.pi * 1.2)
                time.sleep(0.004)

            # Filter single sample
            mv = filter_engine.process_sample(raw_val)
            window_buffer.append(raw_val)
            sample_count += 1

            if len(window_buffer) >= window_size:
                # Perform periodic window analysis
                analysis = analyze_ecg_window(window_buffer, sampling_rate=250.0)
                bpm = analysis["heart_rate_bpm"]
                st_mm = analysis["st_deviation_mm"]
                alert = analysis["is_ischemic_alert"]
                sqi = analysis["signal_quality_percent"]
                tier = analysis["risk_tier"]

                alert_flag = "🚨 ISCHEMIC ALERT!" if alert else "✓ NORMAL"
                print(f"\r[ECG LIVE] HR: {bpm:5.1f} bpm | ST Shift: {st_mm:+5.2f} mm | Quality: {sqi:3d}% | Status: {alert_flag} ({tier})   ", end="", flush=True)

                # Slide window forward by 100 samples
                window_buffer = window_buffer[100:]

    except KeyboardInterrupt:
        print("\n\nExiting ECG Signal Bridge. Telemetry closed.")
    finally:
        if ser and ser.is_open:
            ser.close()


if __name__ == "__main__":
    main()
