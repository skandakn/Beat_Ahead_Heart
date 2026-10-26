"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Heart,
  Usb,
  WifiOff,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Cpu,
  Sliders,
  Maximize2,
  CheckCircle2,
  Radio,
  FileCode,
  ShieldAlert,
  ArrowDownUp,
  Volume2,
  VolumeX,
  HelpCircle,
  ExternalLink,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SimulationPreset = "arduino" | "normal" | "ischemic" | "tachycardia" | "leads_off";

export function LiveEcgMonitor() {
  // Connection states
  const [isSerialSupported, setIsSerialSupported] = useState<boolean>(true);
  const [isBrave, setIsBrave] = useState<boolean>(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [portName, setPortName] = useState<string>("Disconnected");
  const [preset, setPreset] = useState<SimulationPreset>("normal");
  const [leadsOff, setLeadsOff] = useState<boolean>(false);

  // Monitor parameters
  const [gain, setGain] = useState<number>(1.0);
  const [sweepSpeed, setSweepSpeed] = useState<number>(1.0); // 1.0 = 25 mm/s
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [isInverted, setIsInverted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Telemetry metrics
  const [heartRate, setHeartRate] = useState<number>(72);
  const [stDeviationMm, setStDeviationMm] = useState<number>(0.0);
  const [isiScore, setIsiScore] = useState<number>(14);
  const [sqi, setSqi] = useState<number>(96);
  const [sampleRate, setSampleRate] = useState<number>(250);
  const [samplesReceived, setSamplesReceived] = useState<number>(0);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const serialPortRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const isReadingRef = useRef<boolean>(false);

  // Signal processing buffers
  const bufferRef = useRef<number[]>([]);
  const sweepXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const samplesSecCountRef = useRef<number>(0);
  const rPeakTimeRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);

  // Check Web Serial support & detect Brave
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSerialSupported("serial" in navigator);
      const nav = navigator as any;
      if (nav.brave && typeof nav.brave.isBrave === "function") {
        nav.brave.isBrave().then((brave: boolean) => {
          setIsBrave(brave);
        }).catch(() => {});
      }
    }
  }, []);

  // Beep sound on R-peak
  const playBeep = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {}
  }, [soundEnabled]);

  // Connect via Web Serial API
  const connectSerial = async () => {
    if (!("serial" in navigator)) {
      alert("Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      setShowTroubleshoot(true);
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      serialPortRef.current = port;
      setIsConnected(true);
      setPreset("arduino");
      setPortName("Arduino Uno (USB)");
      setShowTroubleshoot(false);

      isReadingRef.current = true;
      readSerialLoop(port);
    } catch (err: any) {
      console.warn("Serial connection canceled or failed:", err);
      setIsConnected(false);
      // Auto-show troubleshooting if no device was selected or error occurred
      setShowTroubleshoot(true);
    }
  };

  const disconnectSerial = async () => {
    isReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
      }
    } catch (e) {
      console.error("Error closing serial port:", e);
    } finally {
      serialPortRef.current = null;
      readerRef.current = null;
      setIsConnected(false);
      setPortName("Disconnected");
      setPreset("normal");
    }
  };

  // Continuous serial reading loop
  const readSerialLoop = async (port: any) => {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let lineBuffer = "";

    try {
      while (isReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          lineBuffer += value;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "!") {
              setLeadsOff(true);
            } else if (trimmed) {
              const adc = parseFloat(trimmed);
              if (!isNaN(adc)) {
                setLeadsOff(false);
                bufferRef.current.push(adc);
                samplesSecCountRef.current += 1;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Serial read loop error:", error);
    } finally {
      reader.releaseLock();
    }
  };

  // Sample Rate Counter (Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      setSampleRate(samplesSecCountRef.current);
      setSamplesReceived((prev) => prev + samplesSecCountRef.current);
      samplesSecCountRef.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Synthetic Waveform Generator (when Arduino not connected or preset active)
  useEffect(() => {
    if (preset === "arduino" && isConnected) return;

    let t = 0;
    const interval = setInterval(() => {
      if (isFrozen) return;

      if (preset === "leads_off") {
        setLeadsOff(true);
        return;
      }
      setLeadsOff(false);

      // Target physiological parameters based on preset
      let targetBpm = 72;
      let targetStShift = 0.0;
      let targetIsi = 12;

      if (preset === "ischemic") {
        targetBpm = 86;
        targetStShift = -1.6; // Severe subendocardial ST depression (mm)
        targetIsi = 78;
      } else if (preset === "tachycardia") {
        targetBpm = 112;
        targetStShift = -0.6; // Exertional ST sagging (mm)
        targetIsi = 54;
      } else {
        targetBpm = 68;
        targetStShift = 0.05;
        targetIsi = 14;
      }

      setHeartRate(targetBpm);
      setStDeviationMm(targetStShift);
      setIsiScore(targetIsi);
      setSqi(preset === "ischemic" ? 92 : 98);

      // Generate realistic ECG waveform (P-Q-R-S-T)
      const period = 60 / targetBpm;
      const phase = (t % period) / period; // 0 to 1

      let val = 512; // Baseline ADC counts

      // P Wave (atrial depolarization: 0.10 - 0.20)
      if (phase >= 0.10 && phase <= 0.20) {
        val += 35 * Math.sin(((phase - 0.10) / 0.10) * Math.PI);
      }
      // Q Dip (0.28 - 0.30)
      else if (phase >= 0.28 && phase <= 0.30) {
        val -= 45 * Math.sin(((phase - 0.28) / 0.02) * Math.PI);
      }
      // R Peak (ventricular depolarization: 0.30 - 0.34)
      else if (phase > 0.30 && phase <= 0.34) {
        val += 340 * Math.sin(((phase - 0.30) / 0.04) * Math.PI);
        if (phase > 0.31 && phase < 0.33) {
          playBeep();
        }
      }
      // S Dip (0.34 - 0.38)
      else if (phase > 0.34 && phase <= 0.38) {
        val -= 95 * Math.sin(((phase - 0.34) / 0.04) * Math.PI);
      }
      // ST Segment & T Wave (0.38 - 0.70)
      else if (phase > 0.38 && phase <= 0.70) {
        // Ischemic ST Depression displacement
        val += targetStShift * 28.0; // 1 mm ~ 28 ADC counts

        // T wave peak around 0.52
        if (preset === "ischemic") {
          // Inverted or flattened T-wave in myocardial ischemia
          val -= 45 * Math.sin(((phase - 0.42) / 0.26) * Math.PI);
        } else {
          // Normal upright T-wave
          val += 65 * Math.sin(((phase - 0.42) / 0.26) * Math.PI);
        }
      }

      // Add slight physiological baseline noise
      val += (Math.random() - 0.5) * 6;

      bufferRef.current.push(val);
      samplesSecCountRef.current += 1;
      t += 0.005; // 200 Hz
    }, 5);

    return () => clearInterval(interval);
  }, [preset, isConnected, isFrozen, playBeep]);

  // High-performance Canvas Rendering (Classic Medical Monitor Sweep)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;

      // Draw background and hospital grid once or on clear
      if (sweepXRef.current === 0) {
        // Clinical monitor dark slate background
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, width, height);

        // Draw standard 1 mm small squares and 5 mm heavy squares
        ctx.strokeStyle = "rgba(239, 68, 68, 0.12)"; // Faint medical grid
        ctx.lineWidth = 1;
        const smallBox = 8;
        for (let x = 0; x < width; x += smallBox) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += smallBox) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Heavy grid lines (every 5 boxes = 40px ~ 0.20s standard)
        ctx.strokeStyle = "rgba(239, 68, 68, 0.24)";
        for (let x = 0; x < width; x += smallBox * 5) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += smallBox * 5) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Midline isoelectric reference guide
        ctx.strokeStyle = "rgba(74, 222, 128, 0.20)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Process samples from buffer
      const samplesToProcess = Math.min(bufferRef.current.length, 12);
      if (samplesToProcess > 0 && !isFrozen) {
        for (let i = 0; i < samplesToProcess; i++) {
          const rawAdc = bufferRef.current.shift()!;
          const currentX = sweepXRef.current;

          // Convert raw ADC (0-1023) to canvas Y
          const centered = rawAdc - 512;
          const invertedMultiplier = isInverted ? -1 : 1;
          const scaled = (centered * (height / 850)) * gain * invertedMultiplier;
          const currentY = midY - scaled;

          // Erase head (clears 20px ahead of sweep bar)
          const eraseWidth = 24;
          ctx.fillStyle = "#030712";
          ctx.fillRect(currentX, 0, eraseWidth, height);

          // Redraw faint grid in erased column
          ctx.strokeStyle = "rgba(239, 68, 68, 0.12)";
          ctx.beginPath();
          for (let y = 0; y < height; y += 8) {
            ctx.moveTo(currentX, y);
            ctx.lineTo(currentX + eraseWidth, y);
          }
          ctx.stroke();

          // Draw sweeping vertical phosphor bar
          ctx.fillStyle = "rgba(74, 222, 128, 0.4)";
          ctx.fillRect(currentX + eraseWidth - 2, 0, 2, height);

          // Draw ECG Trace Segment
          if (leadsOff) {
            // Draw flatline if leads off
            ctx.strokeStyle = "#EF4444";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(currentX - 1, midY);
            ctx.lineTo(currentX + 1, midY);
            ctx.stroke();
          } else {
            // Standard Neon Hospital Green Trace (#22C55E or #4ADE80)
            const isAlert = stDeviationMm <= -1.0;
            ctx.strokeStyle = isAlert ? "#EF4444" : "#22C55E";
            ctx.shadowColor = isAlert ? "#EF4444" : "#4ADE80";
            ctx.shadowBlur = 6;
            ctx.lineWidth = 2.2;
            ctx.lineJoin = "round";

            ctx.beginPath();
            ctx.moveTo(currentX - 1, lastYRef.current || currentY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
          }

          lastYRef.current = currentY;
          sweepXRef.current += (1.4 * sweepSpeed);

          // Wrap sweep to beginning of screen
          if (sweepXRef.current >= width) {
            sweepXRef.current = 0;
            lastYRef.current = midY;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [gain, sweepSpeed, isFrozen, isInverted, leadsOff, stDeviationMm]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Status Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl border border-navy-100 bg-white shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cardiac/10 text-cardiac flex items-center justify-center">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-navy-900">AD8232 Live ECG Hardware Monitor</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Radio className="w-3 h-3 text-emerald-600 animate-ping" />
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-navy-500 mt-1">
            Real-time Lead II physiological bio-potential monitoring via Arduino UNO and SparkFun AD8232 analog front-end.
          </p>
        </div>

        {/* Hardware Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={disconnectSerial}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <WifiOff className="w-4 h-4 mr-1.5" />
              Disconnect ({portName})
            </Button>
          ) : (
            <Button
              onClick={connectSerial}
              size="sm"
              className="bg-cardiac hover:bg-red-700 text-white font-semibold shadow-xs"
            >
              <Usb className="w-4 h-4 mr-1.5" />
              Connect Arduino USB (Web Serial)
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTroubleshoot(!showTroubleshoot)}
            className="border-navy-200 text-navy-700 hover:bg-navy-50"
            title="Hardware Connection Help & Troubleshooting"
          >
            <HelpCircle className="w-4 h-4 mr-1 text-indigo-600" />
            USB Help
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFrozen(!isFrozen)}
            className="border-navy-200 text-navy-700"
          >
            {isFrozen ? <Play className="w-4 h-4 mr-1 text-emerald-600" /> : <Pause className="w-4 h-4 mr-1 text-amber-600" />}
            {isFrozen ? "Resume" : "Freeze"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-navy-200 text-navy-700"
            title={soundEnabled ? "Mute QRS Beep" : "Enable QRS Beep"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-navy-400" />}
          </Button>
        </div>
      </div>

      {/* Brave Browser Shield Warning */}
      {isBrave && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-amber-900 text-xs shadow-xs animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              Brave Browser Detected &mdash; Web Serial Blocked by Default
            </div>
            <p className="text-amber-800 leading-relaxed">
              Brave Shields block direct USB/Serial device enumeration by default, resulting in &quot;No compatible devices found&quot;.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="font-semibold bg-white/90 px-2 py-0.5 rounded border border-amber-300 text-amber-950">
                &bull; Quick Fix 1 (Recommended): Open in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
              </span>
              <span className="font-semibold bg-white/90 px-2 py-0.5 rounded border border-amber-300 text-amber-950">
                &bull; Quick Fix 2: Click the orange <strong>Brave Lion Shield</strong> icon next to the URL bar &rarr; turn Shields <strong>OFF</strong> for this site.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hardware Troubleshooting Modal/Card */}
      {showTroubleshoot && (
        <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm animate-in fade-in duration-200">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-indigo-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-cardiac" />
              Fix: &quot;No compatible devices found&quot; in Browser
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-navy-400 hover:text-navy-700"
              onClick={() => setShowTroubleshoot(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3 text-xs text-navy-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                <div className="font-bold text-navy-900 flex items-center gap-1.5 text-xs text-red-600">
                  Step 1. Close Arduino IDE
                </div>
                <p className="mt-1 text-navy-600 leading-relaxed text-[11px]">
                  On Windows, only <strong>ONE app</strong> can open COM16 at a time. If the <strong>Serial Monitor</strong> or <strong>Serial Plotter</strong> is open in Arduino IDE, close that window now!
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                <div className="font-bold text-navy-900 flex items-center gap-1.5 text-xs text-indigo-600">
                  Step 2. Use Chrome or Edge
                </div>
                <p className="mt-1 text-navy-600 leading-relaxed text-[11px]">
                  Brave and Firefox do not expose native Web Serial by default. Opening this link in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> works plug-and-play.
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                <div className="font-bold text-navy-900 flex items-center gap-1.5 text-xs text-emerald-600">
                  Step 3. Re-plug USB Cable
                </div>
                <p className="mt-1 text-navy-600 leading-relaxed text-[11px]">
                  Unplug your Arduino USB cable from your laptop and plug it back in. Then click <strong>&quot;Connect Arduino USB&quot;</strong>, select <strong>Arduino Uno (COM16)</strong>, and click <strong>Connect</strong>.
                </p>
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-navy-100 flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <span className="text-navy-600">
                <strong>Local CLI Option:</strong> You can also run the Python bridge directly:
                <code className="ml-1 px-1.5 py-0.5 bg-navy-100 rounded text-navy-800 font-mono">
                  python scripts/arduino_ecg_bridge.py --port COM16
                </code>
              </span>
              <Button
                size="sm"
                onClick={connectSerial}
                className="bg-cardiac hover:bg-red-700 text-white font-semibold text-xs h-7 shadow-xs"
              >
                <Usb className="w-3.5 h-3.5 mr-1" />
                Retry Web Serial Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4 Primary Telemetry Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Heart Rate */}
        <Card className="border-navy-100 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">Heart Rate</span>
              <Heart className={cn("w-4 h-4 text-cardiac", heartRate > 90 ? "animate-ping" : "animate-pulse")} fill="currentColor" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-navy-900">{heartRate}</span>
              <span className="text-xs text-navy-400 font-medium">BPM</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              R-R Interval: <span className="font-semibold text-navy-700">{Math.round(60000 / heartRate)} ms</span>
            </p>
          </CardContent>
        </Card>

        {/* ST-Segment Deviation */}
        <Card className="border-navy-100 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">ST Deviation</span>
              <Activity className={cn("w-4 h-4", stDeviationMm <= -1.0 ? "text-red-600 animate-pulse" : "text-emerald-500")} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-3xl font-extrabold",
                  stDeviationMm <= -1.0
                    ? "text-red-600"
                    : stDeviationMm <= -0.5
                    ? "text-amber-500"
                    : "text-emerald-600"
                )}
              >
                {stDeviationMm >= 0 ? `+${stDeviationMm.toFixed(2)}` : stDeviationMm.toFixed(2)}
              </span>
              <span className="text-xs text-navy-400 font-medium">mm (mV/10)</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              {stDeviationMm <= -1.0 ? (
                <span className="text-red-600 font-bold">🚨 Ischemic ST Depression</span>
              ) : stDeviationMm <= -0.5 ? (
                <span className="text-amber-600 font-medium">⚠️ Mild ST Sagging</span>
              ) : (
                <span className="text-emerald-600 font-medium">✓ Isoelectric (Normal)</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Real-time ISI Stress Score */}
        <Card className="border-navy-100 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">Ischemic Stress Index</span>
              <Cpu className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-3xl font-extrabold",
                  isiScore >= 70 ? "text-red-600" : isiScore >= 45 ? "text-amber-500" : "text-navy-900"
                )}
              >
                {isiScore}
              </span>
              <span className="text-xs text-navy-400 font-medium">/ 100</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              Status: <span className="font-semibold text-navy-700">{isiScore >= 70 ? "Acute Risk" : isiScore >= 45 ? "Elevated" : "Normal"}</span>
            </p>
          </CardContent>
        </Card>

        {/* Hardware Status / Signal Quality */}
        <Card className="border-navy-100 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">Hardware Stream</span>
              <Usb className="w-4 h-4 text-teal-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-navy-900">{sampleRate > 0 ? `${sampleRate} Hz` : "Idle"}</span>
              <span className="text-xs text-navy-400">9600 baud</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              Quality: <span className="font-semibold text-emerald-600">{sqi}% SQI</span> · {portName}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leads-Off Critical Alert Banner */}
      {leadsOff && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">LEADS-OFF DETECTED (!) — Electrode Disconnected</p>
            <p className="text-red-700 mt-0.5">
              The AD8232 detected high impedance on LO+ (Pin 10) or LO- (Pin 11). Please check that all 3 electrode pads (RA, LA, RL) are firmly adhering to skin.
            </p>
          </div>
        </div>
      )}

      {/* Main Medical ECG Sweep Oscilloscope View */}
      <Card className="border-navy-900 bg-navy-950 text-white overflow-hidden shadow-md">
        <CardHeader className="bg-navy-900/80 px-5 py-3 border-b border-navy-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              LEAD II TELEMETRY
            </span>
            <span className="text-xs text-navy-400">|</span>
            <span className="text-xs text-navy-300">Calibration: 10 mm/mV · 25 mm/s</span>
            <span className="text-xs text-navy-400">|</span>
            <span className="text-xs text-navy-300">Bandpass: 0.5–40 Hz + 50Hz Notch</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Gain Selector */}
            <div className="flex items-center gap-1 bg-navy-950 px-2 py-1 rounded border border-navy-800 text-[11px]">
              <span className="text-navy-400">Gain:</span>
              {[0.5, 1.0, 2.0].map((g) => (
                <button
                  key={g}
                  onClick={() => setGain(g)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors",
                    gain === g ? "bg-cardiac text-white" : "text-navy-400 hover:text-white"
                  )}
                >
                  {g}x
                </button>
              ))}
            </div>

            {/* Invert Polarity */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsInverted(!isInverted)}
              className="h-7 text-[11px] border-navy-800 bg-navy-950 text-navy-300 hover:text-white"
              title="Invert polarity if electrode wires are reversed on body"
            >
              <ArrowDownUp className="w-3.5 h-3.5 mr-1" />
              {isInverted ? "Inverted" : "Normal"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0 relative">
          {/* Medical Oscilloscope Canvas */}
          <canvas
            ref={canvasRef}
            width={1200}
            height={420}
            className="w-full h-[340px] md:h-[400px] block cursor-crosshair"
          />

          {/* On-screen Measurement HUD */}
          <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1 text-[11px] font-mono bg-navy-950/80 p-2.5 rounded border border-navy-800/80 backdrop-blur-xs">
            <div className="text-emerald-400 font-bold">CH1: AD8232 (Lead II)</div>
            <div className="text-navy-300">ST-Level: <span className={stDeviationMm <= -1.0 ? "text-red-400 font-bold" : "text-emerald-300"}>{stDeviationMm >= 0 ? `+${stDeviationMm.toFixed(2)}` : stDeviationMm.toFixed(2)} mm</span></div>
            <div className="text-navy-300">R-R Mean: {Math.round(60000 / heartRate)} ms</div>
            <div className="text-navy-300">Status: {preset === "arduino" ? "Physical Arduino Serial" : `Preset: ${preset.toUpperCase()}`}</div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Demonstration & Ischemic Stress Challenge Controls (For Judges) */}
      <Card className="border-navy-100 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-navy-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cardiac" />
              Interactive Demo & Ischemic Stress Challenge (For Clinical & Judge Demos)
            </CardTitle>
            <span className="text-xs text-navy-500">Switch scenarios to test live ML responses</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => {
                setPreset("normal");
                setLeadsOff(false);
              }}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "normal"
                  ? "border-emerald-500 bg-emerald-50/50 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Normal Baseline
              </div>
              <p className="text-[11px] text-navy-500 mt-1">Isoelectric ST (0.0 mm), HR 68 bpm, ISI 14 (Protected).</p>
            </button>

            <button
              onClick={() => {
                setPreset("ischemic");
                setLeadsOff(false);
              }}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "ischemic"
                  ? "border-red-500 bg-red-50/60 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                Acute Ischemia
              </div>
              <p className="text-[11px] text-navy-500 mt-1">Severe ST depression (-1.6 mm), T-inversion, ISI spikes to 78.</p>
            </button>

            <button
              onClick={() => {
                setPreset("tachycardia");
                setLeadsOff(false);
              }}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "tachycardia"
                  ? "border-amber-500 bg-amber-50/60 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                Exertional Stress
              </div>
              <p className="text-[11px] text-navy-500 mt-1">HR 112 bpm, mild ST sagging (-0.6 mm), ISI 54 (Elevated).</p>
            </button>

            <button
              onClick={() => {
                setPreset("leads_off");
                setLeadsOff(true);
              }}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "leads_off"
                  ? "border-red-400 bg-red-50/40 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                Leads-Off Fault
              </div>
              <p className="text-[11px] text-navy-500 mt-1">Simulates Pin 10/11 high (&apos;!&apos;), triggering clinical electrode alert.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Signal Processing Architecture & Hardware Pinout Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Signal Processing Breakdown */}
        <Card className="border-navy-100 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Digital Signal Processing (DSP) Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-navy-600">
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">1. ADC Acquisition:</span> AD8232 instrumentation amplifier (gain ~1100, CMRR 80dB) sampled at 250 Hz via Arduino A0 (0–1023).
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">2. Baseline & Bandpass Filter:</span> Causal 0.5 Hz high-pass removes respiration baseline wander; 40 Hz low-pass suppresses electromyographic (EMG) muscle noise.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">3. 50/60 Hz Notch Filter:</span> Narrow second-order IIR notch filter eliminates electrical grid alternating current noise.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">4. Pan-Tompkins QRS Detection:</span> Dynamic slope integration isolates R-wave peaks and calculates instantaneous RR intervals.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">5. J-Point ST Measurement:</span> Compares PR isoelectric segment with J+60ms level. Sustained depression ≤ -1.0 mm triggers acute ischemic warning.
            </div>
          </CardContent>
        </Card>

        {/* Hardware Wiring Quick Reference */}
        <Card className="border-navy-100 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cardiac" />
              Arduino AD8232 Pin Connections & Placement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-navy-600">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-navy-100">
                <thead className="bg-navy-50 text-navy-800">
                  <tr>
                    <th className="p-1.5 border-b">AD8232 Pin</th>
                    <th className="p-1.5 border-b">Arduino Uno</th>
                    <th className="p-1.5 border-b">Function</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  <tr>
                    <td className="p-1.5 font-bold">3.3V</td>
                    <td className="p-1.5 text-cardiac font-semibold">3.3V</td>
                    <td className="p-1.5">Power Supply</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 font-bold">GND</td>
                    <td className="p-1.5 font-semibold">GND</td>
                    <td className="p-1.5">Ground Reference</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 font-bold">OUTPUT</td>
                    <td className="p-1.5 text-indigo-600 font-semibold">A0</td>
                    <td className="p-1.5">Analog ECG Waveform</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 font-bold">LO-</td>
                    <td className="p-1.5 text-emerald-600 font-semibold">Pin 11</td>
                    <td className="p-1.5">Leads-Off Detection (-)</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 font-bold">LO+</td>
                    <td className="p-1.5 text-emerald-600 font-semibold">Pin 10</td>
                    <td className="p-1.5">Leads-Off Detection (+)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-900">
              <span className="font-bold">Electrode Placement (Lead II Standard):</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li><strong className="text-red-700">RA (Red):</strong> Right Clavicle / Upper Chest</li>
                <li><strong className="text-yellow-700">LA (Yellow):</strong> Left Clavicle / Upper Chest</li>
                <li><strong className="text-emerald-700">RL (Green):</strong> Right Lower Abdomen (Ground)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
