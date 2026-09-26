import type { PersonalBaseline } from "./types";
import type { PatientRecord } from "@/lib/patient-record";

export const DEFAULT_BASELINE: PersonalBaseline = {
  restingHR: 68,
  hrv: 52,
  spo2: 97,
  pulseMorphology: 0.85,
  ecgAmplitude: 0.80,
  isi: 32,
};

export interface GoogleFitVitalsInput {
  restingHeartRate?: number;
  currentHeartRate?: number;
  bloodPressure?: {
    systolic?: number;
    diastolic?: number;
    category?: string;
  };
  spo2?: {
    current?: number;
    average?: number;
  };
  heartPoints?: number;
}

/**
 * Derives a PersonalBaseline from a saved PatientRecord (health-record form data)
 * and optional synced Google Fit vitals.
 *
 * For a healthy individual with no cardiac disease and normal vitals,
 * the baseline ISI settles in the healthy range (18-35, strictly < 45).
 *
 * Every change in:
 *   - Google Fit synced vitals (HR, BP, SpO2, Heart Points, Workouts)
 *   - Entered ECG values (text: ST elevation/arrhythmia/normal, or numeric voltage/ST mV)
 *   - Entered PPG values (text: weak pulse/normal, or numeric pulse amplitude)
 *   - Entered Vitals (Resting HR, Systolic/Diastolic BP, SpO2)
 *   - Lifestyle and cardiovascular history
 * directly recalibrates the personal ISI baseline and live screening score.
 */
export function deriveBaselineFromHealthRecord(
  record: PatientRecord,
  googleFitVitals?: GoogleFitVitalsInput | null
): PersonalBaseline {
  let isiBase = 32;

  // ── 1. Blood Pressure (Manual entry or Google Fit) ──────────────────────
  const systolic = record.systolicBP ?? googleFitVitals?.bloodPressure?.systolic ?? null;
  const diastolic = record.diastolicBP ?? googleFitVitals?.bloodPressure?.diastolic ?? null;
  const bpCategory = record.bloodPressureCategory || googleFitVitals?.bloodPressure?.category || "";

  if (systolic !== null && diastolic !== null) {
    if (systolic >= 180 || diastolic >= 120) {
      isiBase += 24; // Hypertensive crisis
    } else if (systolic >= 160 || diastolic >= 100) {
      isiBase += 18; // High Stage 2 severe
    } else if (systolic >= 140 || diastolic >= 90) {
      isiBase += 12; // High Stage 2
    } else if (systolic >= 130 || diastolic >= 80) {
      isiBase += 7;  // High Stage 1
    } else if (systolic >= 120 && diastolic < 80) {
      isiBase += 3;  // Elevated
    } else if (systolic <= 118 && diastolic <= 78) {
      isiBase -= 2;  // Optimal healthy BP
    }
  } else if (bpCategory) {
    switch (bpCategory) {
      case "elevated":      isiBase += 5;  break;
      case "high_stage_1":  isiBase += 10; break;
      case "high_stage_2":  isiBase += 18; break;
      case "normal":        isiBase -= 2;  break;
    }
  }

  // ── 2. Resting Heart Rate (Manual entry or Google Fit) ───────────────────
  const rawRestingHR = record.restingHeartRate ?? googleFitVitals?.restingHeartRate ?? googleFitVitals?.currentHeartRate ?? null;
  const restingHR = rawRestingHR !== null
    ? Math.max(38, Math.min(180, rawRestingHR))
    : DEFAULT_BASELINE.restingHR;

  if (rawRestingHR !== null) {
    if (restingHR >= 115) {
      isiBase += 15; // Severe tachycardia / metabolic strain
    } else if (restingHR >= 100) {
      isiBase += 10; // Clinical tachycardia
    } else if (restingHR >= 85) {
      isiBase += 5;  // Elevated resting heart rate
    } else if (restingHR >= 76) {
      isiBase += 2;  // Sub-optimal resting HR
    } else if (restingHR <= 58) {
      isiBase -= 3;  // Athletic conditioned bradycardia (protective)
    }
  }

  // ── 3. SpO2 Blood Oxygen (Manual entry or Google Fit) ───────────────────
  const rawSpo2 = record.spo2 ?? googleFitVitals?.spo2?.current ?? null;
  const spo2 = rawSpo2 !== null
    ? Math.max(70, Math.min(100, Math.round(rawSpo2)))
    : DEFAULT_BASELINE.spo2;

  if (rawSpo2 !== null) {
    if (spo2 < 90) {
      isiBase += 20; // Severe hypoxemia
    } else if (spo2 < 93) {
      isiBase += 14; // Moderate hypoxemia
    } else if (spo2 < 95) {
      isiBase += 6;  // Mild arterial desaturation
    } else if (spo2 >= 98) {
      isiBase -= 2;  // Optimal arterial oxygen saturation
    }
  }

  // ── 4. ECG Value (Text keywords & numeric ST / R-wave parsing) ───────────
  let parsedEcgAmp = DEFAULT_BASELINE.ecgAmplitude ?? 0.80;
  if (record.ecgValue && record.ecgValue.trim() !== "") {
    const ecgStr = record.ecgValue.toLowerCase().trim();

    // Clinical text patterns
    if (/st[\s_-]?elevat|stemi|infarct|acute[\s_-]?injury/i.test(ecgStr)) {
      isiBase += 24; // Major acute ischemic finding
    } else if (/st[\s_-]?depress|nstemi|ischem|subendocardial/i.test(ecgStr)) {
      isiBase += 18; // Myocardial ischemia / strain
    } else if (/t[\s_-]?(wave)?[\s_-]?inver|biphasic[\s_-]?t|hyperacute[\s_-]?t/i.test(ecgStr)) {
      isiBase += 14; // Ventricular repolarization abnormality
    } else if (/arrhythm|afib|atrial[\s_-]?fib|flutter|pvc|ventricular[\s_-]?tachy/i.test(ecgStr)) {
      isiBase += 12; // Cardiac arrhythmia
    } else if (/lbbb|rbbb|bundle[\s_-]?branch|conduction[\s_-]?delay|wide[\s_-]?qrs/i.test(ecgStr)) {
      isiBase += 10; // Intraventricular conduction delay
    } else if (/hypertroph|lvh|strain|pathologic[\s_-]?q/i.test(ecgStr)) {
      isiBase += 8;  // Ventricular hypertrophy / prior scar
    } else if (/normal|nsr|normal[\s_-]?sinus|clean|healthy|unremarkable/i.test(ecgStr)) {
      isiBase -= 4;  // Normal electrical axis and rhythm (protective)
    }

    // Numeric parsing for voltage / ST shift (e.g. "0.8 mV", "0.2 mV ST", "1.6 mV")
    const match = ecgStr.match(/[-+]?[0-9]*\.?[0-9]+/);
    if (match) {
      const num = parseFloat(match[0]);
      if (!isNaN(num)) {
        if (/st/i.test(ecgStr)) {
          if (num >= 0.1) {
            isiBase += Math.min(25, Math.round(num * 90));
          } else if (num <= -0.05) {
            isiBase += Math.min(22, Math.round(Math.abs(num) * 80));
          }
        } else {
          parsedEcgAmp = Math.max(0.1, Math.min(3.0, num));
          if (num >= 2.0) {
            isiBase += 8; // High QRS amplitude / LVH
          } else if (num <= 0.4) {
            isiBase += 7; // Low QRS voltage
          } else if (num >= 0.7 && num <= 1.3) {
            isiBase -= 2; // Optimal diagnostic QRS voltage
          }
        }
      }
    }
  }

  // ── 5. PPG Value (Text descriptors & numeric pulse amplitude) ───────────
  let parsedPpgAmp = DEFAULT_BASELINE.pulseMorphology;
  if (record.ppgValue && record.ppgValue.trim() !== "") {
    const ppgStr = record.ppgValue.toLowerCase().trim();

    // Clinical text patterns
    if (/weak|dampen|flat|poor[\s_-]?perfusion|diminish|attenuat|low[\s_-]?amp/i.test(ppgStr)) {
      isiBase += 14; // Impaired peripheral microvascular perfusion
    } else if (/blunt|stiff|loss[\s_-]?of[\s_-]?notch|dicrotic[\s_-]?absent/i.test(ppgStr)) {
      isiBase += 8;  // Loss of arterial compliance / dicrotic notch
    } else if (/irregular|variable[\s_-]?amp|pulsus[\s_-]?alternans/i.test(ppgStr)) {
      isiBase += 10; // Hemodynamic / pulse irregularity
    } else if (/normal|strong|good[\s_-]?pulse|optimal|triphasic|crisp/i.test(ppgStr)) {
      isiBase -= 4;  // Healthy peripheral pulse morphology (protective)
    }

    // Numeric parsing for amplitude / perfusion index (e.g. "0.6", "0.28", "0.85")
    const match = ppgStr.match(/[0-9]*\.?[0-9]+/);
    if (match) {
      const num = parseFloat(match[0]);
      if (!isNaN(num) && num > 0) {
        parsedPpgAmp = Math.max(0.15, Math.min(1.8, num));
        if (num < 0.35) {
          isiBase += 14; // Severe hypoperfusion
        } else if (num < 0.50) {
          isiBase += 8;  // Diminished pulse amplitude
        } else if (num >= 0.65 && num <= 0.95) {
          isiBase -= 3;  // Optimal peripheral compliance
        } else if (num > 1.5) {
          isiBase += 5;  // Bounding pulse
        }
      }
    }
  }

  // ── 6. Smoking ──────────────────────────────────────────────────────────
  switch (record.smokingStatus) {
    case "former":  isiBase += 3; break;
    case "current": isiBase += 8; break;
  }

  // ── 7. Diabetes ─────────────────────────────────────────────────────────
  switch (record.diabetesStatus) {
    case "pre_diabetic": isiBase += 4;  break;
    case "type_1":       isiBase += 8;  break;
    case "type_2":       isiBase += 10; break;
  }

  // ── 8. Cholesterol ──────────────────────────────────────────────────────
  switch (record.cholesterolStatus) {
    case "borderline": isiBase += 3; break;
    case "high":       isiBase += 8; break;
  }

  // ── 9. Stress level ─────────────────────────────────────────────────────
  switch (record.stressLevel) {
    case "moderate":  isiBase += 3; break;
    case "high":      isiBase += 6; break;
    case "very_high": isiBase += 9; break;
  }

  // ── 10. Exercise & Activity (Protective) ─────────────────────────────────
  switch (record.exerciseFrequency) {
    case "active":   isiBase -= 8; break;
    case "moderate": isiBase -= 4; break;
    case "light":    isiBase -= 1; break;
    // "sedentary" → no protection
  }

  // Google Fit Heart Points bonus protection if >= 150 points weekly
  if (googleFitVitals?.heartPoints && googleFitVitals.heartPoints >= 150) {
    isiBase -= 2;
  }

  // ── 11. Family / Personal Cardiac History ────────────────────────────────
  if (record.familyHeartAttack)   isiBase += 4;
  if (record.priorHeartAttack)    isiBase += 10;
  if (record.priorAngina)         isiBase += 7;
  if (record.chestPainHistory)    isiBase += 5;
  if (record.shortnessOfBreath)   isiBase += 3;
  if (record.familyHypertension)  isiBase += 2;
  if (record.familyDiabetes)      isiBase += 2;

  // ── 12. Clamping to Valid Screening Range ────────────────────────────────
  const clampedIsi = Math.max(15, Math.min(95, Math.round(isiBase)));

  // ── 13. HRV (approximate from HR: lower HR ≈ higher HRV) ──────────────────
  const hrv = Math.max(15, Math.min(85, Math.round(72 - (restingHR - 60) * 0.65)));

  return {
    restingHR,
    hrv,
    spo2,
    pulseMorphology: parsedPpgAmp,
    ecgAmplitude: parsedEcgAmp,
    isi: clampedIsi,
  };
}

export function calculateBaselineDeviation(
  current: number,
  baseline: number
): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

export function getRollingBaseline(
  values: number[],
  windowSize: number = 20
): number {
  if (values.length === 0) return 0;
  const window = values.slice(-windowSize);
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

export function normalizeAgainstBaseline(
  current: number,
  baseline: number,
  sensitivity: number = 1
): number {
  const deviation = (current - baseline) / baseline;
  return Math.max(0, Math.min(1, 0.5 + deviation * sensitivity));
}

export function updateBaseline(
  current: PersonalBaseline,
  newValues: Partial<PersonalBaseline>,
  alpha: number = 0.05
): PersonalBaseline {
  return {
    restingHR: newValues.restingHR
      ? current.restingHR * (1 - alpha) + newValues.restingHR * alpha
      : current.restingHR,
    hrv: newValues.hrv
      ? current.hrv * (1 - alpha) + newValues.hrv * alpha
      : current.hrv,
    spo2: newValues.spo2
      ? current.spo2 * (1 - alpha) + newValues.spo2 * alpha
      : current.spo2,
    pulseMorphology: newValues.pulseMorphology
      ? current.pulseMorphology * (1 - alpha) + newValues.pulseMorphology * alpha
      : current.pulseMorphology,
    isi: newValues.isi
      ? current.isi * (1 - alpha) + newValues.isi * alpha
      : current.isi,
  };
}
