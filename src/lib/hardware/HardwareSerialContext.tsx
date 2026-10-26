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
  const [stDeviationMm, setStDeviationMm] = useState<number>(0.0);
  const [isiScore, setIsiScore] = useState<number>(14);
  const [sqi, setSqi] = useState<number>(96);
  const [sampleRate, setSampleRate] = useState<number>(250);
  const [samplesReceived, setSamplesReceived] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("Ready");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

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

  // Fast R-Peak & Dynamic Heart Rate Detection State
  const baselineRef = useRef<number>(512);
  const maxAdcTrackerRef = useRef<number>(600);
  const lastRPeakTimeRef = useRef<number>(Date.now());
  const recentRrIntervalsRef = useRef<number[]>([]);
  const isOverPeakThresholdRef = useRef<boolean>(false);

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

  // Real-time QRS R-Peak detector running directly on every incoming ADC sample
  const processSampleForQrs = useCallback(
    (adc: number) => {
      // 1. Slow exponential moving average for baseline tracking
      baselineRef.current = baselineRef.current * 0.997 + adc * 0.003;
      const centered = adc - baselineRef.current;

      // 2. Track dynamic peak envelope
      if (adc > maxAdcTrackerRef.current) {
        maxAdcTrackerRef.current = adc;
      } else {
        // slow decay
        maxAdcTrackerRef.current = maxAdcTrackerRef.current * 0.999 + baselineRef.current * 0.001;
      }

      // 3. Peak detection threshold (~40% of dynamic amplitude above baseline, minimum 25 counts)
      const dynamicSpan = Math.max(25, maxAdcTrackerRef.current - baselineRef.current);
      const peakThreshold = dynamicSpan * 0.42;

      const now = Date.now();
      const timeSinceLastPeak = now - lastRPeakTimeRef.current;

      // If signal crosses above peak threshold
      if (centered > peakThreshold && !isOverPeakThresholdRef.current && timeSinceLastPeak > 320) {
        isOverPeakThresholdRef.current = true;
        const rrMs = timeSinceLastPeak;
        lastRPeakTimeRef.current = now;

        if (rrMs >= 350 && rrMs <= 1800) {
          // Instantaneous BPM for this beat
          const instantBpm = Math.round(60000 / rrMs);

          // Add to rolling 4-beat buffer for physiological smoothing
          recentRrIntervalsRef.current.push(instantBpm);
          if (recentRrIntervalsRef.current.length > 5) {
            recentRrIntervalsRef.current.shift();
          }

          // Compute moving average of recent beats
          const sum = recentRrIntervalsRef.current.reduce((a, b) => a + b, 0);
          const smoothedBpm = Math.round(sum / recentRrIntervalsRef.current.length);

          if (smoothedBpm >= 40 && smoothedBpm <= 190) {
            setHeartRate(smoothedBpm);
          }

          // Trigger audio beep if enabled
          playBeep();
        }
      } else if (centered < peakThreshold * 0.5) {
        // Arm the detector for the next beat
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

                // Push to render ring buffer (capped at 2000 to prevent memory blowup)
                renderBufferRef.current.push(adc);
                if (renderBufferRef.current.length > 2000) {
                  renderBufferRef.current.shift();
                }

                // Push to analysis sliding window (1000 samples @ ~250 Hz = 4s)
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

      // Reset baselines for clean auto-centering
      baselineRef.current = 512;
      maxAdcTrackerRef.current = 600;
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
      if (windowSamples.length < 400) {
        setProcessingStatus(`Buffering window (${windowSamples.length}/400)...`);
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
          setStDeviationMm(data.st_deviation_mm ?? 0);
          setIsiScore(data.isi_score ?? 14);
          setSqi(data.signal_quality_percent ?? 95);

          const peaks = data.r_peaks?.length ?? 0;
          const stMm = (data.st_deviation_mm ?? 0).toFixed(2);
          setProcessingStatus(
            `Live Telemetry: ${peaks} Beats Analyzed | ST: ${stMm >= "0" ? "+" : ""}${stMm} mm | ${data.risk_tier}`
          );
        }
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [isConnected, preset, sampleRate]);

  // Synthetic Heart Rate Variability Generator (when Arduino is NOT connected)
  // Ensures HR naturally fluctuates with Respiratory Sinus Arrhythmia instead of being static
  useEffect(() => {
    if (isConnected && preset === "arduino") return;

    let timeSec = 0;
    const interval = setInterval(() => {
      timeSec += 0.5;

      let baseTarget = 72;
      let targetSt = 0.05;
      let targetIsi = 14;

      if (preset === "ischemic") {
        baseTarget = 88;
        targetSt = -1.6;
        targetIsi = 78;
      } else if (preset === "tachycardia") {
        baseTarget = 114;
        targetSt = -0.6;
        targetIsi = 54;
      } else if (preset === "leads_off") {
        setLeadsOff(true);
        return;
      }

      setLeadsOff(false);

      // Physiological Respiratory Sinus Arrhythmia: ±3 to ±5 BPM breathing wave
      const rsa = Math.sin(timeSec * 0.4) * 3.8;
      const microJitter = (Math.random() - 0.5) * 1.8;
      const dynamicBpm = Math.round(baseTarget + rsa + microJitter);

      setHeartRate(dynamicBpm);
      setStDeviationMm(targetSt);
      setIsiScore(targetIsi);
      setSqi(preset === "ischemic" ? 92 : 98);
    }, 500);

    return () => clearInterval(interval);
  }, [isConnected, preset]);

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
