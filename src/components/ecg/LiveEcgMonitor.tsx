"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { useHardwareSerial } from "@/lib/hardware/HardwareSerialContext";

export function LiveEcgMonitor() {
  const {
    isSerialSupported,
    isConnected,
    isBrave,
    portName,
    preset,
    setPreset,
    leadsOff,
    setLeadsOff,
    heartRate,
    stDeviationMm,
    isiScore,
    sqi,
    sampleRate,
    samplesReceived,
    processingStatus,
    rawLog,
    clearRawLog,
    adcMin,
    adcMax,
    leadsOffCount,
    connectSerial,
    disconnectSerial,
    drainSamples,
    soundEnabled,
    setSoundEnabled,
    playBeep,
    isIschemiaDemoActive,
    toggleIschemiaDemo,
  } = useHardwareSerial();

  // Local UI / Display Controls
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [gain, setGain] = useState<number>(1.0);
  const [sweepSpeed, setSweepSpeed] = useState<number>(1.0); // 1.0 = 25 mm/s
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [isInverted, setIsInverted] = useState<boolean>(false);

  // Canvas Oscilloscope references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sweepXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const baselineRef = useRef<number>(512);

  // Local buffer for synthetic simulation when hardware is not connected
  const synthBufferRef = useRef<number[]>([]);

  // Synthetic Waveform Generator (active when disconnected or non-arduino preset selected)
  useEffect(() => {
    if (isConnected && preset === "arduino") return;

    let t = 0;
    const interval = setInterval(() => {
      if (isFrozen) return;

      if (preset === "leads_off") {
        setLeadsOff(true);
        return;
      }
      setLeadsOff(false);

      // Period based on dynamic heart rate from context
      const period = 60 / Math.max(40, heartRate);
      const phase = (t % period) / period; // 0 to 1

      let val = 512;

      // P Wave
      if (phase >= 0.1 && phase <= 0.2) {
        val += 35 * Math.sin(((phase - 0.1) / 0.1) * Math.PI);
      }
      // Q Dip
      else if (phase >= 0.28 && phase <= 0.3) {
        val -= 45 * Math.sin(((phase - 0.28) / 0.02) * Math.PI);
      }
      // R Peak
      else if (phase > 0.3 && phase <= 0.34) {
        val += 340 * Math.sin(((phase - 0.3) / 0.04) * Math.PI);
        if (phase > 0.31 && phase < 0.33) {
          playBeep();
        }
      }
      // S Dip
      else if (phase > 0.34 && phase <= 0.38) {
        val -= 95 * Math.sin(((phase - 0.34) / 0.04) * Math.PI);
      }
      // ST Segment & T Wave
      else if (phase > 0.38 && phase <= 0.7) {
        val += stDeviationMm * 28.0;
        if (preset === "ischemic") {
          val -= 45 * Math.sin(((phase - 0.42) / 0.26) * Math.PI);
        } else {
          val += 65 * Math.sin(((phase - 0.42) / 0.26) * Math.PI);
        }
      }

      val += (Math.random() - 0.5) * 6;

      synthBufferRef.current.push(val);
      if (synthBufferRef.current.length > 500) {
        synthBufferRef.current.shift();
      }

      t += 0.005;
    }, 5);

    return () => clearInterval(interval);
  }, [isConnected, preset, isFrozen, heartRate, stDeviationMm, playBeep, setLeadsOff]);

  // Handle Connect Click
  const handleConnectClick = async () => {
    const success = await connectSerial();
    if (!success) {
      setShowTroubleshoot(true);
    } else {
      setShowTroubleshoot(false);
    }
  };

  // High-performance Medical Sweep Oscilloscope Canvas Rendering
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
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, width, height);

        // Standard 1 mm small squares
        ctx.strokeStyle = "rgba(239, 68, 68, 0.12)";
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

      // Determine samples to process this frame
      let samples: number[] = [];
      if (isConnected && preset === "arduino") {
        samples = drainSamples(14);
      } else {
        const count = Math.min(synthBufferRef.current.length, 12);
        samples = synthBufferRef.current.splice(0, count);
      }

      if (samples.length > 0 && !isFrozen) {
        for (let i = 0; i < samples.length; i++) {
          const rawAdc = samples[i];
          const currentX = sweepXRef.current;

          // Auto-baseline tracking for DC offset removal
          baselineRef.current = baselineRef.current * 0.998 + rawAdc * 0.002;
          const centered = rawAdc - baselineRef.current;
          const invertedMultiplier = isInverted ? -1 : 1;
          const scaled = (centered * (height / 280)) * gain * invertedMultiplier;
          // When Ischemia Demo or preset is active, visually displace waveform downwards to display ST depression
          const stOffset = (isIschemiaDemoActive || preset === "ischemic") ? (-1.60 * 18.0 * (height / 280) * gain) : 0;
          const currentY = Math.max(4, Math.min(height - 4, midY - scaled - stOffset));

          // Erase head (clears 24px ahead of sweep bar)
          const eraseWidth = 24;
          ctx.fillStyle = "#030712";
          ctx.fillRect(currentX, 0, eraseWidth, height);

          // Redraw grid lines in erased region
          ctx.strokeStyle = "rgba(239, 68, 68, 0.12)";
          ctx.beginPath();
          for (let y = 0; y < height; y += 8) {
            ctx.moveTo(currentX, y);
            ctx.lineTo(currentX + eraseWidth, y);
          }
          ctx.stroke();

          // Draw sweeping phosphor glow bar (Emergency red when ischemic)
          const isAlert = isIschemiaDemoActive || stDeviationMm <= -1.0 || preset === "ischemic";
          ctx.fillStyle = isAlert ? "rgba(239, 68, 68, 0.55)" : "rgba(74, 222, 128, 0.4)";
          ctx.fillRect(currentX + eraseWidth - 2, 0, 2, height);

          // Draw ECG Trace
          if (leadsOff) {
            ctx.strokeStyle = "#EF4444";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(currentX - 1, midY);
            ctx.lineTo(currentX + 1, midY);
            ctx.stroke();
          } else {
            ctx.strokeStyle = isAlert ? "#EF4444" : "#22C55E";
            ctx.shadowColor = isAlert ? "#EF4444" : "#4ADE80";
            ctx.shadowBlur = isAlert ? 8 : 6;
            ctx.lineWidth = 2.4;
            ctx.lineJoin = "round";

            ctx.beginPath();
            ctx.moveTo(currentX - 1, lastYRef.current || currentY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          lastYRef.current = currentY;
          sweepXRef.current += 1.4 * sweepSpeed;

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
  }, [
    isConnected,
    preset,
    isFrozen,
    gain,
    sweepSpeed,
    isInverted,
    leadsOff,
    stDeviationMm,
    isIschemiaDemoActive,
    drainSamples,
  ]);

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
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                isConnected
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-blue-100 text-blue-800 border-blue-200"
              )}
            >
              <Radio
                className={cn(
                  "w-3 h-3",
                  isConnected ? "text-emerald-600 animate-ping" : "text-blue-600"
                )}
              />
              {isConnected ? "HARDWARE STREAMING (ACTIVE)" : "SIMULATION PREVIEW"}
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
              className="border-red-200 text-red-600 hover:bg-red-50 font-semibold"
            >
              <WifiOff className="w-4 h-4 mr-1.5" />
              Disconnect ({portName})
            </Button>
          ) : (
            <Button
              onClick={handleConnectClick}
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

          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className={cn(
                "border-navy-200 text-navy-700 hover:bg-navy-50",
                showDebug && "border-emerald-400 text-emerald-700 bg-emerald-50"
              )}
              title="Show raw serial data stream for debugging"
            >
              <Terminal className="w-4 h-4 mr-1 text-emerald-600" />
              Raw Data
            </Button>
          )}

          {/* Live Ischemia Trigger for Judging Demo */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleIschemiaDemo}
            className={cn(
              "font-bold transition-all shadow-xs border",
              isIschemiaDemoActive
                ? "bg-red-600 text-white border-red-700 hover:bg-red-700 animate-pulse ring-2 ring-red-400"
                : "bg-amber-500/10 text-amber-700 border-amber-300 hover:bg-amber-500/20"
            )}
            title={
              isIschemiaDemoActive
                ? "Click to deactivate Ischemia Demo and return to normal"
                : "Click to simulate Acute Ischemia (ST depression -1.6mm, High ISI) for Judges"
            }
          >
            <AlertTriangle className={cn("w-4 h-4 mr-1.5", isIschemiaDemoActive ? "text-white" : "text-amber-600")} />
            {isIschemiaDemoActive ? "🚨 Ischemia Active (Reset)" : "⚡ Demo Ischemia to Judges"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFrozen(!isFrozen)}
            className="border-navy-200 text-navy-700"
          >
            {isFrozen ? (
              <Play className="w-4 h-4 mr-1 text-emerald-600" />
            ) : (
              <Pause className="w-4 h-4 mr-1 text-amber-600" />
            )}
            {isFrozen ? "Resume" : "Freeze"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-navy-200 text-navy-700"
            title={soundEnabled ? "Mute QRS Beep" : "Enable QRS Beep"}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <VolumeX className="w-4 h-4 text-navy-400" />
            )}
          </Button>
        </div>
      </div>

      {/* Emergency Ischemia Active Alert Banner (When Demo or Ischemic Preset Active) */}
      {isIschemiaDemoActive && (
        <div className="p-4 bg-red-600/15 border-2 border-red-500 rounded-xl flex items-center justify-between flex-wrap gap-4 animate-pulse text-red-950 shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
              🚨
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black tracking-wider uppercase text-red-700 bg-red-100 px-2.5 py-0.5 rounded border border-red-300">
                  Live Judge Demonstration Active
                </span>
                <span className="text-xs font-bold text-red-700">
                  Subendocardial ST Depression (-1.60 mm) &bull; Critical ISI ({isiScore}/100)
                </span>
              </div>
              <p className="text-xs text-red-800 mt-1 leading-relaxed">
                Acute myocardial ischemia protocol triggered on live Lead II waveform. Continuous chronotropic tachycardia ({heartRate} BPM) and J-point depression &le; -1.0 mm detected.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={toggleIschemiaDemo}
            className="bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 shadow-sm"
          >
            Reset to Baseline
          </Button>
        </div>
      )}

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
                  On Windows, only <strong>ONE app</strong> can open COM7 at a time. If the <strong>Serial Monitor</strong> or <strong>Serial Plotter</strong> is open in Arduino IDE, close that window now!
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
                  Unplug your Arduino USB cable from your laptop and plug it back in. Then click <strong>&quot;Connect Arduino USB&quot;</strong>, select <strong>Arduino Uno (COM7)</strong>, and click <strong>Connect</strong>.
                </p>
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-navy-100 flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <span className="text-navy-600">
                <strong>Local CLI Option:</strong> You can also run the Python bridge directly:
                <code className="ml-1 px-1.5 py-0.5 bg-navy-100 rounded text-navy-800 font-mono">
                  python scripts/arduino_ecg_bridge.py --port COM7
                </code>
              </span>
              <Button
                size="sm"
                onClick={handleConnectClick}
                className="bg-cardiac hover:bg-red-700 text-white font-semibold text-xs h-7 shadow-xs"
              >
                <Usb className="w-3.5 h-3.5 mr-1" />
                Retry Web Serial Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Serial Debug Panel */}
      {showDebug && isConnected && (
        <Card className="border-emerald-200 bg-gray-950 shadow-sm animate-in fade-in duration-200">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Live Serial Debug — Raw Arduino Output
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-400">
                ADC range:{" "}
                <span className="font-mono text-yellow-300">
                  {adcMin === 9999 ? "—" : adcMin} → {adcMax === 0 ? "—" : adcMax}
                </span>
              </span>
              <span className="text-gray-400">
                Leads-off:{" "}
                <span
                  className={cn(
                    "font-mono font-bold",
                    leadsOffCount > 0 ? "text-red-400" : "text-emerald-400"
                  )}
                >
                  {leadsOffCount}
                </span>
              </span>
              <span className="text-gray-400">
                Samples: <span className="font-mono text-cyan-300">{samplesReceived}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-2 text-[10px] text-gray-500 hover:text-white"
                onClick={clearRawLog}
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {rawLog.length > 0 && (
              <div
                className={cn(
                  "mb-2 px-3 py-2 rounded text-xs font-semibold",
                  leadsOffCount > samplesReceived * 0.8
                    ? "bg-red-950 border border-red-600 text-red-300"
                    : adcMax - adcMin < 5
                    ? "bg-yellow-950 border border-yellow-600 text-yellow-300"
                    : adcMax - adcMin < 30
                    ? "bg-amber-950 border border-amber-500 text-amber-300"
                    : "bg-emerald-950 border border-emerald-600 text-emerald-300"
                )}
              >
                {leadsOffCount > samplesReceived * 0.8
                  ? "⚠ Mostly '!' — Leads-Off! Check D10→LO+ and D11→LO- wires. Electrodes may not be on skin."
                  : adcMax - adcMin < 5
                  ? "⚠ Signal is FLAT (span < 5 counts). AD8232 OUTPUT pin may not be connected to A0."
                  : adcMax - adcMin < 30
                  ? "~ Weak signal (span < 30). Press electrode pads firmly onto skin. Lick fingertips for better contact."
                  : `✓ Good signal! Span = ${adcMax - adcMin} ADC counts. ECG hardware is working correctly.`}
              </div>
            )}
            {rawLog.length === 0 && (
              <div className="text-gray-500 text-xs italic px-1">
                Waiting for data... (If nothing appears after 3 seconds, Arduino may not be sending data)
              </div>
            )}
            <div className="font-mono text-xs text-emerald-300 h-32 overflow-y-auto space-y-0.5 scrollbar-thin">
              {rawLog.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-1 rounded text-[11px]",
                    entry.startsWith("!")
                      ? "text-red-400 bg-red-950/30"
                      : entry.startsWith("???")
                      ? "text-yellow-400 bg-yellow-950/30"
                      : "text-emerald-300"
                  )}
                >
                  {entry}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing status bar — shows live analysis pipeline status when hardware connected */}
      {isConnected && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-navy-950/80 rounded-lg border border-navy-800 text-[11px] text-emerald-400 font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="truncate">{processingStatus}</span>
        </div>
      )}

      {/* 4 Primary Telemetry Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Heart Rate */}
        <Card className={cn("border-navy-100 shadow-xs transition-colors", isIschemiaDemoActive && "border-red-300 bg-red-50/20")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-navy-600">Heart Rate</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <Heart
                className={cn(
                  "w-4 h-4 text-cardiac",
                  heartRate > 90 || isIschemiaDemoActive ? "animate-ping" : "animate-pulse"
                )}
                fill="currentColor"
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-navy-900 font-mono tracking-tight">{heartRate}</span>
              <span className="text-xs text-navy-400 font-medium">BPM</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              R-R Interval:{" "}
              <span className="font-semibold text-navy-700 font-mono">
                {Math.round(60000 / Math.max(1, heartRate))} ms
              </span>
            </p>
          </CardContent>
        </Card>

        {/* ST-Segment Deviation */}
        <Card className={cn("border-navy-100 shadow-xs transition-colors", (isIschemiaDemoActive || stDeviationMm <= -1.0) && "border-red-300 bg-red-50/30")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">ST Deviation</span>
              <Activity
                className={cn(
                  "w-4 h-4",
                  (isIschemiaDemoActive || stDeviationMm <= -1.0) ? "text-red-600 animate-pulse" : "text-emerald-500"
                )}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-3xl font-extrabold font-mono tracking-tight",
                  (isIschemiaDemoActive || stDeviationMm <= -1.0)
                    ? "text-red-600"
                    : stDeviationMm <= -0.5
                    ? "text-amber-500"
                    : "text-emerald-600"
                )}
              >
                {stDeviationMm >= 0
                  ? `+${stDeviationMm.toFixed(2)}`
                  : stDeviationMm.toFixed(2)}
              </span>
              <span className="text-xs text-navy-400 font-medium">mm (mV/10)</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              {(isIschemiaDemoActive || stDeviationMm <= -1.0) ? (
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
        <Card className={cn("border-navy-100 shadow-xs transition-colors", (isIschemiaDemoActive || isiScore >= 70) && "border-red-400 bg-red-50/40 ring-1 ring-red-400")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-navy-600">Ischemic Stress Index</span>
                <span className="relative flex h-2 w-2">
                  <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", (isiScore >= 70 || isIschemiaDemoActive) ? "bg-red-400" : "bg-emerald-400")}></span>
                  <span className={cn("relative inline-flex rounded-full h-2 w-2", (isiScore >= 70 || isIschemiaDemoActive) ? "bg-red-500" : "bg-emerald-500")}></span>
                </span>
              </div>
              <ShieldAlert
                className={cn(
                  "w-4 h-4",
                  (isIschemiaDemoActive || isiScore >= 70)
                    ? "text-red-600 animate-bounce"
                    : isiScore >= 40
                    ? "text-amber-500"
                    : "text-emerald-500"
                )}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-3xl font-extrabold font-mono tracking-tight",
                  (isIschemiaDemoActive || isiScore >= 70)
                    ? "text-red-600"
                    : isiScore >= 40
                    ? "text-amber-500"
                    : "text-emerald-600"
                )}
              >
                {isiScore}
              </span>
              <span className="text-xs text-navy-400 font-medium">/ 100</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border",
                (isIschemiaDemoActive || isiScore >= 70)
                  ? "bg-red-100 text-red-800 border-red-300"
                  : isiScore >= 40
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              )}>
                {(isIschemiaDemoActive || isiScore >= 70) ? "CRITICAL" : isiScore >= 40 ? "ELEVATED" : "NORMAL"}
              </span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              Dynamic Stress:{" "}
              <span
                className={cn(
                  "font-bold",
                  (isIschemiaDemoActive || isiScore >= 70)
                    ? "text-red-600"
                    : isiScore >= 40
                    ? "text-amber-600"
                    : "text-emerald-600"
                )}
              >
                {(isIschemiaDemoActive || isiScore >= 70) ? "Critical Ischemia" : isiScore >= 40 ? "Elevated Strain" : "Normal Sinus"}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Signal Quality & Hardware Stream */}
        <Card className="border-navy-100 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-navy-400 text-xs">
              <span className="font-semibold text-navy-600">Hardware Stream</span>
              <Radio
                className={cn(
                  "w-4 h-4",
                  isConnected ? "text-emerald-500 animate-pulse" : "text-navy-400"
                )}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-navy-900">{sampleRate}</span>
              <span className="text-xs text-navy-400 font-medium">Hz (9600 baud)</span>
            </div>
            <p className="text-[11px] text-navy-500 mt-1">
              Quality:{" "}
              <span className="font-semibold text-emerald-600">{sqi}% SQI</span>{" "}
              <span className="text-navy-400">({portName})</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leads-Off Visual Alarm */}
      {leadsOff && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-900">
                LEADS-OFF DETECTED &mdash; POOR ELECTRODE CONTACT
              </h4>
              <p className="text-xs text-red-700 mt-0.5">
                Pin 10 (LO+) or Pin 11 (LO-) triggered. Press electrode pads firmly onto your skin and check cable snaps.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded bg-red-600 text-white font-bold text-xs uppercase tracking-wider">
            Check Leads
          </span>
        </div>
      )}

      {/* Main Oscilloscope Sweep Canvas Container */}
      <Card className="border-navy-200 shadow-md bg-gray-950 overflow-hidden">
        <div className="px-4 py-3 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              LEAD II TELEMETRY
            </span>
            <span className="text-gray-400 hidden sm:inline">
              Calibration: 10 mm/mV &bull; 25 mm/s
            </span>
            <span className="text-gray-400 hidden md:inline">
              Bandpass: 0.5&ndash;40 Hz + 50Hz Notch
            </span>
          </div>

          {/* Quick Oscilloscope Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-800/80 p-0.5 rounded border border-gray-700">
              <span className="text-[10px] text-gray-400 px-1 font-semibold">Gain:</span>
              {[0.5, 1, 2].map((g) => (
                <button
                  key={g}
                  onClick={() => setGain(g)}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-bold rounded",
                    gain === g ? "bg-cardiac text-white" : "text-gray-300 hover:text-white"
                  )}
                >
                  {g}x
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsInverted(!isInverted)}
              className={cn(
                "h-6 px-2 text-[10px] text-gray-300 border border-gray-700 hover:bg-gray-800",
                isInverted && "bg-indigo-950 text-indigo-300 border-indigo-700"
              )}
            >
              <ArrowDownUp className="w-3 h-3 mr-1" />
              {isInverted ? "Inverted" : "Normal"}
            </Button>
          </div>
        </div>

        <div className="relative w-full aspect-[21/9] min-h-[320px] max-h-[500px] bg-black">
          <canvas
            ref={canvasRef}
            width={1200}
            height={480}
            className="w-full h-full block"
          />

          {/* Real-time Oscilloscope HUD Overlay */}
          <div className="absolute top-3 left-3 pointer-events-none bg-black/75 backdrop-blur-xs p-2.5 rounded-lg border border-gray-800 text-[11px] font-mono text-emerald-400 space-y-0.5">
            <div className="flex items-center gap-1.5 font-bold">
              <span className={cn("w-2 h-2 rounded-full", (isIschemiaDemoActive || stDeviationMm <= -1.0) ? "bg-red-500 animate-ping" : "bg-emerald-400 animate-pulse")} />
              <span>CH1: AD8232 (Lead II Telemetry)</span>
            </div>
            <div>
              ST-Level:{" "}
              <span
                className={cn(
                  "font-bold",
                  (isIschemiaDemoActive || stDeviationMm <= -1.0)
                    ? "text-red-400"
                    : stDeviationMm <= -0.5
                    ? "text-amber-400"
                    : "text-emerald-400"
                )}
              >
                {stDeviationMm >= 0
                  ? `+${stDeviationMm.toFixed(2)}`
                  : stDeviationMm.toFixed(2)}{" "}
                mm
              </span>
            </div>
            <div>R-R Mean: {Math.round(60000 / Math.max(1, heartRate))} ms &bull; HR: {heartRate} BPM</div>
            <div>ISI Stress: <span className={cn("font-bold", (isIschemiaDemoActive || isiScore >= 70) ? "text-red-400" : "text-emerald-400")}>{isiScore}/100</span></div>
            <div>Status: <span className={cn("font-bold", isIschemiaDemoActive ? "text-red-400" : "text-emerald-400")}>{isIschemiaDemoActive ? "🚨 JUDGE DEMO: ISCHEMIA" : isConnected ? "Physical Arduino Serial" : "Preset Mode"}</span></div>
          </div>
        </div>
      </Card>

      {/* Preset Challenges (for Demonstration & Clinical Comparison) */}
      <Card className="border-navy-100 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-navy-900 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cardiac" />
              Clinical Presets &amp; Simulation Modes
            </span>
            <span className="text-xs font-normal text-navy-400">
              Interactive testing without hardware
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => setPreset("normal")}
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
              <p className="text-[11px] text-navy-500 mt-1">
                Healthy sinus rhythm, normal isoelectric ST (+0.05 mm), low ISI.
              </p>
            </button>

            <button
              onClick={() => setPreset("ischemic")}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "ischemic"
                  ? "border-red-500 bg-red-50/50 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                Acute Ischemia
              </div>
              <p className="text-[11px] text-navy-500 mt-1">
                Subendocardial ST depression (-1.6 mm), T-wave flattening, high ISI (78).
              </p>
            </button>

            <button
              onClick={() => setPreset("tachycardia")}
              className={cn(
                "p-3 rounded-xl border text-left transition-all",
                preset === "tachycardia"
                  ? "border-amber-500 bg-amber-50/50 shadow-xs"
                  : "border-navy-100 hover:border-navy-200"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <Heart className="w-3.5 h-3.5 text-amber-600" />
                Exertional Strain
              </div>
              <p className="text-[11px] text-navy-500 mt-1">
                HR 114 bpm, mild ST sagging (-0.6 mm), ISI 54 (Elevated).
              </p>
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
              <p className="text-[11px] text-navy-500 mt-1">
                Simulates Pin 10/11 high (&apos;!&apos;), triggering clinical electrode alert.
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Signal Processing Architecture & Hardware Pinout Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="border-navy-100 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Digital Signal Processing (DSP) Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-navy-600">
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">1. ADC Acquisition:</span> AD8232 instrumentation amplifier (gain ~1100, CMRR 80dB) sampled at ~200&ndash;250 Hz via Arduino A0.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">2. Adaptive Auto-Centering:</span> Dynamic exponential baseline eliminates DC offsets (160&ndash;280 counts) and centers signal on oscilloscope.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">3. Instant Beat-by-Beat QRS:</span> Real-time R-peak detector measures exact R-R intervals and updates dynamic heart rate on every beat.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">4. J-Point ST Measurement:</span> Compares PR baseline with J+60ms level. Sustained depression &le; -1.0 mm triggers acute ischemic warning.
            </div>
            <div className="p-2.5 rounded-lg bg-navy-50/80 border border-navy-100">
              <span className="font-bold text-navy-900">5. Continuous Navigation:</span> Global persistent hardware provider ensures Arduino remains connected while browsing Overview or other pages.
            </div>
          </CardContent>
        </Card>

        <Card className="border-navy-100 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cardiac" />
              Arduino AD8232 Pin Connections &amp; Placement
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
                <li>
                  <strong className="text-red-700">RA (Red):</strong> Right Clavicle / Upper Chest
                </li>
                <li>
                  <strong className="text-yellow-700">LA (Yellow):</strong> Left Clavicle / Upper Chest
                </li>
                <li>
                  <strong className="text-emerald-700">RL (Green):</strong> Right Lower Abdomen (Ground)
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
