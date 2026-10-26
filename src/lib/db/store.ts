import fs from "fs";
import path from "path";
import {
  createEmptyPatientRecord,
  PatientRecord,
  PatientRecordUpdate,
} from "@/lib/patient-record";
import type { UserISIScoreRecord } from "@/lib/isi/types";

export interface UserSubscription {
  userId: string;
  subscriptionStatus: "active" | "inactive" | "pending" | "cancelled";
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  subscriptionPlan: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "subscriptions.json");

// Initial default state
const defaultState: Record<string, UserSubscription> = {
  "demo-user-1": {
    userId: "demo-user-1",
    subscriptionStatus: "inactive",
    subscriptionPlan: "Free",
    updatedAt: new Date().toISOString(),
  },
};

function ensureDirectoryExists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("Error creating data directory:", err);
  }
}

const PREMIUM_ACCOUNTS = [
  "skandakn13@gmail.com",
];

function isWhitelistedUser(userId?: string): boolean {
  if (!userId) return false;
  const lower = userId.toLowerCase();
  return (
    PREMIUM_ACCOUNTS.some((email) => lower === email.toLowerCase()) ||
    lower.includes("skandakn13")
  );
}

export function getSubscription(userId: string = "demo-user-1"): UserSubscription {
  if (isWhitelistedUser(userId)) {
    return {
      userId,
      subscriptionStatus: "active",
      subscriptionPlan: "Pro (Competition Access)",
      updatedAt: new Date().toISOString(),
    };
  }

  ensureDirectoryExists();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const fileData = fs.readFileSync(STORE_FILE, "utf-8");
      const store = JSON.parse(fileData);
      return store[userId] || {
        userId,
        subscriptionStatus: "inactive",
        subscriptionPlan: "Free",
        updatedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error("Error reading subscription store:", err);
  }
  return defaultState[userId] || {
    userId,
    subscriptionStatus: "inactive",
    subscriptionPlan: "Free",
    updatedAt: new Date().toISOString(),
  };
}

export function updateSubscription(userId: string = "demo-user-1", updates: Partial<UserSubscription>): UserSubscription {
  ensureDirectoryExists();
  let store: Record<string, UserSubscription> = {};
  try {
    if (fs.existsSync(STORE_FILE)) {
      const fileData = fs.readFileSync(STORE_FILE, "utf-8");
      store = JSON.parse(fileData);
    }
  } catch {
    store = {};
  }

  const current = store[userId] || {
    userId,
    subscriptionStatus: "inactive",
    subscriptionPlan: "Free",
    updatedAt: new Date().toISOString(),
  };

  const updated: UserSubscription = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  store[userId] = updated;

  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing subscription store:", err);
  }

  return updated;
}
const PATIENT_RECORD_FILE = path.join(DATA_DIR, "patient-records.json");
export function getPatientRecord(userId = "demo-user-1"): PatientRecord {
  ensureDirectoryExists();
  try {
    const records: Record<string, PatientRecord> = fs.existsSync(PATIENT_RECORD_FILE)
      ? JSON.parse(fs.readFileSync(PATIENT_RECORD_FILE, "utf-8")) : {};
    return records[userId] || createEmptyPatientRecord(userId);
  } catch {
    return createEmptyPatientRecord(userId);
  }
}
export function updatePatientRecord(userId: string, updates: PatientRecordUpdate): PatientRecord {
  ensureDirectoryExists();
  let records: Record<string, PatientRecord> = {};
  try {
    if (fs.existsSync(PATIENT_RECORD_FILE)) records = JSON.parse(fs.readFileSync(PATIENT_RECORD_FILE, "utf-8"));
  } catch {
    records = {};
  }
  const current = records[userId] || createEmptyPatientRecord(userId);
  const record: PatientRecord = { ...current, ...updates, userId, updatedAt: new Date().toISOString() };
  records[userId] = record;
  fs.writeFileSync(PATIENT_RECORD_FILE, JSON.stringify(records, null, 2), "utf-8");
  return record;
}

const ISI_STORE_FILE = path.join(DATA_DIR, "isi-records.json");

export function getUserISIScore(userId = "demo-user-1"): UserISIScoreRecord | null {
  ensureDirectoryExists();
  try {
    if (fs.existsSync(ISI_STORE_FILE)) {
      const records: Record<string, UserISIScoreRecord> = JSON.parse(
        fs.readFileSync(ISI_STORE_FILE, "utf-8")
      );
      return records[userId] || null;
    }
  } catch (err) {
    console.error("Error reading ISI store:", err);
  }
  return null;
}

export function saveUserISIScore(userId: string, data: Partial<UserISIScoreRecord>): UserISIScoreRecord {
  ensureDirectoryExists();
  let records: Record<string, UserISIScoreRecord> = {};
  try {
    if (fs.existsSync(ISI_STORE_FILE)) {
      records = JSON.parse(fs.readFileSync(ISI_STORE_FILE, "utf-8"));
    }
  } catch {
    records = {};
  }
  const existing = records[userId];
  const record: UserISIScoreRecord = {
    userId,
    currentScore: data.currentScore ?? existing?.currentScore ?? {
      timestamp: Date.now(),
      score: 32,
      rawScore: 32,
      baseline: 32,
      trend: "stable",
      confidence: 95,
      contributions: {
        hrv: 0,
        pulseMorphology: 0,
        spo2Trend: 0,
        ecg: 0,
        motionArtifact: 0,
        modelEvidence: 0,
        autonomic: 0,
        perfusion: 0,
        trend: 0,
      },
      label: "Lower observed trend",
      deviation: 0,
      modelProbability: 0.005,
      modelEvidence: 0.004,
      modelAlert: false,
      state: "Normal / Stable",
      signalQuality: 0.95,
      baselineStatus: "Established",
      trendMomentum: 0,
    },
    history: data.history ?? existing?.history ?? [],
    currentSample: data.currentSample ?? existing?.currentSample,
    samples: data.samples ?? existing?.samples ?? [],
    baseline: data.baseline ?? existing?.baseline ?? {
      restingHR: 68,
      hrv: 52,
      spo2: 97,
      pulseMorphology: 0.85,
      ecgAmplitude: 0.8,
      isi: 32,
    },
    scenario: data.scenario ?? existing?.scenario ?? "normal",
    updatedAt: new Date().toISOString(),
  };
  records[userId] = record;
  try {
    fs.writeFileSync(ISI_STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing ISI store:", err);
  }
  return record;
}
