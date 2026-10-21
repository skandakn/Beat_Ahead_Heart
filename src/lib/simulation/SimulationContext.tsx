"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DemoScenario,
  FeatureSet,
  ISIScore,
  PersonalBaseline,
  PhysiologicalSample,
  SimulationSettings,
  SimulationState,
  SystemStatus,
  TimelineEvent,
} from "@/lib/isi/types";
import { DEFAULT_BASELINE, deriveBaselineFromHealthRecord } from "@/lib/isi/baseline";
import { extractFeatures } from "@/lib/isi/features";
import { calculateISI } from "@/lib/isi/scoring";
import {
  extractMatrixAFeatures,
  type MatrixAFeatureVector,
} from "@/lib/isi/matrix_a";
import {
  generateHistoricalData,
  generateSample,
  generateTimeline,
  resetSimulation,
} from "@/lib/isi/simulation";
import type { PatientRecord } from "@/lib/patient-record";
import { useBeatAheadAuth } from "@/lib/auth/ClerkAuthWrapper";

interface SimulationData {
  samples: PhysiologicalSample[];
  history: ISIScore[];
  currentSample: PhysiologicalSample;
  currentScore: ISIScore;
  features: FeatureSet;
  matrixAFeatures: MatrixAFeatureVector;
  timeline: TimelineEvent[];
}

function buildSimulationData(
  newScenario: DemoScenario,
  initialModelProb?: number | null,
  activeBaseline: PersonalBaseline = DEFAULT_BASELINE
): SimulationData {
  resetSimulation();
  const { samples: historicalSamples } = generateHistoricalData(newScenario, 60, activeBaseline);
  const historicalScores: ISIScore[] = [];

  historicalSamples.forEach((sample, i) => {
    const prev = i > 0 ? historicalSamples[i - 1] : null;
    const feat = extractFeatures(sample, prev, newScenario, activeBaseline);
    const score = calculateISI({
      features: feat,
      baseline: activeBaseline,
      historicalScores: historicalScores.map((s) => s.score),
      scenario: newScenario,
      signalQuality: sample.signalQuality.overall,
      timestamp: sample.timestamp,
      rawSample: {
        heartRate: sample.heartRate,
        hrv: sample.hrv,
        spo2: sample.spo2,
        ppg: sample.ppg,
        ecg: sample.ecg,
        imu: sample.imu,
      },
      modelProbability: (i === historicalSamples.length - 1 && initialModelProb !== undefined && initialModelProb !== null)
        ? initialModelProb
        : undefined,
    });
    historicalScores.push(score);
  });

  const lastSample = historicalSamples[historicalSamples.length - 1];
  const lastScore = historicalScores[historicalScores.length - 1];
  const lastFeatures = extractFeatures(
    lastSample,
    historicalSamples[historicalSamples.length - 2] ?? null,
    newScenario,
    activeBaseline
  );
  const lastMatrixA = extractMatrixAFeatures(
    lastSample,
    historicalSamples[historicalSamples.length - 2] ?? null,
    newScenario,
    historicalSamples.length
  );

  return {
    samples: historicalSamples,
    history: historicalScores,
    currentSample: lastSample,
    currentScore: lastScore,
    features: lastFeatures,
    matrixAFeatures: lastMatrixA,
    timeline: generateTimeline(newScenario),
  };
}

function loadSettings(): SimulationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem("beatahead-settings");
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    /* ignore invalid stored settings */
  }
  return DEFAULT_SETTINGS;
}

interface SimulationContextValue extends SimulationState {
  scenario: DemoScenario;
  setScenario: (scenario: DemoScenario) => void;
  startMonitoring: () => void;
  pauseMonitoring: () => void;
  resetMonitoring: () => void;
  systemStatus: SystemStatus;
  settings: SimulationSettings;
  updateSettings: (settings: Partial<SimulationSettings>) => void;
  showToast: (message: string) => void;
  toastMessage: string | null;
  matrixAFeatures: MatrixAFeatureVector | null;
  modelProbability: number | null;
  modelAlert: boolean;
  modelThreshold: number;
  mlServiceStatus: "healthy" | "unavailable" | "evaluating";
  lastEvaluatedAt: string | null;
  evaluateModel: () => Promise<void>;
  /** Re-fetches the health record and updates the ISI baseline. */
  refreshBaseline: () => Promise<void>;
  /** Re-fetches the latest persisted ISI score from the shared backend across devices. */
  refreshISIData: () => Promise<void>;
  /** The last fetched PatientRecord (null if not yet loaded). */
  healthRecord: PatientRecord | null;
}

const DEFAULT_SETTINGS: SimulationSettings = {
  updateIntervalMs: 1000,
  autoStartMonitoring: false,
  showRangeLabels: true,
};

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const { userId, user } = useBeatAheadAuth();
  const effectiveUserId = userId || user?.id || "demo-user-1";

  const [scenario, setScenarioState] = useState<DemoScenario>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beatahead-scenario");
      if (
        saved &&
        [
          "normal",
          "stress_event",
          "recovering",
          "persistent_rising",
          "motion_artifact",
          "elevated_risk",
          "severe_risk",
        ].includes(saved)
      ) {
        return saved as DemoScenario;
      }
    }
    return "normal";
  });
  const [isRunning, setIsRunning] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData>(() => {
    let initialScenario: DemoScenario = "normal";
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beatahead-scenario");
      if (
        saved &&
        [
          "normal",
          "stress_event",
          "recovering",
          "persistent_rising",
          "motion_artifact",
          "elevated_risk",
          "severe_risk",
        ].includes(saved)
      ) {
        initialScenario = saved as DemoScenario;
      }
    }
    return buildSimulationData(initialScenario, null, DEFAULT_BASELINE);
  });

  // ── Health-record-derived baseline ─────────────────────────────────────
  const [baseline, setBaseline] = useState<PersonalBaseline>(DEFAULT_BASELINE);
  const [healthRecord, setHealthRecord] = useState<PatientRecord | null>(null);

  const persistISIData = useCallback(
    async (
      targetUserId: string,
      score: ISIScore,
      hist: ISIScore[],
      curSample: PhysiologicalSample,
      allSamples: PhysiologicalSample[],
      activeBase: PersonalBaseline,
      activeScen: DemoScenario
    ) => {
      try {
        await fetch("/api/isi/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: targetUserId,
            currentScore: score,
            history: hist.slice(-60),
            currentSample: curSample,
            samples: allSamples.slice(-60),
            baseline: activeBase,
            scenario: activeScen,
          }),
        });
      } catch (err) {
        console.warn("[SimulationContext] Failed to persist ISI score:", err);
      }
    },
    []
  );

  const fetchPersistedISIData = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/isi/score?userId=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as {
            success?: boolean;
            record?: {
              currentScore: ISIScore;
              history?: ISIScore[];
              currentSample?: PhysiologicalSample;
              samples?: PhysiologicalSample[];
              baseline?: PersonalBaseline;
              scenario?: DemoScenario;
            };
          };

          if (json.success && json.record && json.record.currentScore) {
            const rec = json.record;
            const loadedBaseline = rec.baseline ?? DEFAULT_BASELINE;
            const loadedScenario = rec.scenario ?? "normal";
            const loadedScore = rec.currentScore;
            const loadedHistory =
              Array.isArray(rec.history) && rec.history.length > 0 ? rec.history : [loadedScore];
            const loadedSample =
              rec.currentSample ??
              generateSample(loadedScenario, loadedScore.timestamp, loadedBaseline);
            const loadedSamples =
              Array.isArray(rec.samples) && rec.samples.length > 0 ? rec.samples : [loadedSample];
            const loadedFeatures = extractFeatures(
              loadedSample,
              null,
              loadedScenario,
              loadedBaseline
            );
            const loadedMatrixA = extractMatrixAFeatures(
              loadedSample,
              null,
              loadedScenario,
              loadedHistory.length
            );

            setBaseline(loadedBaseline);
            setScenarioState(loadedScenario);
            setSimulationData({
              samples: loadedSamples,
              history: loadedHistory,
              currentSample: loadedSample,
              currentScore: loadedScore,
              features: loadedFeatures,
              matrixAFeatures: loadedMatrixA,
              timeline: generateTimeline(loadedScenario),
            });
            setMatrixAFeatures(loadedMatrixA);
            setModelProbability(loadedScore.modelProbability ?? null);
            return true;
          }
        }
      } catch (err) {
        console.warn("[SimulationContext] Failed to fetch persisted ISI data:", err);
      }
      return false;
    },
    []
  );

  const refreshISIData = useCallback(async () => {
    await fetchPersistedISIData(effectiveUserId);
  }, [fetchPersistedISIData, effectiveUserId]);

  const refreshBaseline = useCallback(async () => {
    try {
      let record: PatientRecord | null = null;

      // 1. Check local storage first
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            key.startsWith("beatahead-patient-record") &&
            (key.includes(effectiveUserId) || key === "beatahead-patient-record-demo-user-1")
          ) {
            try {
              const item = localStorage.getItem(key);
              if (item) {
                const parsed = JSON.parse(item) as PatientRecord;
                if (
                  parsed.restingHeartRate !== null ||
                  parsed.systolicBP !== null ||
                  parsed.bloodPressureCategory !== "" ||
                  parsed.smokingStatus !== "" ||
                  parsed.diabetesStatus !== "" ||
                  parsed.cholesterolStatus !== "" ||
                  parsed.stressLevel !== "" ||
                  parsed.exerciseFrequency !== ""
                ) {
                  record = parsed;
                  break;
                }
              }
            } catch {}
          }
        }
      }

      // 2. Fetch from shared backend API with effectiveUserId
      if (!record) {
        const res = await fetch(`/api/patient-record?userId=${encodeURIComponent(effectiveUserId)}`);
        if (res.ok) {
          const apiData = await res.json();
          record = apiData.record || apiData;
        }
      }

      if (record) {
        setHealthRecord(record);
        const derived = deriveBaselineFromHealthRecord(record);
        setBaseline(derived);

        let activeScenario = scenario;
        if (typeof window !== "undefined") {
          const userChosenScenario = localStorage.getItem("beatahead-scenario");
          if (!userChosenScenario && derived.isi <= 45) {
            activeScenario = "normal";
            setScenarioState("normal");
          }
        }

        const freshData = buildSimulationData(activeScenario, modelProbabilityRef.current, derived);
        setSimulationData(freshData);
        setMatrixAFeatures(freshData.matrixAFeatures);

        // Persist newly derived baseline & score to shared store
        persistISIData(
          effectiveUserId,
          freshData.currentScore,
          freshData.history,
          freshData.currentSample,
          freshData.samples,
          derived,
          activeScenario
        );
      }
    } catch {
      // silently fall back
    }
  }, [scenario, effectiveUserId, persistISIData]);

  // Initial load: Fetch saved ISI score from backend for this account
  useEffect(() => {
    let isCancelled = false;
    async function initAccountData() {
      const found = await fetchPersistedISIData(effectiveUserId);
      if (isCancelled) return;
      if (!found) {
        // First initialization for this account: derive baseline and persist initial record
        refreshBaseline();
      }
    }
    initAccountData();
    return () => {
      isCancelled = true;
    };
  }, [effectiveUserId, fetchPersistedISIData, refreshBaseline]);

  // Cross-device sync on tab visibility / focus
  useEffect(() => {
    const handleSync = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchPersistedISIData(effectiveUserId);
      }
    };
    window.addEventListener("visibilitychange", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("visibilitychange", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [effectiveUserId, fetchPersistedISIData]);

  // Listen for storage changes and custom events when health record or vitals are updated
  useEffect(() => {
    const handleUpdate = () => {
      refreshBaseline();
    };
    window.addEventListener("beatahead-patient-record-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("beatahead-patient-record-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refreshBaseline]);
  // ──────────────────────────────────────────────────────────────────────

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);
  
  // Real ML Model inference state
  const [matrixAFeatures, setMatrixAFeatures] = useState<MatrixAFeatureVector | null>(
    () => simulationData.matrixAFeatures
  );
  const [modelProbability, setModelProbability] = useState<number | null>(null);
  const [modelAlert, setModelAlert] = useState<boolean>(false);
  const [mlServiceStatus, setMlServiceStatus] = useState<"healthy" | "unavailable" | "evaluating">("healthy");
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const tickCounterRef = useRef<number>(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousSampleRef = useRef<PhysiologicalSample | null>(simulationData.currentSample);
  const isFirstScenarioEffect = useRef(true);

  const {
    samples,
    history,
    currentSample,
    currentScore,
    features,
    timeline,
  } = simulationData;

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    localStorage.setItem("beatahead-settings", JSON.stringify(settings));
  }, [settings]);

  const matrixAFeaturesRef = useRef<MatrixAFeatureVector | null>(simulationData.matrixAFeatures);
  matrixAFeaturesRef.current = matrixAFeatures;
  const modelProbabilityRef = useRef<number | null>(modelProbability);
  modelProbabilityRef.current = modelProbability;
  const simulationDataRef = useRef(simulationData);
  simulationDataRef.current = simulationData;

  const evaluateModel = useCallback(async (customFeats?: MatrixAFeatureVector) => {
    const targetFeats = customFeats ?? matrixAFeaturesRef.current ?? simulationDataRef.current.matrixAFeatures;
    if (!targetFeats || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/ml/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: targetFeats })
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.probability === "number") {
          setModelProbability(data.probability);
          setModelAlert(data.prediction === 1 || data.probability >= (data.threshold || 0.156742));
          setMlServiceStatus("healthy");
          setLastEvaluatedAt(new Date().toLocaleTimeString());
        }
      } else {
        setMlServiceStatus("unavailable");
      }
    } catch {
      setMlServiceStatus("unavailable");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const initializeData = useCallback((newScenario: DemoScenario) => {
    const data = buildSimulationData(newScenario, modelProbabilityRef.current, baseline);
    setSimulationData(data);
    setMatrixAFeatures(data.matrixAFeatures);
    previousSampleRef.current = data.currentSample;
    evaluateModel(data.matrixAFeatures);
  }, [evaluateModel, baseline]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (p.startsWith("/sign-in") || p.startsWith("/sign-up")) {
        return;
      }
    }
    if (isFirstScenarioEffect.current) {
      isFirstScenarioEffect.current = false;
      evaluateModel(simulationDataRef.current.matrixAFeatures);
      return;
    }
    initializeData(scenario);
  }, [scenario, initializeData, evaluateModel]);

  const tick = useCallback(() => {
    tickCounterRef.current++;
    setSimulationData((prev) => {
      const previousSample = previousSampleRef.current ?? prev.currentSample;
      const newSample = generateSample(scenario);
      const newFeatures = extractFeatures(newSample, previousSample, scenario);
      const newMatrixA = extractMatrixAFeatures(
        newSample,
        previousSample,
        scenario,
        prev.history.length
      );
      
      const newScore = calculateISI({
        features: newFeatures,
        baseline,
        historicalScores: prev.history.map((s) => s.score),
        scenario,
        signalQuality: newSample.signalQuality.overall,
        timestamp: newSample.timestamp,
        rawSample: {
          heartRate: newSample.heartRate,
          hrv: newSample.hrv,
          spo2: newSample.spo2,
          ppg: newSample.ppg,
          ecg: newSample.ecg,
          imu: newSample.imu,
        },
        modelProbability: modelProbabilityRef.current !== null ? modelProbabilityRef.current : undefined,
      });

      previousSampleRef.current = newSample;

      // Periodically re-evaluate ML service every 10 ticks (e.g. 10s)
      if (tickCounterRef.current % 10 === 0) {
        evaluateModel(newMatrixA);
      }

      return {
        ...prev,
        currentSample: newSample,
        currentScore: newScore,
        features: newFeatures,
        matrixAFeatures: newMatrixA,
        history: [...prev.history.slice(-119), newScore],
        samples: [...prev.samples.slice(-119), newSample],
      };
    });
  }, [scenario, baseline, evaluateModel]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, settings.updateIntervalMs);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, tick, settings.updateIntervalMs]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const updateSettings = useCallback((partial: Partial<SimulationSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const setScenario = useCallback(
    (newScenario: DemoScenario) => {
      setIsRunning(false);
      setScenarioState(newScenario);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("beatahead-scenario", newScenario);
        } catch {}
      }
      const data = buildSimulationData(newScenario, modelProbabilityRef.current, baseline);
      setSimulationData(data);
      setMatrixAFeatures(data.matrixAFeatures);
      previousSampleRef.current = data.currentSample;
      evaluateModel(data.matrixAFeatures);
      persistISIData(
        effectiveUserId,
        data.currentScore,
        data.history,
        data.currentSample,
        data.samples,
        baseline,
        newScenario
      );
      showToast(`Scenario: ${newScenario.replace(/_/g, " ")}`);
    },
    [showToast, baseline, effectiveUserId, evaluateModel, persistISIData]
  );

  const startMonitoring = useCallback(() => setIsRunning(true), []);
  const pauseMonitoring = useCallback(() => setIsRunning(false), []);

  const resetMonitoring = useCallback(() => {
    setIsRunning(false);
    initializeData(scenario);
    showToast("Simulation reset");
  }, [scenario, initializeData, showToast]);

  const motionArtifactDetected =
    scenario === "motion_artifact" || (currentSample?.signalQuality.overall ?? 100) < 70;

  const systemStatus: SystemStatus = useMemo(
    () => ({
      aiEngine: "active",
      isiEngine: "active",
      dataSync: "connected",
    }),
    []
  );

  const value: SimulationContextValue = {
    isRunning,
    scenario,
    currentSample,
    currentScore,
    history,
    samples,
    baseline,
    features,
    timeline,
    motionArtifactDetected,
    setScenario,
    startMonitoring,
    pauseMonitoring,
    resetMonitoring,
    systemStatus,
    settings,
    updateSettings,
    showToast,
    toastMessage,
    matrixAFeatures,
    modelProbability,
    modelAlert,
    modelThreshold: 0.156742,
    mlServiceStatus,
    lastEvaluatedAt,
    evaluateModel,
    refreshBaseline,
    refreshISIData,
    healthRecord,
  };

  return (
    <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error("useSimulation must be used within SimulationProvider");
  }
  return context;
}
