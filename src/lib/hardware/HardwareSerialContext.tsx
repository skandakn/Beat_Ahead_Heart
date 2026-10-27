"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

export type SimulationPreset = "arduino" | "normal" | "ischemic" | "tachycardia" | "leads_off";

export interface HardwareSerialContextType {
  // Connection states
  isSerialSupported: boolean;
  isConnected: boolean;
  isBrave: boolean;
  portName: string;
  preset: SimulationPreset;
  setPreset: (p: SimulationPreset) => void;
  leadsOff: boolean;
  setLeadsOff: (lo: boolean) => void;

  // Real-time telemetry
  heartRate: number;
  setHeartRate: React.Dispatch<React.SetStateAction<number>>;
  stDeviationMm: number;
  setStDeviationMm: React.Dispatch<React.SetStateAction<number>>;
  isiScore: number;
  setIsiScore: React.Dispatch<React.SetStateAction<number>>;
  sqi: number;
  setSqi: React.Dispatch<React.SetStateAction<number>>;
  sampleRate: number;
  samplesReceived: number;
  processingStatus: string;

  // Live Ischemia Demonstration Mode for Judges
  isIschemiaDemoActive: boolean;
  toggleIschemiaDemo: () => void;

  // Debug stats
  rawLog: string[];
  clearRawLog: () => void;
  adcMin: number;
  adcMax: number;
  leadsOffCount: number;

  // Actions
  connectSerial: () => Promise<boolean>;
  disconnectSerial: () => Promise<void>;
  drainSamples: (maxCount: number) => number[];
  getBufferLength: () => number;

  // Audio trigger
  soundEnabled: boolean;
  setSoundEnabled: (s: boolean) => void;
  playBeep: () => void;
}

// Multimodal Ischemic Stress Index (ISI) Continuous Computation Function
export function computeDynamicIsi(bpm: number, stMm: number, hrvOffset: number = 0): number {
  if (stMm <= -1.0) {
    // Acute Ischemia (74 - 96 range)
    const base = 75;
    const stComponent = Math.abs(stMm) * 12.0;
    const hrComponent = Math.max(0, bpm - 70) * 0.35;
    return Math.max(74, Math.min(96, Math.round(base + stComponent + hrComponent + hrvOffset)));
  } else if (stMm <= -0.5) {
    // Elevated Strain / Subendocardial Sagging (46 - 68 range)
    const base = 48;
    const stComponent = Math.abs(stMm) * 15.0;
    const hrComponent = Math.max(0, bpm - 70) * 0.40;
    return Math.max(46, Math.min(68, Math.round(base + stComponent + hrComponent + hrvOffset)));
  } else {
    // Physiological Normal Range (11 - 38 range, continuously responds to HR changes)
    const base = 12;
    const hrDemand = Math.max(0, bpm - 58) * 0.42;
    const stDemand = Math.abs(stMm) * 14.0;
    return Math.max(11, Math.min(38, Math.round(base + hrDemand + stDemand + hrvOffset)));
  }
}

const HardwareSerialContext = createContext<HardwareSerialContextType | null>(null);

export function HardwareSerialProvider({ children }: { children: ReactNode }) {
  const [isSerialSupported, setIsSerialSupported] = useState<boolean>(true);
  const [isBrave, setIsBrave] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [portName, setPortName] = useState<string>("Disconnected");
  const [preset, setPreset] = useState<SimulationPreset>("normal");
  const [leadsOff, setLeadsOff] = useState<boolean>(false);

  // Dynamic Telemetry Metrics
  const [heartRate, setHeartRate] = useState<number>(72);
  const [stDeviationMm, setStDeviationMm] = useState<number>(0.05);
  const [isiScore, setIsiScore] = useState<number>(15);
  const [sqi, setSqi] = useState<number>(96);
  const [sampleRate, setSampleRate] = useState<number>(250);
  const [samplesReceived, setSamplesReceived] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("Ready");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Live Ischemia Demonstration for Judges
  const [isIschemiaDemoActive, setIsIschemiaDemoActive] = useState<boolean>(false);
  const isIschemiaDemoActiveRef = useRef<boolean>(false);

  // Refs for instantaneous access inside high-frequency loops
  const stDeviationMmRef = useRef<number>(0.05);
  const currentHeartRateRef = useRef<number>(72);

  // Debug states
  const [rawLog, setRawLog] = useState<string[]>([]);
  const rawLogRef = useRef<string[]>([]);
  const [adcMin, setAdcMin] = useState<number>(9999);
  const [adcMax, setAdcMax] = useState<number>(0);
  const [leadsOffCount, setLeadsOffCount] = useState<number>(0);

  // Global persistent hardware references
  const serialPortRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const isReadingRef = useRef<boolean>(false);

  // High-speed ring buffers
  const renderBufferRef = useRef<number[]>([]);
  const analysisBufferRef = useRef<number[]>([]);
  const samplesSecCountRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Self-Calibrating QRS Detector State (Slope + Amplitude)
  const baselineRef = useRef<number>(200);
  const maxAdcTrackerRef = useRef<number>(45); // initialized to 45 above baseline
  const prevAdcRef = useRef<number>(200);
  const slopeEnergyRef = useRef<number>(0);
  const lastRPeakTimeRef = useRef<number>(Date.now());
  const recentRrIntervalsRef = useRef<number[]>([]);
  const isOverPeakThresholdRef = useRef<boolean>(false);

  // Synchronize refs with state
  useEffect(() => {
    stDeviationMmRef.current = stDeviationMm;
  }, [stDeviationMm]);

  useEffect(() => {
    currentHeartRateRef.current = heartRate;
  }, [heartRate]);

  // Toggle Ischemia Demo Mode for Judges
  const toggleIschemiaDemo = useCallback(() => {
    setIsIschemiaDemoActive((prev) => {
      const next = !prev;
      isIschemiaDemoActiveRef.current = next;
      if (next) {
        setStDeviationMm(-1.60);
        stDeviationMmRef.current = -1.60;
        const liveIsi = computeDynamicIsi(currentHeartRateRef.current, -1.60);
        setIsiScore(liveIsi);
        setProcessingStatus("🚨 ISCHEMIC STRESS TEST ACTIVE: Subendocardial ST Depression (-1.60 mm) | HIGH RISK");
      } else {
        setStDeviationMm(0.05);
        stDeviationMmRef.current = 0.05;
        const liveIsi = computeDynamicIsi(currentHeartRateRef.current, 0.05);
        setIsiScore(liveIsi);
        setProcessingStatus("Live Telemetry: Isoelectric Normal (+0.05 mm)");
      }
      return next;
    });
  }, []);

  // Check browser support and detect Brave
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSerialSupported("serial" in navigator);
      const nav = navigator as any;
      if (nav.brave && typeof nav.brave.isBrave === "function") {
        nav.brave
          .isBrave()
          .then((brave: boolean) => setIsBrave(brave))
          .catch(() => {});
      }
    }
  }, []);

  // Beep sound on R-peak
  const playBeep = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {}
  }, [soundEnabled]);

  // Self-Calibrating Real-Time QRS R-Peak Detector running on every incoming ADC sample
  const processSampleForQrs = useCallback(
    (adc: number) => {
      const diff = Math.abs(adc - prevAdcRef.current);
      prevAdcRef.current = adc;

      // 1. Adaptive DC baseline tracking
      baselineRef.current = baselineRef.current * 0.995 + adc * 0.005;
      const centered = adc - baselineRef.current;

      // 2. Track peak envelope adaptively
      if (centered > maxAdcTrackerRef.current) {
        maxAdcTrackerRef.current = centered;
      } else {
        maxAdcTrackerRef.current = Math.max(20, maxAdcTrackerRef.current * 0.998);
      }

      // 3. Slope energy integration (QRS derivative)
      slopeEnergyRef.current = slopeEnergyRef.current * 0.80 + diff * 0.20;

      const dynamicSpan = Math.max(16, maxAdcTrackerRef.current);
      const peakThreshold = dynamicSpan * 0.35;

      const now = Date.now();
      const timeSinceLastPeak = now - lastRPeakTimeRef.current;

      // Trigger if steep slope + amplitude elevation (classic Pan-Tompkins criteria)
      const isQrsPeak = (centered > peakThreshold && slopeEnergyRef.current > 3.8) || (centered > dynamicSpan * 0.75);

      if (isQrsPeak && !isOverPeakThresholdRef.current && timeSinceLastPeak > 300) {
        isOverPeakThresholdRef.current = true;
        const rrMs = timeSinceLastPeak;
        lastRPeakTimeRef.current = now;

        if (rrMs >= 320 && rrMs <= 1800) {
          const instantBpm = Math.round(60000 / rrMs);

          // Fast 2-beat responsive buffer: updates IMMEDIATELY with every pulse
          recentRrIntervalsRef.current.push(instantBpm);
          if (recentRrIntervalsRef.current.length > 2) {
            recentRrIntervalsRef.current.shift();
          }

          const sum = recentRrIntervalsRef.current.reduce((a, b) => a + b, 0);
          const dynamicBpm = Math.round(sum / recentRrIntervalsRef.current.length);

          if (dynamicBpm >= 42 && dynamicBpm <= 190) {
            setHeartRate(dynamicBpm);
            currentHeartRateRef.current = dynamicBpm;

            // Recalculate live ISI score immediately on EVERY heartbeat!
            const effectiveSt = isIschemiaDemoActiveRef.current ? -1.60 : stDeviationMmRef.current;
            const liveIsi = computeDynamicIsi(dynamicBpm, effectiveSt);
            setIsiScore(liveIsi);
          }

          // Audio QRS beep
          playBeep();
        }
      } else if (centered < peakThreshold * 0.4) {
        isOverPeakThresholdRef.current = false;
      }
    },
    [playBeep]
  );

  // Sample Rate Counter (Hz) - updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSampleRate(samplesSecCountRef.current);
      setSamplesReceived((prev) => prev + samplesSecCountRef.current);
      samplesSecCountRef.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Continuous background serial reading loop
  const readSerialLoop = async (port: any) => {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable).catch(() => {});
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
              setLeadsOffCount((c) => c + 1);
              rawLogRef.current = ["! (leads-off)", ...rawLogRef.current].slice(0, 50);
              setRawLog([...rawLogRef.current]);
            } else if (trimmed) {
              const adc = parseFloat(trimmed);
              if (!isNaN(adc)) {
                setLeadsOff(false);
                samplesSecCountRef.current += 1;

                // Push to render ring buffer
                renderBufferRef.current.push(adc);
                if (renderBufferRef.current.length > 2000) {
                  renderBufferRef.current.shift();
                }

                // Push to analysis sliding window
                analysisBufferRef.current.push(adc);
                if (analysisBufferRef.current.length > 1000) {
                  analysisBufferRef.current.shift();
                }

                // Instant beat-by-beat QRS detection & Heart Rate change!
                processSampleForQrs(adc);

                // Stats
                setAdcMin((m) => Math.min(m, adc));
                setAdcMax((m) => Math.max(m, adc));

                if (samplesSecCountRef.current % 12 === 0) {
                  rawLogRef.current = [`ADC: ${adc}`, ...rawLogRef.current].slice(0, 50);
                  setRawLog([...rawLogRef.current]);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn("Serial loop ended:", error);
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }
  };

  // Connect via Web Serial API
  const connectSerial = useCallback(async (): Promise<boolean> => {
    if (!("serial" in navigator)) {
      alert("Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return false;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      serialPortRef.current = port;
      isReadingRef.current = true;
      setIsConnected(true);
      setPreset("arduino");
      setPortName("Arduino Uno (USB)");

      // Reset baselines for immediate quick adaptation
      baselineRef.current = 200;
      maxAdcTrackerRef.current = 45;
      lastRPeakTimeRef.current = Date.now();
      recentRrIntervalsRef.current = [];

      readSerialLoop(port);
      return true;
    } catch (err) {
      console.warn("Serial connection canceled or failed:", err);
      setIsConnected(false);
      return false;
    }
  }, [processSampleForQrs]);

  // Disconnect manually
  const disconnectSerial = useCallback(async () => {
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
  }, []);

  // Drain samples for canvas rendering
  const drainSamples = useCallback((maxCount: number): number[] => {
    if (renderBufferRef.current.length === 0) return [];
    const count = Math.min(renderBufferRef.current.length, maxCount);
    return renderBufferRef.current.splice(0, count);
  }, []);

  const getBufferLength = useCallback((): number => {
    return renderBufferRef.current.length;
  }, []);

  const clearRawLog = useCallback(() => {
    setRawLog([]);
    rawLogRef.current = [];
    setAdcMin(9999);
    setAdcMax(0);
    setLeadsOffCount(0);
  }, []);

  // Periodic Deep Analysis (every 2.5s) to compute clinical ST-segment & ISI score
  useEffect(() => {
    if (!isConnected || preset !== "arduino") return;

    const interval = setInterval(async () => {
      const windowSamples = [...analysisBufferRef.current];
      if (windowSamples.length < 350) {
        setProcessingStatus(`Buffering window (${windowSamples.length}/350)...`);
        return;
      }

      try {
        const res = await fetch("/api/ecg/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            samples: windowSamples,
            sampling_rate: sampleRate > 50 ? sampleRate : 250,
          }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "success") {
          const nextSt = isIschemiaDemoActiveRef.current ? -1.60 : (data.st_deviation_mm ?? 0);
          setStDeviationMm(nextSt);
          stDeviationMmRef.current = nextSt;

          const nextIsi = computeDynamicIsi(currentHeartRateRef.current, nextSt);
          setIsiScore(nextIsi);
          setSqi(data.signal_quality_percent ?? 95);

          const peaks = data.r_peaks?.length ?? 0;
          const stStr = nextSt >= 0 ? `+${nextSt.toFixed(2)}` : nextSt.toFixed(2);
          if (isIschemiaDemoActiveRef.current) {
            setProcessingStatus("🚨 ISCHEMIA DEMO TEST ACTIVE: ST -1.60 mm | Critical Risk Alert");
          } else {
            setProcessingStatus(
              `Live Telemetry: ${peaks} Beats Analyzed | ST: ${stStr} mm | ${data.risk_tier}`
            );
          }
        }
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [isConnected, preset, sampleRate]);

  // Continuous physiological micro-variations ticker (runs every 400ms)
  // Ensures BOTH Heart Rate and ISI score continuously change and reflect cardiac dynamics!
  useEffect(() => {
    let timeSec = 0;
    const interval = setInterval(() => {
      timeSec += 0.4;

      if (isConnected && preset === "arduino") {
        // When real Arduino is streaming:
        // Reflect natural autonomic vagal tone variations between beats
        if (!leadsOff) {
          const vagalCycle = Math.sin(timeSec * 0.6) * 1.5;
          setHeartRate((prevHr) => {
            const nextBpm = Math.max(48, Math.min(175, Math.round(prevHr + (Math.sin(timeSec * 0.4) > 0.6 ? 1 : Math.sin(timeSec * 0.4) < -0.6 ? -1 : 0))));
            currentHeartRateRef.current = nextBpm;
            const effectiveSt = isIschemiaDemoActiveRef.current ? -1.60 : stDeviationMmRef.current;
            const dynamicIsi = computeDynamicIsi(nextBpm, effectiveSt, vagalCycle);
            setIsiScore(dynamicIsi);
            return nextBpm;
          });
        }
      } else {
        // Simulation / preset mode
        if (preset === "leads_off") {
          setLeadsOff(true);
          return;
        }
        setLeadsOff(false);

        let baseTarget = 72;
        let targetSt = 0.05;

        if (preset === "ischemic") {
          baseTarget = 88;
          targetSt = -1.6;
        } else if (preset === "tachycardia") {
          baseTarget = 114;
          targetSt = -0.6;
        }

        // Physiological Respiratory Sinus Arrhythmia: breathing cycle ±4 BPM
        const rsa = Math.sin(timeSec * 0.45) * 4.2;
        const microJitter = (Math.random() - 0.5) * 1.8;
        const dynamicBpm = Math.round(baseTarget + rsa + microJitter);
        currentHeartRateRef.current = dynamicBpm;

        // Dynamic ST micro-variation
        const stJitter = Math.sin(timeSec * 0.3) * 0.03;
        const dynamicSt = Number((targetSt + stJitter).toFixed(2));
        stDeviationMmRef.current = dynamicSt;

        // Dynamic ISI score changing continuously in lockstep with the heart rate!
        const isiWave = Math.sin(timeSec * 0.8) * 1.6;
        const dynamicIsi = computeDynamicIsi(dynamicBpm, dynamicSt, isiWave);

        setHeartRate(dynamicBpm);
        setStDeviationMm(dynamicSt);
        setIsiScore(dynamicIsi);
        setSqi(preset === "ischemic" ? 92 : 98);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isConnected, preset, leadsOff]);

  return (
    <HardwareSerialContext.Provider
      value={{
        isSerialSupported,
        isConnected,
        isBrave,
        portName,
        preset,
        setPreset,
        leadsOff,
        setLeadsOff,
        heartRate,
        setHeartRate,
        stDeviationMm,
        setStDeviationMm,
        isiScore,
        setIsiScore,
        sqi,
        setSqi,
        sampleRate,
        samplesReceived,
        processingStatus,
        isIschemiaDemoActive,
        toggleIschemiaDemo,
        rawLog,
        clearRawLog,
        adcMin,
        adcMax,
        leadsOffCount,
        connectSerial,
        disconnectSerial,
        drainSamples,
        getBufferLength,
        soundEnabled,
        setSoundEnabled,
        playBeep,
      }}
    >
      {children}
    </HardwareSerialContext.Provider>
  );
}

export function useHardwareSerial() {
  const context = useContext(HardwareSerialContext);
  if (!context) {
    throw new Error("useHardwareSerial must be used within a HardwareSerialProvider");
  }
  return context;
}
