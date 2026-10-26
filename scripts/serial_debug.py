#!/usr/bin/env python3
"""
BeatAhead - Arduino Serial Diagnostic Tool
Run this to see exactly what your Arduino is sending.

Usage:
    python scripts/serial_debug.py
    python scripts/serial_debug.py --port COM16
"""
import sys
import time
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=str, default=None)
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--seconds", type=int, default=10)
    args = parser.parse_args()

    # Try to import pyserial
    try:
        import serial
        import serial.tools.list_ports
    except ImportError:
        print("\n[!] pyserial not installed. Installing now...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyserial"])
        import serial
        import serial.tools.list_ports
        print("[+] pyserial installed!\n")

    print("=" * 60)
    print("  BeatAhead Arduino Serial Diagnostic")
    print("=" * 60)

    # List all available COM ports
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("\n[!] NO serial ports found on this PC!")
        print("    Is the Arduino plugged in via USB?")
        print("    Try unplugging and re-plugging the USB cable.")
        return

    print(f"\nFound {len(ports)} serial port(s):")
    for p in ports:
        print(f"  -> {p.device:10s}  {p.description}")

    # Auto-detect or use specified port
    port = args.port
    if not port:
        # Try to auto-detect Arduino
        for p in ports:
            desc = (p.description or "").lower()
            if any(x in desc for x in ["arduino", "ch340", "usb serial", "uart"]):
                port = p.device
                print(f"\n[+] Auto-detected: {port} ({p.description})")
                break
        if not port:
            port = ports[0].device
            print(f"\n[~] Using first port: {port}")

    print(f"\nConnecting to {port} at {args.baud} baud...")
    print(f"Listening for {args.seconds} seconds. Touch electrodes to your chest!\n")
    print("-" * 60)

    try:
        ser = serial.Serial(port, args.baud, timeout=1.0)
        time.sleep(2.0)  # Wait for Arduino to reset

        values = []
        exclamations = 0
        errors = 0
        start = time.time()
        count = 0

        while time.time() - start < args.seconds:
            try:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                count += 1
                if line == "!":
                    exclamations += 1
                    if count <= 20:
                        print(f"  [{count:4d}] LEADS-OFF signal: '!'  (electrodes not detecting skin)")
                else:
                    try:
                        val = int(line)
                        values.append(val)
                        if count <= 30:
                            bar = "#" * int((val / 1023) * 40)
                            print(f"  [{count:4d}] ADC = {val:4d}  |{bar:<40}|")
                    except ValueError:
                        errors += 1
                        if count <= 10:
                            print(f"  [{count:4d}] Unknown data: '{line}'")

            except Exception as e:
                print(f"  [!] Read error: {e}")
                break

        ser.close()

        print("\n" + "=" * 60)
        print("  DIAGNOSTIC RESULTS")
        print("=" * 60)
        print(f"  Total lines received : {count}")
        print(f"  ADC values (ECG)     : {len(values)}")
        print(f"  Leads-Off signals    : {exclamations}")
        print(f"  Parse errors         : {errors}")

        if len(values) > 0:
            print(f"\n  ADC Range: min={min(values)}, max={max(values)}, avg={sum(values)//len(values)}")
            span = max(values) - min(values)
            print(f"  Signal Span: {span} ADC counts")

            print("\n" + "=" * 60)
            if span < 5:
                print("  RESULT: FLAT SIGNAL (span < 5 counts)")
                print("  -> OUTPUT pin may be disconnected from A0")
                print("  -> Or electrode contact is very poor")
                print("  -> Check: AD8232 OUTPUT -> Arduino A0 wire")
            elif span < 30:
                print("  RESULT: WEAK SIGNAL (span < 30 counts)")
                print("  -> Poor electrode contact with skin")
                print("  -> Press pads firmly, use slightly damp skin")
                print("  -> Try licking fingertips and holding all 3 wires")
            else:
                print("  RESULT: GOOD SIGNAL DETECTED!")
                print("  -> Hardware is working correctly")
                print("  -> Open https://beataheadheart-l4x4.vercel.app/monitor")
                print("  -> in Google Chrome and click 'Connect Arduino USB'")

        elif exclamations > count * 0.8:
            print("\n" + "=" * 60)
            print("  RESULT: CONTINUOUS LEADS-OFF ('!' signal)")
            print("  This means LO+ or LO- pin is HIGH (electrode not on skin)")
            print()
            print("  FIX OPTIONS:")
            print("  1. Make sure all 3 electrode pads are firmly on skin")
            print("  2. Check that LO+ wire -> Arduino Pin 10")
            print("  3. Check that LO- wire -> Arduino Pin 11")
            print("  4. If LO pins are unconnected/floating -> always shows '!'")
            print("     QUICK FIX: Connect a 10k resistor from D10->GND and D11->GND")
            print("     OR: Modify sketch to remove leads-off check entirely")

        elif count == 0:
            print("\n" + "=" * 60)
            print("  RESULT: NO DATA RECEIVED!")
            print("  -> Wrong COM port? Try: python scripts/serial_debug.py --port COM??")
            print("  -> Arduino sketch not uploaded?")
            print("  -> Wrong baud rate? Default is 9600")

        print("=" * 60)

    except serial.SerialException as e:
        print(f"\n[!] Could not open {port}: {e}")
        print("\nPossible causes:")
        print("  1. Arduino IDE Serial Monitor is open (close it first!)")
        print("  2. Wrong COM port number")
        print("  3. Arduino not plugged in")
        print(f"\nTry: python scripts/serial_debug.py --port COM??")
        print("Replace ?? with the port number shown above")


if __name__ == "__main__":
    main()
