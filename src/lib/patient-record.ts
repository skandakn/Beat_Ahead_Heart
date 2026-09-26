export const BIOLOGICAL_SEX_OPTIONS = [
  "female",
  "male",
  "intersex",
  "prefer_not_to_say",
] as const;

export type BiologicalSex = (typeof BIOLOGICAL_SEX_OPTIONS)[number] | "";

export const SMOKING_STATUS_OPTIONS = ["never", "former", "current"] as const;
export type SmokingStatus = (typeof SMOKING_STATUS_OPTIONS)[number] | "";

export const ALCOHOL_USE_OPTIONS = ["none", "occasional", "moderate", "heavy"] as const;
export type AlcoholUse = (typeof ALCOHOL_USE_OPTIONS)[number] | "";

export const EXERCISE_FREQUENCY_OPTIONS = ["sedentary", "light", "moderate", "active"] as const;
export type ExerciseFrequency = (typeof EXERCISE_FREQUENCY_OPTIONS)[number] | "";

export const STRESS_LEVEL_OPTIONS = ["low", "moderate", "high", "very_high"] as const;
export type StressLevel = (typeof STRESS_LEVEL_OPTIONS)[number] | "";

export const DIET_TYPE_OPTIONS = ["omnivore", "vegetarian", "vegan", "pescatarian", "other"] as const;
export type DietType = (typeof DIET_TYPE_OPTIONS)[number] | "";

export const BLOOD_PRESSURE_OPTIONS = ["normal", "elevated", "high_stage_1", "high_stage_2", "unknown"] as const;
export type BloodPressureCategory = (typeof BLOOD_PRESSURE_OPTIONS)[number] | "";

export const DIABETES_STATUS_OPTIONS = ["no", "pre_diabetic", "type_1", "type_2", "unknown"] as const;
export type DiabetesStatus = (typeof DIABETES_STATUS_OPTIONS)[number] | "";

export const CHOLESTEROL_STATUS_OPTIONS = ["normal", "borderline", "high", "unknown"] as const;
export type CholesterolStatus = (typeof CHOLESTEROL_STATUS_OPTIONS)[number] | "";

export interface DailyVitalsEntry {
  date: string;
  systolicBP: number | null;
  diastolicBP: number | null;
  restingHeartRate: number | null;
  ecgValue: string;
  ppgValue: string;
  bloodPressureCategory: BloodPressureCategory;
}

export interface PatientRecord {
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Personal
  dateOfBirth: string;
  biologicalSex: BiologicalSex;
  heightCm: number | null;
  weightKg: number | null;
  // Lifestyle
  smokingStatus: SmokingStatus;
  alcoholUse: AlcoholUse;
  exerciseFrequency: ExerciseFrequency;
  stressLevel: StressLevel;
  dietType: DietType;
  // Vitals
  systolicBP: number | null;
  diastolicBP: number | null;
  restingHeartRate: number | null;
  spo2: number | null;
  ecgValue: string;
  ppgValue: string;
  bloodPressureCategory: BloodPressureCategory;
  vitalsHistory: DailyVitalsEntry[];
  cholesterolStatus: CholesterolStatus;
  // Medical history
  conditions: string[];
  medications: string[];
  allergies: string[];
  diabetesStatus: DiabetesStatus;
  chestPainHistory: boolean;
  shortnessOfBreath: boolean;
  priorHeartAttack: boolean;
  priorStroke: boolean;
  priorAngina: boolean;
  // Family history
  familyHeartAttack: boolean;
  familyDiabetes: boolean;
  familyHypertension: boolean;
  familyHighCholesterol: boolean;
  familyHistory: string;
  // Care contacts
  emergencyContactName: string;
  emergencyContactPhone: string;
  primaryCarePhysician: string;
  notes: string;
}

export type PatientRecordUpdate = Omit<PatientRecord, "userId" | "createdAt" | "updatedAt">;

const MAX_LIST_ITEMS = 30;
const MAX_LIST_ITEM_LENGTH = 120;
const MAX_TEXT_LENGTH = 2_000;

export function createEmptyPatientRecord(userId: string, timestamp = new Date().toISOString()): PatientRecord {
  return {
    userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    dateOfBirth: "",
    biologicalSex: "",
    heightCm: null,
    weightKg: null,
    smokingStatus: "",
    alcoholUse: "",
    exerciseFrequency: "",
    stressLevel: "",
    dietType: "",
    systolicBP: null,
    diastolicBP: null,
    restingHeartRate: null,
    spo2: null,
    ecgValue: "",
    ppgValue: "",
    bloodPressureCategory: "",
    vitalsHistory: [],
    cholesterolStatus: "",
    conditions: [],
    medications: [],
    allergies: [],
    diabetesStatus: "",
    chestPainHistory: false,
    shortnessOfBreath: false,
    priorHeartAttack: false,
    priorStroke: false,
    priorAngina: false,
    familyHeartAttack: false,
    familyDiabetes: false,
    familyHypertension: false,
    familyHighCholesterol: false,
    familyHistory: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    primaryCarePhysician: "",
    notes: "",
  };
}

function optionalText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw new Error(`${field} must contain no more than ${MAX_LIST_ITEMS} entries.`);
  }
  return value.map((item) => optionalText(item, field, MAX_LIST_ITEM_LENGTH)).filter(Boolean);
}

function optionalMeasurement(value: unknown, field: string, min = 1, max = 500): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`${field} must be a valid positive number.`);
  }
  return value;
}

function optionalBool(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return Boolean(value);
}

function optionalEnum<T extends string>(value: unknown, field: string, options: readonly T[]): T | "" {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const trimmed = value.trim() as T;
  if (!options.includes(trimmed)) throw new Error(`${field} is invalid.`);
  return trimmed;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function upsertDailyVitalsEntry(
  history: DailyVitalsEntry[] | undefined,
  entry: DailyVitalsEntry
): DailyVitalsEntry[] {
  return [...(history ?? []).filter((item) => item.date !== entry.date), entry]
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dailyVitalsHistory(value: unknown): DailyVitalsEntry[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error("Vitals history must contain no more than 10,000 daily entries.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Vitals entry ${index + 1} is invalid.`);
    }
    const input = item as Record<string, unknown>;
    const date = optionalText(input.date, "Vitals date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error("Vitals dates must use a valid YYYY-MM-DD date.");
    }
    return {
      date,
      systolicBP: optionalMeasurement(input.systolicBP, "Systolic BP", 1, 300),
      diastolicBP: optionalMeasurement(input.diastolicBP, "Diastolic BP", 1, 200),
      restingHeartRate: optionalMeasurement(input.restingHeartRate, "Resting heart rate", 1, 300),
      ecgValue: optionalText(input.ecgValue, "ECG value", 120),
      ppgValue: optionalText(input.ppgValue, "PPG value", 120),
      bloodPressureCategory: optionalEnum(input.bloodPressureCategory, "Blood pressure", BLOOD_PRESSURE_OPTIONS),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function validatePatientRecordUpdate(value: unknown): PatientRecordUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A patient record object is required.");
  }
  const input = value as Record<string, unknown>;
  const dateOfBirth = optionalText(input.dateOfBirth, "Date of birth", 10);
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error("Date of birth must use YYYY-MM-DD.");
  }
  const biologicalSex = optionalEnum(input.biologicalSex, "Biological sex", BIOLOGICAL_SEX_OPTIONS);

  return {
    dateOfBirth,
    biologicalSex,
    heightCm: optionalMeasurement(input.heightCm, "Height", 1, 300),
    weightKg: optionalMeasurement(input.weightKg, "Weight", 1, 500),
    smokingStatus: optionalEnum(input.smokingStatus, "Smoking status", SMOKING_STATUS_OPTIONS),
    alcoholUse: optionalEnum(input.alcoholUse, "Alcohol use", ALCOHOL_USE_OPTIONS),
    exerciseFrequency: optionalEnum(input.exerciseFrequency, "Exercise frequency", EXERCISE_FREQUENCY_OPTIONS),
    stressLevel: optionalEnum(input.stressLevel, "Stress level", STRESS_LEVEL_OPTIONS),
    dietType: optionalEnum(input.dietType, "Diet type", DIET_TYPE_OPTIONS),
    systolicBP: optionalMeasurement(input.systolicBP, "Systolic BP", 1, 300),
    diastolicBP: optionalMeasurement(input.diastolicBP, "Diastolic BP", 1, 200),
    restingHeartRate: optionalMeasurement(input.restingHeartRate, "Resting heart rate", 1, 300),
    spo2: optionalMeasurement(input.spo2, "SpO2", 50, 100),
    ecgValue: optionalText(input.ecgValue, "ECG value", 120),
    ppgValue: optionalText(input.ppgValue, "PPG value", 120),
    bloodPressureCategory: optionalEnum(input.bloodPressureCategory, "Blood pressure", BLOOD_PRESSURE_OPTIONS),
    vitalsHistory: dailyVitalsHistory(input.vitalsHistory),
    cholesterolStatus: optionalEnum(input.cholesterolStatus, "Cholesterol status", CHOLESTEROL_STATUS_OPTIONS),
    conditions: stringList(input.conditions, "Conditions"),
    medications: stringList(input.medications, "Medications"),
    allergies: stringList(input.allergies, "Allergies"),
    diabetesStatus: optionalEnum(input.diabetesStatus, "Diabetes status", DIABETES_STATUS_OPTIONS),
    chestPainHistory: optionalBool(input.chestPainHistory),
    shortnessOfBreath: optionalBool(input.shortnessOfBreath),
    priorHeartAttack: optionalBool(input.priorHeartAttack),
    priorStroke: optionalBool(input.priorStroke),
    priorAngina: optionalBool(input.priorAngina),
    familyHeartAttack: optionalBool(input.familyHeartAttack),
    familyDiabetes: optionalBool(input.familyDiabetes),
    familyHypertension: optionalBool(input.familyHypertension),
    familyHighCholesterol: optionalBool(input.familyHighCholesterol),
    familyHistory: optionalText(input.familyHistory, "Family history"),
    emergencyContactName: optionalText(input.emergencyContactName, "Emergency contact name", 120),
    emergencyContactPhone: optionalText(input.emergencyContactPhone, "Emergency contact phone", 50),
    primaryCarePhysician: optionalText(input.primaryCarePhysician, "Primary care physician", 120),
    notes: optionalText(input.notes, "Notes"),
  };
}

export function isSafePatientRecordUserId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !["__proto__", "constructor", "prototype"].includes(value);
}
