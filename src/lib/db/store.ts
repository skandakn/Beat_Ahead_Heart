import fs from "fs";
import path from "path";
import os from "os";
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

// In-memory fallback stores for zero-downtime reliability across serverless invocations
const inMemorySubscriptions: Record<string, UserSubscription> = {};
const inMemoryPatientRecords: Record<string, PatientRecord> = {};
const inMemoryISIScores: Record<string, UserISIScoreRecord> = {};

function getDataDirectory(): string {
  // On Vercel and AWS Lambda, process.cwd() is read-only (/var/task).
  // os.tmpdir() (/tmp) is guaranteed writable.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDataDir = path.join(os.tmpdir(), "beatahead_data");
    try {
      if (!fs.existsSync(tmpDataDir)) {
        fs.mkdirSync(tmpDataDir, { recursive: true });
      }
      return tmpDataDir;
    } catch {
      return os.tmpdir();
    }
  }

  const localDataDir = path.join(process.cwd(), ".data");
  try {
    if (!fs.existsSync(localDataDir)) {
      fs.mkdirSync(localDataDir, { recursive: true });
    }
    return localDataDir;
  } catch {
    return os.tmpdir();
  }
}

function getStoreFilePath(filename: string): string {
  return path.join(getDataDirectory(), filename);
}

function ensureDirectoryExists(): void {
  getDataDirectory();
}

// Initial default state
const defaultState: Record<string, UserSubscription> = {
  "demo-user-1": {
    userId: "demo-user-1",
    subscriptionStatus: "inactive",
    subscriptionPlan: "Free",
    updatedAt: new Date().toISOString(),
  },
};

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

  if (inMemorySubscriptions[userId]) {
    return inMemorySubscriptions[userId];
  }

  try {
    const storeFile = getStoreFilePath("subscriptions.json");
    if (fs.existsSync(storeFile)) {
      const fileData = fs.readFileSync(storeFile, "utf-8");
      const store = JSON.parse(fileData);
      if (store[userId]) {
        inMemorySubscriptions[userId] = store[userId];
        return store[userId];
      }
    }
  } catch (err) {
    console.warn("Notice: reading subscription store falling back to memory:", err);
  }

  return defaultState[userId] || {
    userId,
    subscriptionStatus: "inactive",
    subscriptionPlan: "Free",
    updatedAt: new Date().toISOString(),
  };
}

export function updateSubscription(userId: string = "demo-user-1", updates: Partial<UserSubscription>): UserSubscription {
  const current = inMemorySubscriptions[userId] || getSubscription(userId);

  const updated: UserSubscription = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  inMemorySubscriptions[userId] = updated;

  try {
    const storeFile = getStoreFilePath("subscriptions.json");
    let store: Record<string, UserSubscription> = {};
    if (fs.existsSync(storeFile)) {
      try {
        store = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
      } catch {
        store = {};
      }
    }
    store[userId] = updated;
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("Notice: subscription file write fallback to memory:", err);
  }

  return updated;
}

export function getPatientRecord(userId = "demo-user-1"): PatientRecord {
  if (inMemoryPatientRecords[userId]) {
    return inMemoryPatientRecords[userId];
  }

  try {
    const patientFile = getStoreFilePath("patient-records.json");
    if (fs.existsSync(patientFile)) {
      const records: Record<string, PatientRecord> = JSON.parse(fs.readFileSync(patientFile, "utf-8"));
      if (records[userId]) {
        inMemoryPatientRecords[userId] = records[userId];
        return records[userId];
      }
    }
  } catch (err) {
    console.warn("Notice: reading patient records falling back to memory:", err);
  }

  return createEmptyPatientRecord(userId);
}

export function updatePatientRecord(userId: string, updates: PatientRecordUpdate): PatientRecord {
  const current = inMemoryPatientRecords[userId] || getPatientRecord(userId);
  const record: PatientRecord = {
    ...current,
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };

  inMemoryPatientRecords[userId] = record;

  try {
    const patientFile = getStoreFilePath("patient-records.json");
    let records: Record<string, PatientRecord> = {};
    if (fs.existsSync(patientFile)) {
      try {
        records = JSON.parse(fs.readFileSync(patientFile, "utf-8"));
      } catch {
        records = {};
      }
    }
    records[userId] = record;
    fs.writeFileSync(patientFile, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.warn("Notice: patient record file write fallback to memory:", err);
  }

  return record;
}

const ISI_STORE_FILE = getStoreFilePath("isi-records.json");

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
