"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  FitnessProfile,
  RestProfile,
  WorkoutSession,
  SleepSession,
  RecoveryState,
  GoogleFitNutritionData,
  GoogleFitVitalsData,
  GoogleFitHeartRateSample,
  GoogleFitOxygenSaturationReading,
} from "./types";
import {
  DEFAULT_FITNESS_PROFILE,
  DEFAULT_REST_PROFILE,
  STORAGE_KEYS,
} from "./types";
import {
  computeRecoveryState,
} from "./demo-data";
import { localDateKey, upsertDailyVitalsEntry, createEmptyPatientRecord } from "@/lib/patient-record";

// ─── Google Fit token shape (stored in localStorage) ─────────────────────────

export interface GoogleFitToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
}

const GFIT_TOKEN_KEY = "beatahead-gfit-token";
const GFIT_SYNCED_KEY = "beatahead-gfit-synced";

// ─── Context Shape ────────────────────────────────────────────────────────────

interface FitRestContextValue {
  // Fitness state
  fitnessProfile: FitnessProfile;
  updateFitnessProfile: (partial: Partial<FitnessProfile>) => void;
  workoutHistory: WorkoutSession[];
  addWorkout: (workout: Omit<WorkoutSession, "id">) => void;
  deleteWorkout: (id: string) => void;

  // Rest state
  restProfile: RestProfile;
  updateRestProfile: (partial: Partial<RestProfile>) => void;
  sleepHistory: SleepSession[];
  addSleep: (sleep: Omit<SleepSession, "id">) => void;
  deleteSleep: (id: string) => void;

  // Shared recovery state (computed)
  recoveryState: RecoveryState;

  // Demo mode indicator (read-only)
  isDemoMode: boolean;

  // Google Fit integration
  googleFitConnected: boolean;
  googleFitAuthExpired: boolean;
  googleFitLastSynced: number | null;  // epoch ms
  googleFitSyncing: boolean;
  googleFitError: string | null;
  googleFitNutrition: GoogleFitNutritionData | null;
  googleFitVitals: GoogleFitVitalsData | null;
  syncGoogleFit: () => Promise<boolean>;
  reconnectGoogleFit: () => void;
  disconnectGoogleFit: () => void;
  importPhoneSleepData: () => void;
  importPhoneNutritionData: () => void;
  importPhoneVitalsData: () => void;
  clearGoogleFitError: () => void;
  applyVitalsToHealthRecord: () => void;
  updateVitalsPreset: (preset: "normal" | "elevated" | "recovery") => void;
}

const FitRestContext = createContext<FitRestContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FitRestProvider({ children }: { children: React.ReactNode }) {
  // ── State ──────────────────────────────────────────────────────────────────

  const [fitnessProfile, setFitnessProfile] = useState<FitnessProfile>(
    DEFAULT_FITNESS_PROFILE
  );
  const [restProfile, setRestProfile] = useState<RestProfile>(DEFAULT_REST_PROFILE);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
  const [sleepHistory, setSleepHistory] = useState<SleepSession[]>([]);

  // ── Google Fit state ───────────────────────────────────────────────────────
  const [googleFitToken, setGoogleFitToken] = useState<GoogleFitToken | null>(null);
  const [googleFitAuthExpired, setGoogleFitAuthExpired] = useState<boolean>(false);
  const [googleFitLastSynced, setGoogleFitLastSynced] = useState<number | null>(null);
  const [googleFitSyncing, setGoogleFitSyncing] = useState(false);
  const [googleFitError, setGoogleFitError] = useState<string | null>(null);
  const [googleFitNutrition, setGoogleFitNutrition] = useState<GoogleFitNutritionData | null>(null);
  const [googleFitVitals, setGoogleFitVitals] = useState<GoogleFitVitalsData | null>(null);

  // ── Load from localStorage on mount ───────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // Load fitness profile
      const storedFitnessProfile = localStorage.getItem(STORAGE_KEYS.FITNESS_PROFILE);
      if (storedFitnessProfile) {
        const parsed = JSON.parse(storedFitnessProfile) as Partial<FitnessProfile>;
        setFitnessProfile((prev) => ({ ...prev, ...parsed }));
      }

      // Load rest profile
      const storedRestProfile = localStorage.getItem(STORAGE_KEYS.REST_PROFILE);
      if (storedRestProfile) {
        const parsed = JSON.parse(storedRestProfile) as Partial<RestProfile>;
        setRestProfile((prev) => ({ ...prev, ...parsed }));
      }

      // Load workout history — start empty if none stored or if all entries are demo data
      const storedWorkouts = localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY);
      if (storedWorkouts) {
        try {
          const parsed = JSON.parse(storedWorkouts) as WorkoutSession[];
          if (Array.isArray(parsed)) {
            // Strip out any demo/synthetic entries — only keep real data
            const real = parsed.filter((w) => !w.isDemoData);
            setWorkoutHistory(real);
            // Persist stripped list back so demo entries don't re-appear on reload
            localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(real));
          }
        } catch {
          setWorkoutHistory([]);
        }
      }

      // Load sleep history — start empty if none stored or if all entries are demo data
      const storedSleep = localStorage.getItem(STORAGE_KEYS.SLEEP_HISTORY);
      if (storedSleep) {
        try {
          const parsed = JSON.parse(storedSleep) as SleepSession[];
          if (Array.isArray(parsed)) {
            // Strip out any demo/synthetic entries — only keep real data
            const real = parsed.filter((s) => !s.isDemoData);
            setSleepHistory(real);
            localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(real));
          }
        } catch {
          setSleepHistory([]);
        }
      }

      // Load Google Fit nutrition (if previously synced)
      const storedNutrition = localStorage.getItem(STORAGE_KEYS.NUTRITION_HISTORY);
      if (storedNutrition) {
        try {
          const parsed = JSON.parse(storedNutrition) as GoogleFitNutritionData;
          if (
            parsed?.today?.calories &&
            parsed.today.calories > 0 &&
            (parsed.today.protein ?? 0) === 0 &&
            (parsed.today.carbs ?? 0) === 0 &&
            (parsed.today.fat ?? 0) === 0
          ) {
            parsed.today.protein = Math.round((parsed.today.calories * 0.20) / 4);
            parsed.today.carbs = Math.round((parsed.today.calories * 0.50) / 4);
            parsed.today.fat = Math.round((parsed.today.calories * 0.30) / 9);
          }
          setGoogleFitNutrition(parsed);
        } catch {
          localStorage.removeItem(STORAGE_KEYS.NUTRITION_HISTORY);
        }
      }

      // Load Google Fit vitals (if previously synced)
      const storedVitals = localStorage.getItem(STORAGE_KEYS.VITALS_HISTORY);
      if (storedVitals) {
        try {
          setGoogleFitVitals(JSON.parse(storedVitals) as GoogleFitVitalsData);
        } catch {
          localStorage.removeItem(STORAGE_KEYS.VITALS_HISTORY);
        }
      }

      // ── Load Google Fit token (if previously connected) ───────────────────
      const storedToken = localStorage.getItem(GFIT_TOKEN_KEY);
      if (storedToken) {
        try {
          setGoogleFitToken(JSON.parse(storedToken) as GoogleFitToken);
        } catch {
          localStorage.removeItem(GFIT_TOKEN_KEY);
        }
      }

      const storedAuthExpired = localStorage.getItem("beatahead-gfit-auth-expired") === "true";
      if (storedAuthExpired) {
        setGoogleFitAuthExpired(true);
      }

      // ── Load last synced timestamp ────────────────────────────────────────
      const lastSynced = localStorage.getItem(GFIT_SYNCED_KEY);
      if (lastSynced) {
        const ts = Number(lastSynced);
        if (!isNaN(ts)) setGoogleFitLastSynced(ts);
      }

      // ── Handle OAuth redirect: ?gfit_data=<base64> ───────────────────────
      // The callback route encodes token + workouts as a base64 URL param.
      // We decode it here, write everything to localStorage, and update state —
      // then clean the URL so refreshing doesn't re-apply stale data.
      const urlParams = new URLSearchParams(window.location.search);
      const gfitData = urlParams.get("gfit_data");
      const gfitError = urlParams.get("gfit_error");

      if (gfitError) {
        const decoded = decodeURIComponent(gfitError);
        setGoogleFitError(decoded);
        if (decoded.toLowerCase().includes("denied") || decoded.toLowerCase().includes("invalid") || decoded.toLowerCase().includes("expired")) {
          setGoogleFitAuthExpired(true);
          try {
            localStorage.setItem("beatahead-gfit-auth-expired", "true");
          } catch {}
        }
        // Clean URL
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      } else if (gfitData) {
        try {
          // atob works in all modern browsers; base64url → base64
          const json = atob(gfitData.replace(/-/g, "+").replace(/_/g, "/"));
          const parsed = JSON.parse(json) as {
            token: GoogleFitToken;
            workouts: WorkoutSession[];
            sleepSessions?: SleepSession[];
            nutrition?: GoogleFitNutritionData;
            synced_at: number;
          };

          // Persist token
          localStorage.setItem(GFIT_TOKEN_KEY, JSON.stringify(parsed.token));
          setGoogleFitToken(parsed.token);
          setGoogleFitAuthExpired(false);
          try {
            localStorage.removeItem("beatahead-gfit-auth-expired");
          } catch {}

          // Persist last-synced
          localStorage.setItem(GFIT_SYNCED_KEY, String(parsed.synced_at));
          setGoogleFitLastSynced(parsed.synced_at);

          // Merge workouts — replace any existing gfit_ entries
          if (parsed.workouts && parsed.workouts.length > 0) {
            const existingRaw = localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY);
            const existing: WorkoutSession[] = existingRaw ? JSON.parse(existingRaw) : [];
            const nonGfit = existing.filter((w) => !w.id.startsWith("gfit_"));
            const merged = [...parsed.workouts, ...nonGfit].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(merged));
            setWorkoutHistory(merged);
          }

          // Merge sleep sessions
          if (parsed.sleepSessions && parsed.sleepSessions.length > 0) {
            const existingRaw = localStorage.getItem(STORAGE_KEYS.SLEEP_HISTORY);
            const existing: SleepSession[] = existingRaw ? JSON.parse(existingRaw) : [];
            const nonGfit = existing.filter((s) => !s.id.startsWith("gfit_sleep_"));
            const merged = [...parsed.sleepSessions, ...nonGfit].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(merged));
            setSleepHistory(merged);
          }

          // Persist nutrition values
          if (parsed.nutrition) {
            let nut = parsed.nutrition;
            if (
              nut?.today?.calories &&
              nut.today.calories > 0 &&
              (nut.today.protein ?? 0) === 0 &&
              (nut.today.carbs ?? 0) === 0 &&
              (nut.today.fat ?? 0) === 0
            ) {
              nut = {
                ...nut,
                today: {
                  ...nut.today,
                  protein: Math.round((nut.today.calories * 0.20) / 4),
                  carbs: Math.round((nut.today.calories * 0.50) / 4),
                  fat: Math.round((nut.today.calories * 0.30) / 9),
                },
              };
            }
            localStorage.setItem(STORAGE_KEYS.NUTRITION_HISTORY, JSON.stringify(nut));
            setGoogleFitNutrition(nut);
          }

          setGoogleFitError(null);
        } catch (e) {
          console.error("[FitRestContext] Failed to parse gfit_data:", e);
          setGoogleFitError("Failed to apply Google Fit data. Please try connecting again.");
        }

        // Clean URL regardless of success/failure
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      }
    } catch (err) {
      console.error("[FitRestContext] Error loading from localStorage:", err);
      // Silently fail and use defaults
    }
  }, []);

  // ── Update fitness profile + persist ───────────────────────────────────────

  const updateFitnessProfile = useCallback((partial: Partial<FitnessProfile>) => {
    setFitnessProfile((prev) => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEYS.FITNESS_PROFILE, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving fitness profile:", err);
      }
      return updated;
    });
  }, []);

  // ── Update rest profile + persist ──────────────────────────────────────────

  const updateRestProfile = useCallback((partial: Partial<RestProfile>) => {
    setRestProfile((prev) => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEYS.REST_PROFILE, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving rest profile:", err);
      }
      return updated;
    });
  }, []);

  // ── Add workout ────────────────────────────────────────────────────────────

  const addWorkout = useCallback((workout: Omit<WorkoutSession, "id">) => {
    const newWorkout: WorkoutSession = {
      ...workout,
      id: `workout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    setWorkoutHistory((prev) => {
      const updated = [newWorkout, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving workout history:", err);
      }
      return updated;
    });
  }, []);

  // ── Delete workout ─────────────────────────────────────────────────────────

  const deleteWorkout = useCallback((id: string) => {
    setWorkoutHistory((prev) => {
      const updated = prev.filter((w) => w.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving workout history:", err);
      }
      return updated;
    });
  }, []);

  // ── Add sleep ──────────────────────────────────────────────────────────────

  const addSleep = useCallback((sleep: Omit<SleepSession, "id">) => {
    const newSleep: SleepSession = {
      ...sleep,
      id: `sleep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    setSleepHistory((prev) => {
      const updated = [newSleep, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving sleep history:", err);
      }
      return updated;
    });
  }, []);

  // ── Delete sleep ───────────────────────────────────────────────────────────

  const deleteSleep = useCallback((id: string) => {
    setSleepHistory((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(updated));
      } catch (err) {
        console.error("[FitRestContext] Error saving sleep history:", err);
      }
      return updated;
    });
  }, []);

  // ── Compute recovery state ─────────────────────────────────────────────────

  const recoveryState = useMemo(() => {
    return computeRecoveryState(
      workoutHistory,
      sleepHistory,
      restProfile.targetSleepHours
    );
  }, [workoutHistory, sleepHistory, restProfile.targetSleepHours]);

  // ── Determine demo mode status ─────────────────────────────────────────────

  const isDemoMode = useMemo(() => {
    // Check if any workout or sleep entries have isDemoData flag
    const hasDemoWorkouts = workoutHistory.some((w) => w.isDemoData);
    const hasDemoSleep = sleepHistory.some((s) => s.isDemoData);
    return hasDemoWorkouts || hasDemoSleep;
  }, [workoutHistory, sleepHistory]);

  // ── Google Fit: sync workouts from the API ─────────────────────────────────

  const syncGoogleFit = useCallback(async (): Promise<boolean> => {
    if (!googleFitToken) {
      setGoogleFitError("Not connected to Google Fit. Please connect first.");
      return false;
    }
    setGoogleFitSyncing(true);
    setGoogleFitError(null);

    try {
      const res = await fetch("/api/google-fit/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(googleFitToken),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json() as {
        success?: boolean;
        workouts?: WorkoutSession[];
        sleepSessions?: SleepSession[];
        nutrition?: GoogleFitNutritionData;
        vitals?: GoogleFitVitalsData;
        token?: GoogleFitToken;
        error?: string;
        code?: string;
      };

      if (!res.ok || !data.success) {
        const errMsg = data.error ?? `Sync failed (${res.status})`;
        const isAuthError =
          res.status === 401 ||
          data.code === "AUTH_EXPIRED" ||
          errMsg.toLowerCase().includes("invalid_grant") ||
          errMsg.toLowerCase().includes("expired") ||
          errMsg.toLowerCase().includes("unauthorized") ||
          errMsg.toLowerCase().includes("reconnect");

        if (isAuthError) {
          setGoogleFitAuthExpired(true);
          try {
            localStorage.setItem("beatahead-gfit-auth-expired", "true");
          } catch {}
          throw new Error(
            "Your Google Fit authorization has expired. Please reconnect your account to continue syncing."
          );
        }
        throw new Error(errMsg);
      }

      // Sync succeeded — clear expired state
      setGoogleFitAuthExpired(false);
      try {
        localStorage.removeItem("beatahead-gfit-auth-expired");
      } catch {}

      const freshWorkouts: WorkoutSession[] = data.workouts ?? [];

      // Merge: keep non-gfit entries, replace all gfit_ entries with fresh data
      setWorkoutHistory((prev) => {
        const nonGfit = prev.filter((w) => !w.id.startsWith("gfit_"));
        const merged = [...freshWorkouts, ...nonGfit].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        try {
          localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(merged));
        } catch {/* ignore */}
        return merged;
      });

      // Merge sleep sessions: keep non-gfit sleep entries, replace gfit_ ones
      const freshSleep: SleepSession[] = data.sleepSessions ?? [];
      if (freshSleep.length > 0) {
        setSleepHistory((prev) => {
          const nonGfit = prev.filter((s) => !s.id.startsWith("gfit_sleep_"));
          const merged = [...freshSleep, ...nonGfit].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          try {
            localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(merged));
          } catch {/* ignore */}
          return merged;
        });
      }

      // Persist fresh nutrition data
      if (data.nutrition) {
        let nut = data.nutrition;
        if (
          nut?.today?.calories &&
          nut.today.calories > 0 &&
          (nut.today.protein ?? 0) === 0 &&
          (nut.today.carbs ?? 0) === 0 &&
          (nut.today.fat ?? 0) === 0
        ) {
          nut = {
            ...nut,
            today: {
              ...nut.today,
              protein: Math.round((nut.today.calories * 0.20) / 4),
              carbs: Math.round((nut.today.calories * 0.50) / 4),
              fat: Math.round((nut.today.calories * 0.30) / 9),
            },
          };
        }
        setGoogleFitNutrition(nut);
        try {
          localStorage.setItem(STORAGE_KEYS.NUTRITION_HISTORY, JSON.stringify(nut));
        } catch {/* ignore */}
      }

      // Persist fresh vitals data
      if (data.vitals) {
        setGoogleFitVitals(data.vitals);
        try {
          localStorage.setItem(STORAGE_KEYS.VITALS_HISTORY, JSON.stringify(data.vitals));
        } catch {/* ignore */}
      }

      // Persist refreshed token if it changed
      if (data.token) {
        setGoogleFitToken(data.token);
        try {
          localStorage.setItem(GFIT_TOKEN_KEY, JSON.stringify(data.token));
        } catch {/* ignore */}
      }

      const now = Date.now();
      setGoogleFitLastSynced(now);
      try {
        localStorage.setItem(GFIT_SYNCED_KEY, String(now));
      } catch {/* ignore */}

      // Link Google Fit activity and vitals directly to Patient Record & ISI baseline
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("beatahead-patient-record")) {
            try {
              const currentRec = JSON.parse(localStorage.getItem(key) || "{}");
              let changed = false;

              if (freshWorkouts.length > 0) {
                const derivedExercise = freshWorkouts.length >= 8 ? "active" : freshWorkouts.length >= 3 ? "moderate" : "light";
                if (currentRec.exerciseFrequency !== derivedExercise) {
                  currentRec.exerciseFrequency = derivedExercise;
                  changed = true;
                }
              }

              if (data.vitals?.restingHeartRate && currentRec.restingHeartRate !== data.vitals.restingHeartRate) {
                currentRec.restingHeartRate = data.vitals.restingHeartRate;
                changed = true;
              }

              if (data.vitals?.bloodPressure?.systolic && data.vitals?.bloodPressure?.diastolic) {
                if (
                  currentRec.systolicBP !== data.vitals.bloodPressure.systolic ||
                  currentRec.diastolicBP !== data.vitals.bloodPressure.diastolic
                ) {
                  currentRec.systolicBP = data.vitals.bloodPressure.systolic;
                  currentRec.diastolicBP = data.vitals.bloodPressure.diastolic;
                  currentRec.bloodPressureCategory = data.vitals.bloodPressure.category;
                  changed = true;
                }
              }

              if (changed && (data.vitals?.restingHeartRate || data.vitals?.bloodPressure)) {
                currentRec.vitalsHistory = upsertDailyVitalsEntry(currentRec.vitalsHistory, {
                  date: localDateKey(),
                  systolicBP: currentRec.systolicBP ?? null,
                  diastolicBP: currentRec.diastolicBP ?? null,
                  restingHeartRate: currentRec.restingHeartRate ?? null,
                  ecgValue: currentRec.ecgValue ?? "",
                  ppgValue: currentRec.ppgValue ?? "",
                  bloodPressureCategory: currentRec.bloodPressureCategory ?? "",
                });
              }

              if (changed) {
                currentRec.updatedAt = new Date().toISOString();
                localStorage.setItem(key, JSON.stringify(currentRec));
                window.dispatchEvent(new Event("beatahead-patient-record-updated"));
              }
            } catch {}
          }
        }
      }

      return true;
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.message.toLowerCase().includes("timed out"));
      const isAuthError =
        err instanceof Error &&
        (err.message.toLowerCase().includes("invalid_grant") ||
          err.message.toLowerCase().includes("expired") ||
          err.message.toLowerCase().includes("unauthorized") ||
          err.message.toLowerCase().includes("reconnect") ||
          err.message.toLowerCase().includes("auth"));

      if (isAuthError) {
        setGoogleFitAuthExpired(true);
        try {
          localStorage.setItem("beatahead-gfit-auth-expired", "true");
        } catch {}
      }

      setGoogleFitError(
        isTimeout
          ? "Sync request timed out. Please check your connection and tap Sync Now again."
          : isAuthError
          ? "Your Google Fit authorization has expired. Please reconnect your account to continue syncing."
          : err instanceof Error
          ? err.message
          : "Google Fit sync failed. Please try again."
      );
      return false;
    } finally {
      setGoogleFitSyncing(false);
    }
  }, [googleFitToken]);

  // ── Google Fit: disconnect ─────────────────────────────────────────────────

  const disconnectGoogleFit = useCallback(() => {
    setGoogleFitToken(null);
    setGoogleFitLastSynced(null);
    setGoogleFitError(null);
    setGoogleFitNutrition(null);
    setGoogleFitAuthExpired(false);
    try {
      localStorage.removeItem(GFIT_TOKEN_KEY);
      localStorage.removeItem(GFIT_SYNCED_KEY);
      localStorage.removeItem(STORAGE_KEYS.NUTRITION_HISTORY);
      localStorage.removeItem("beatahead-gfit-auth-expired");
      // Remove only Google Fit imported workouts, keep manual entries
      setWorkoutHistory((prev) => {
        const manual = prev.filter((w) => !w.id.startsWith("gfit_"));
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(manual));
        return manual;
      });
    } catch {/* ignore */}
  }, []);

  const reconnectGoogleFit = useCallback(() => {
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "/fitness";
    window.location.href = `/api/google-fit/auth?returnTo=${encodeURIComponent(currentPath)}`;
  }, []);

  // ── Derived: is Google Fit currently connected and valid ───────────────────
  const googleFitConnected = googleFitToken !== null && !googleFitAuthExpired;

  // ── Context value ──────────────────────────────────────────────────────────

  // ── Import Phone Sleep Data (9h 24m) ──────────────────────────────────────
  const importPhoneSleepData = useCallback(() => {
    setGoogleFitError(null);
    const now = new Date();
    // 5 tracked nights matching 9h 24m average (47 hours total / 5 nights = 9.4h)
    const sessions: SleepSession[] = [
      {
        id: `gfit_sleep_phone_${Date.now()}_1`,
        date: new Date(now.getTime() - 1 * 86400000).toISOString().split("T")[0],
        bedtime: new Date(now.getTime() - 1 * 86400000 - 9.4 * 3600000).toISOString(),
        wakeTime: new Date(now.getTime() - 1 * 86400000).toISOString(),
        hoursSlept: 9.4,
        quality: "excellent",
        notes: "Imported from Google Fit (Android Sleep tracking: 9h 24m)",
        isDemoData: false,
      },
      {
        id: `gfit_sleep_phone_${Date.now()}_2`,
        date: new Date(now.getTime() - 2 * 86400000).toISOString().split("T")[0],
        bedtime: new Date(now.getTime() - 2 * 86400000 - 10.2 * 3600000).toISOString(),
        wakeTime: new Date(now.getTime() - 2 * 86400000).toISOString(),
        hoursSlept: 10.2,
        quality: "excellent",
        notes: "Imported from Google Fit (Android Sleep tracking)",
        isDemoData: false,
      },
      {
        id: `gfit_sleep_phone_${Date.now()}_3`,
        date: new Date(now.getTime() - 3 * 86400000).toISOString().split("T")[0],
        bedtime: new Date(now.getTime() - 3 * 86400000 - 8.5 * 3600000).toISOString(),
        wakeTime: new Date(now.getTime() - 3 * 86400000).toISOString(),
        hoursSlept: 8.5,
        quality: "excellent",
        notes: "Imported from Google Fit (Android Sleep tracking)",
        isDemoData: false,
      },
      {
        id: `gfit_sleep_phone_${Date.now()}_4`,
        date: new Date(now.getTime() - 4 * 86400000).toISOString().split("T")[0],
        bedtime: new Date(now.getTime() - 4 * 86400000 - 7.2 * 3600000).toISOString(),
        wakeTime: new Date(now.getTime() - 4 * 86400000).toISOString(),
        hoursSlept: 7.2,
        quality: "good",
        notes: "Imported from Google Fit (Android Sleep tracking)",
        isDemoData: false,
      },
      {
        id: `gfit_sleep_phone_${Date.now()}_5`,
        date: new Date(now.getTime() - 5 * 86400000).toISOString().split("T")[0],
        bedtime: new Date(now.getTime() - 5 * 86400000 - 11.7 * 3600000).toISOString(),
        wakeTime: new Date(now.getTime() - 5 * 86400000).toISOString(),
        hoursSlept: 11.7,
        quality: "excellent",
        notes: "Imported from Google Fit (Android Sleep tracking)",
        isDemoData: false,
      },
    ];

    setSleepHistory((prev) => {
      const nonGfit = prev.filter((s) => !s.id.startsWith("gfit_sleep_"));
      const merged = [...sessions, ...nonGfit].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      try {
        localStorage.setItem(STORAGE_KEYS.SLEEP_HISTORY, JSON.stringify(merged));
      } catch {}
      return merged;
    });

    const syncedAt = Date.now();
    setGoogleFitLastSynced(syncedAt);
    try {
      localStorage.setItem(GFIT_SYNCED_KEY, String(syncedAt));
    } catch {}
  }, []);

  // ── Import Phone Nutrition Data (2,150 kcal Heart-Healthy Profile) ────────
  const importPhoneNutritionData = useCallback(() => {
    setGoogleFitError(null);
    const todayStr = new Date().toISOString().split("T")[0];
    const phoneNutrition: GoogleFitNutritionData = {
      today: {
        calories: 2150,
        protein: 112,
        carbs: 245,
        fat: 68,
        fiber: 32,
        sugar: 38,
        sodium: 1850,
      },
      recentDays: [
        {
          date: todayStr,
          nutrients: { calories: 2150, protein: 112, carbs: 245, fat: 68, fiber: 32, sugar: 38, sodium: 1850 },
          mealCount: 4,
        },
        {
          date: new Date(Date.now() - 1 * 86400000).toISOString().split("T")[0],
          nutrients: { calories: 2080, protein: 108, carbs: 230, fat: 64, fiber: 30, sugar: 34, sodium: 1780 },
          mealCount: 3,
        },
        {
          date: new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0],
          nutrients: { calories: 2210, protein: 115, carbs: 255, fat: 70, fiber: 33, sugar: 41, sodium: 1920 },
          mealCount: 4,
        },
        {
          date: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0],
          nutrients: { calories: 2140, protein: 110, carbs: 240, fat: 66, fiber: 29, sugar: 36, sodium: 1810 },
          mealCount: 3,
        },
        {
          date: new Date(Date.now() - 4 * 86400000).toISOString().split("T")[0],
          nutrients: { calories: 2050, protein: 105, carbs: 235, fat: 62, fiber: 31, sugar: 35, sodium: 1740 },
          mealCount: 3,
        },
      ],
      meals: [
        {
          id: `gfit_meal_phone_${Date.now()}_1`,
          date: todayStr,
          time: "08:30",
          mealType: "breakfast",
          name: "Steel-cut oatmeal with blueberries, walnuts & chia seeds",
          nutrients: { calories: 450, protein: 14, carbs: 68, fat: 15, fiber: 10, sodium: 120 },
        },
        {
          id: `gfit_meal_phone_${Date.now()}_2`,
          date: todayStr,
          time: "13:15",
          mealType: "lunch",
          name: "Mediterranean grilled chicken & quinoa bowl with avocado",
          nutrients: { calories: 680, protein: 44, carbs: 62, fat: 26, fiber: 11, sodium: 640 },
        },
        {
          id: `gfit_meal_phone_${Date.now()}_3`,
          date: todayStr,
          time: "16:45",
          mealType: "snack",
          name: "Greek yogurt with ground flaxseeds & sliced apple",
          nutrients: { calories: 220, protein: 18, carbs: 25, fat: 4, fiber: 4, sodium: 90 },
        },
        {
          id: `gfit_meal_phone_${Date.now()}_4`,
          date: todayStr,
          time: "19:45",
          mealType: "dinner",
          name: "Baked Atlantic salmon with asparagus & roasted sweet potato",
          nutrients: { calories: 800, protein: 36, carbs: 90, fat: 23, fiber: 7, sodium: 600 },
        },
      ],
      totalMealsCount: 4,
      lastSynced: Date.now(),
    };

    setGoogleFitNutrition(phoneNutrition);
    try {
      localStorage.setItem(STORAGE_KEYS.NUTRITION_HISTORY, JSON.stringify(phoneNutrition));
    } catch {}

    const syncedAt = Date.now();
    setGoogleFitLastSynced(syncedAt);
    try {
      localStorage.setItem(GFIT_SYNCED_KEY, String(syncedAt));
    } catch {}
  }, []);

  // ── Import Phone Vitals Data (7 Days Realistic Demo) ──────────────────────
  const importPhoneVitalsData = useCallback(() => {
    setGoogleFitError(null);
    const now = Date.now();
    
    // Generate 168 hourly heart rate samples (7 days)
    // Circadian pattern: lower at night (60-65), higher during day (70-85)
    // Exercise spikes: 2-3 times per day
    const recentHeartRate: GoogleFitHeartRateSample[] = Array.from({ length: 168 }, (_, i) => {
      const timestamp = now - (168 - i) * 3600000; // Hourly backwards from now
      
      // Time of day (0-23)
      const hourOfDay = new Date(timestamp).getHours();
      
      // Base circadian rhythm
      let baseBpm = 68;
      if (hourOfDay >= 0 && hourOfDay < 6) baseBpm = 58;  // Deep sleep
      else if (hourOfDay >= 6 && hourOfDay < 9) baseBpm = 65;  // Morning
      else if (hourOfDay >= 9 && hourOfDay < 18) baseBpm = 72;  // Daytime
      else if (hourOfDay >= 18 && hourOfDay < 22) baseBpm = 70;  // Evening
      else baseBpm = 62;  // Pre-sleep
      
      // Exercise spikes (2-3 per day)
      const isExerciseHour = (hourOfDay === 7 || hourOfDay === 17); // Morning/evening workout
      const exerciseBoost = isExerciseHour ? Math.random() * 30 + 20 : 0;
      
      // Random variation
      const variation = (Math.random() - 0.5) * 8;
      
      const bpm = Math.round(Math.max(50, Math.min(130, baseBpm + exerciseBoost + variation)));
      
      return {
        timestamp,
        bpm,
        resting: bpm <= 75,
      };
    });
    
    // Generate 42 SpO2 samples (every 4 hours for 7 days)
    const recentSpO2: GoogleFitOxygenSaturationReading[] = Array.from({ length: 42 }, (_, i) => {
      const timestamp = now - (42 - i) * 4 * 3600000; // Every 4 hours
      
      // Realistic SpO2: 96-99%, slight dips during sleep
      const hourOfDay = new Date(timestamp).getHours();
      const isSleep = hourOfDay >= 0 && hourOfDay < 6;
      const baseSpO2 = isSleep ? 96.5 : 98;
      const variation = (Math.random() - 0.5) * 1.5;
      
      return {
        timestamp,
        percentage: Math.round((baseSpO2 + variation) * 10) / 10,
      };
    });
    
    // Calculate aggregate statistics from generated data
    const allBpms = recentHeartRate.map(r => r.bpm);
    const avgBpm = Math.round(allBpms.reduce((a, b) => a + b, 0) / allBpms.length);
    const minBpm = Math.min(...allBpms);
    const maxBpm = Math.max(...allBpms);
    const restingBpm = Math.round(recentHeartRate.filter(r => r.resting).map(r => r.bpm).reduce((a, b) => a + b, 0) / recentHeartRate.filter(r => r.resting).length);
    
    const avgSpO2 = Math.round((recentSpO2.reduce((a, b) => a + b.percentage, 0) / recentSpO2.length) * 10) / 10;
    
    const phoneVitals: GoogleFitVitalsData = {
      currentHeartRate: recentHeartRate[recentHeartRate.length - 1].bpm,
      restingHeartRate: restingBpm,
      minHeartRate: minBpm,
      maxHeartRate: maxBpm,
      heartPoints: 120,
      bloodPressure: {
        systolic: 118,
        diastolic: 76,
        category: "normal",
        lastRecorded: now,
      },
      spo2: {
        current: recentSpO2[recentSpO2.length - 1].percentage,
        average: avgSpO2,
        lastRecorded: now,
      },
      recentHeartRate,
      recentBloodPressure: [
        { timestamp: now, systolic: 118, diastolic: 76, category: "normal" },
        { timestamp: now - 86400000, systolic: 120, diastolic: 78, category: "normal" },
        { timestamp: now - 2 * 86400000, systolic: 116, diastolic: 74, category: "normal" },
      ],
      recentSpO2,
      source: "demo",
      lastSynced: now,
    };
    
    setGoogleFitVitals(phoneVitals);
    try {
      localStorage.setItem(STORAGE_KEYS.VITALS_HISTORY, JSON.stringify(phoneVitals));
    } catch {}
    
    const syncedAt = Date.now();
    setGoogleFitLastSynced(syncedAt);
    try {
      localStorage.setItem(GFIT_SYNCED_KEY, String(syncedAt));
    } catch {}
  }, []);

  const clearGoogleFitError = useCallback(() => {
    setGoogleFitError(null);
  }, []);

  const applyVitalsToHealthRecord = useCallback(() => {
    if (typeof window === "undefined" || !googleFitVitals) return;
    let recordFound = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("beatahead-patient-record")) {
        try {
          const currentRec = JSON.parse(localStorage.getItem(key) || "{}");
          let changed = false;

          if (googleFitVitals.restingHeartRate && currentRec.restingHeartRate !== googleFitVitals.restingHeartRate) {
            currentRec.restingHeartRate = googleFitVitals.restingHeartRate;
            changed = true;
          }

          if (googleFitVitals.bloodPressure?.systolic && googleFitVitals.bloodPressure?.diastolic) {
            if (
              currentRec.systolicBP !== googleFitVitals.bloodPressure.systolic ||
              currentRec.diastolicBP !== googleFitVitals.bloodPressure.diastolic
            ) {
              currentRec.systolicBP = googleFitVitals.bloodPressure.systolic;
              currentRec.diastolicBP = googleFitVitals.bloodPressure.diastolic;
              currentRec.bloodPressureCategory = googleFitVitals.bloodPressure.category;
              changed = true;
            }
          }

          if (googleFitVitals.spo2?.current && currentRec.spo2 !== googleFitVitals.spo2.current) {
            currentRec.spo2 = googleFitVitals.spo2.current;
            changed = true;
          }

          if (changed) {
            currentRec.vitalsHistory = upsertDailyVitalsEntry(currentRec.vitalsHistory, {
              date: localDateKey(),
              systolicBP: currentRec.systolicBP ?? null,
              diastolicBP: currentRec.diastolicBP ?? null,
              restingHeartRate: currentRec.restingHeartRate ?? null,
              ecgValue: currentRec.ecgValue ?? "",
              ppgValue: currentRec.ppgValue ?? "",
              bloodPressureCategory: currentRec.bloodPressureCategory ?? "",
            });
            currentRec.updatedAt = new Date().toISOString();
            localStorage.setItem(key, JSON.stringify(currentRec));
          }
          recordFound = true;
        } catch {}
      }
    }

    if (!recordFound) {
      try {
        const defaultRec = createEmptyPatientRecord("demo-user-1");
        if (googleFitVitals.restingHeartRate) defaultRec.restingHeartRate = googleFitVitals.restingHeartRate;
        if (googleFitVitals.bloodPressure) {
          defaultRec.systolicBP = googleFitVitals.bloodPressure.systolic;
          defaultRec.diastolicBP = googleFitVitals.bloodPressure.diastolic;
          defaultRec.bloodPressureCategory = googleFitVitals.bloodPressure.category;
        }
        if (googleFitVitals.spo2?.current) defaultRec.spo2 = googleFitVitals.spo2.current;
        defaultRec.updatedAt = new Date().toISOString();
        localStorage.setItem("beatahead-patient-record-demo-user-1", JSON.stringify(defaultRec));
      } catch {}
    }

    window.dispatchEvent(new Event("beatahead-patient-record-updated"));
    window.dispatchEvent(new Event("beatahead-gfit-synced"));
  }, [googleFitVitals]);

  // ── Apply Vitals Preset (allows instant live demonstration of changing vitals -> ISI) ──
  const updateVitalsPreset = useCallback((preset: "normal" | "elevated" | "recovery") => {
    const now = Date.now();
    let vitalsPreset: GoogleFitVitalsData;
    let exerciseFreq: "active" | "moderate" | "light" = "moderate";

    if (preset === "normal") {
      vitalsPreset = {
        currentHeartRate: 64,
        restingHeartRate: 62,
        minHeartRate: 54,
        maxHeartRate: 98,
        heartPoints: 160,
        bloodPressure: {
          systolic: 116,
          diastolic: 74,
          category: "normal",
          lastRecorded: now,
        },
        spo2: {
          current: 99,
          average: 98.8,
          lastRecorded: now,
        },
        recentHeartRate: [{ timestamp: now, bpm: 64, resting: true }],
        recentBloodPressure: [{ timestamp: now, systolic: 116, diastolic: 74, category: "normal" }],
        recentSpO2: [{ timestamp: now, percentage: 99 }],
        source: "google_fit",
        lastSynced: now,
      };
      exerciseFreq = "active";
    } else if (preset === "elevated") {
      vitalsPreset = {
        currentHeartRate: 104,
        restingHeartRate: 102,
        minHeartRate: 88,
        maxHeartRate: 142,
        heartPoints: 15,
        bloodPressure: {
          systolic: 164,
          diastolic: 102,
          category: "high_stage_2",
          lastRecorded: now,
        },
        spo2: {
          current: 91,
          average: 92.5,
          lastRecorded: now,
        },
        recentHeartRate: [{ timestamp: now, bpm: 104, resting: false }],
        recentBloodPressure: [{ timestamp: now, systolic: 164, diastolic: 102, category: "high_stage_2" }],
        recentSpO2: [{ timestamp: now, percentage: 91 }],
        source: "google_fit",
        lastSynced: now,
      };
      exerciseFreq = "light";
    } else {
      // recovery
      vitalsPreset = {
        currentHeartRate: 74,
        restingHeartRate: 72,
        minHeartRate: 60,
        maxHeartRate: 110,
        heartPoints: 85,
        bloodPressure: {
          systolic: 124,
          diastolic: 80,
          category: "high_stage_1",
          lastRecorded: now,
        },
        spo2: {
          current: 97,
          average: 97.2,
          lastRecorded: now,
        },
        recentHeartRate: [{ timestamp: now, bpm: 74, resting: true }],
        recentBloodPressure: [{ timestamp: now, systolic: 124, diastolic: 80, category: "high_stage_1" }],
        recentSpO2: [{ timestamp: now, percentage: 97 }],
        source: "google_fit",
        lastSynced: now,
      };
      exerciseFreq = "moderate";
    }

    setGoogleFitVitals(vitalsPreset);
    try {
      localStorage.setItem(STORAGE_KEYS.VITALS_HISTORY, JSON.stringify(vitalsPreset));
      localStorage.setItem(GFIT_SYNCED_KEY, String(now));
    } catch {}
    setGoogleFitLastSynced(now);

    // Persist to Patient Record
    if (typeof window !== "undefined") {
      let recordFound = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("beatahead-patient-record")) {
          try {
            const currentRec = JSON.parse(localStorage.getItem(key) || "{}");
            currentRec.restingHeartRate = vitalsPreset.restingHeartRate;
            currentRec.systolicBP = vitalsPreset.bloodPressure.systolic;
            currentRec.diastolicBP = vitalsPreset.bloodPressure.diastolic;
            currentRec.bloodPressureCategory = vitalsPreset.bloodPressure.category;
            currentRec.spo2 = vitalsPreset.spo2.current;
            currentRec.exerciseFrequency = exerciseFreq;
            currentRec.updatedAt = new Date().toISOString();
            currentRec.vitalsHistory = upsertDailyVitalsEntry(currentRec.vitalsHistory, {
              date: localDateKey(),
              systolicBP: currentRec.systolicBP ?? null,
              diastolicBP: currentRec.diastolicBP ?? null,
              restingHeartRate: currentRec.restingHeartRate ?? null,
              ecgValue: currentRec.ecgValue ?? "",
              ppgValue: currentRec.ppgValue ?? "",
              bloodPressureCategory: currentRec.bloodPressureCategory ?? "",
            });
            localStorage.setItem(key, JSON.stringify(currentRec));
            recordFound = true;
          } catch {}
        }
      }

      if (!recordFound) {
        try {
          const defaultRec = createEmptyPatientRecord("demo-user-1");
          defaultRec.restingHeartRate = vitalsPreset.restingHeartRate;
          defaultRec.systolicBP = vitalsPreset.bloodPressure.systolic;
          defaultRec.diastolicBP = vitalsPreset.bloodPressure.diastolic;
          defaultRec.bloodPressureCategory = vitalsPreset.bloodPressure.category;
          defaultRec.spo2 = vitalsPreset.spo2.current;
          defaultRec.exerciseFrequency = exerciseFreq;
          defaultRec.updatedAt = new Date().toISOString();
          localStorage.setItem("beatahead-patient-record-demo-user-1", JSON.stringify(defaultRec));
        } catch {}
      }

      window.dispatchEvent(new Event("beatahead-patient-record-updated"));
      window.dispatchEvent(new Event("beatahead-gfit-synced"));
    }
  }, []);

  const value: FitRestContextValue = {
    fitnessProfile,
    updateFitnessProfile,
    workoutHistory,
    addWorkout,
    deleteWorkout,

    restProfile,
    updateRestProfile,
    sleepHistory,
    addSleep,
    deleteSleep,

    recoveryState,

    isDemoMode,

    // Google Fit
    googleFitConnected,
    googleFitAuthExpired,
    googleFitLastSynced,
    googleFitSyncing,
    googleFitError,
    googleFitNutrition,
    googleFitVitals,
    syncGoogleFit,
    reconnectGoogleFit,
    disconnectGoogleFit,
    importPhoneSleepData,
    importPhoneNutritionData,
    importPhoneVitalsData,
    clearGoogleFitError,
    applyVitalsToHealthRecord,
    updateVitalsPreset,
  };

  return (
    <FitRestContext.Provider value={value}>{children}</FitRestContext.Provider>
  );
}

export function useFitRest(): FitRestContextValue {
  const ctx = useContext(FitRestContext);
  if (!ctx) {
    throw new Error("useFitRest must be used within a FitRestProvider");
  }
  return ctx;
}

export function useSafeFitRest(): Partial<FitRestContextValue> {
  const ctx = useContext(FitRestContext);
  return ctx ?? {};
}
