import assert from "node:assert";
import { calculateISI } from "../src/lib/isi/scoring";
import { extractFeatures } from "../src/lib/isi/features";
import { DEFAULT_BASELINE } from "../src/lib/isi/baseline";
import type { PersonalBaseline, PhysiologicalSample, DemoScenario } from "../src/lib/isi/types";
import { getUserISIScore, saveUserISIScore } from "../src/lib/db/store";

console.log("=================================================");
console.log("BeatAhead Comprehensive ISI & Persistence Tests");
console.log("=================================================\n");

const baseline: PersonalBaseline = {
  ...DEFAULT_BASELINE,
  restingHR: 68,
  hrv: 50,
  spo2: 98,
  isi: 28,
};

function runPipeline(
  sample: PhysiologicalSample,
  base: PersonalBaseline,
  scenario: DemoScenario
) {
  const features = extractFeatures(sample, null, scenario, base);
  return calculateISI({
    features,
    baseline: base,
    historicalScores: [],
    scenario,
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
  });
}

// -----------------------------------------------------------------
// Test Suite 1: Risk Ordering (Normal < Elevated Risk < Severe Risk)
// -----------------------------------------------------------------
console.log("Test Suite 1: Risk Ordering & Calibration Scenarios");

const normalSample: PhysiologicalSample = {
  timestamp: Date.now(),
  heartRate: 68,
  hrv: 52,
  spo2: 98,
  ppg: 0.85,
  ecg: 0.05,
  imu: 0.02,
  signalQuality: { ecg: 0.95, ppg: 0.95, spo2: 0.95, imu: 0.95, overall: 0.95 },
};

const elevatedSample: PhysiologicalSample = {
  timestamp: Date.now(),
  heartRate: 92,
  hrv: 30,
  spo2: 93,
  ppg: 0.65,
  ecg: 0.35,
  imu: 0.05,
  signalQuality: { ecg: 0.92, ppg: 0.92, spo2: 0.92, imu: 0.92, overall: 0.92 },
};

const severeSample: PhysiologicalSample = {
  timestamp: Date.now(),
  heartRate: 112,
  hrv: 16,
  spo2: 87,
  ppg: 0.40,
  ecg: 0.85,
  imu: 0.04,
  signalQuality: { ecg: 0.90, ppg: 0.90, spo2: 0.90, imu: 0.90, overall: 0.90 },
};

const normalRes = runPipeline(normalSample, baseline, "normal");
const elevatedRes = runPipeline(elevatedSample, baseline, "elevated_risk");
const severeRes = runPipeline(severeSample, baseline, "severe_risk");

console.log(`- Normal Scenario Score:    ${normalRes.score} [${normalRes.label}]`);
console.log(`- Elevated Risk Score:      ${elevatedRes.score} [${elevatedRes.label}]`);
console.log(`- Severe Risk Score:        ${severeRes.score} [${severeRes.label}]`);

assert(
  normalRes.score < elevatedRes.score,
  `Expected normalRes (${normalRes.score}) < elevatedRes (${elevatedRes.score})`
);
assert(
  elevatedRes.score < severeRes.score,
  `Expected elevatedRes (${elevatedRes.score}) < severeRes (${severeRes.score})`
);
assert(
  normalRes.score >= 0 && normalRes.score <= 100,
  `Normal score ${normalRes.score} outside 0-100 range`
);
assert(
  severeRes.score >= 0 && severeRes.score <= 100,
  `Severe score ${severeRes.score} outside 0-100 range`
);
console.log("✓ Strict monotonic ordering verified: Normal < Elevated < Severe.\n");

// -----------------------------------------------------------------
// Test Suite 2: Repeated Evaluation Determinism
// -----------------------------------------------------------------
console.log("Test Suite 2: Repeated Evaluation Determinism");

const runs = 10;
const firstScore = runPipeline(elevatedSample, baseline, "elevated_risk").score;

for (let i = 0; i < runs; i++) {
  const score = runPipeline(elevatedSample, baseline, "elevated_risk").score;
  assert.strictEqual(
    score,
    firstScore,
    `Run ${i + 1} produced ${score}, expected deterministic ${firstScore}`
  );
}
console.log(`✓ 10 repeated evaluations produced identical score (${firstScore}).\n`);

// -----------------------------------------------------------------
// Test Suite 3: Missing Data & Signal Quality Handling
// -----------------------------------------------------------------
console.log("Test Suite 3: Missing Data & Signal Quality Handling");

// Case A: Missing SpO2
const sampleMissingSpO2: PhysiologicalSample = {
  ...normalSample,
  spo2: undefined as unknown as number,
};
const resMissingSpO2 = runPipeline(sampleMissingSpO2, baseline, "normal");
console.log(`- Missing SpO2 Score:       ${resMissingSpO2.score} [${resMissingSpO2.label}]`);
assert(
  !isNaN(resMissingSpO2.score),
  "Missing SpO2 must not produce NaN"
);
assert(
  resMissingSpO2.score < 50,
  `Missing SpO2 should not falsely generate high risk alarm (got ${resMissingSpO2.score})`
);

// Case B: Poor Signal Quality (SQI < 0.35)
const poorQualitySample: PhysiologicalSample = {
  ...normalSample,
  signalQuality: { ecg: 0.15, ppg: 0.15, spo2: 0.15, imu: 0.15, overall: 0.20 },
};
const resPoorQuality = runPipeline(poorQualitySample, baseline, "normal");
console.log(`- Poor Signal Quality:      ${resPoorQuality.score} [${resPoorQuality.state}] label: "${resPoorQuality.label}"`);
assert.strictEqual(
  resPoorQuality.state,
  "Insufficient Signal Quality",
  `Expected "Insufficient Signal Quality", got "${resPoorQuality.state}"`
);
assert.strictEqual(
  resPoorQuality.label,
  "Insufficient Signal Quality",
  `Expected label "Insufficient Signal Quality", got "${resPoorQuality.label}"`
);

// Case C: Motion Artifact Impact on Confidence & Feature Detection
const motionSample: PhysiologicalSample = {
  ...normalSample,
  imu: 0.85,
};
const resMotion = runPipeline(motionSample, baseline, "motion_artifact");
console.log(`- Motion Artifact:          ${resMotion.score} confidence: ${resMotion.confidence}% (penalized from normal: ${normalRes.confidence}%)`);
assert(
  resMotion.confidence < normalRes.confidence,
  `Motion artifact must penalize confidence (motion: ${resMotion.confidence}%, normal: ${normalRes.confidence}%)`
);

console.log("✓ Missing data and degraded signals correctly handled without false alarms.\n");

// -----------------------------------------------------------------
// Test Suite 4: User Persistence Isolation & Cross-Device Consistency
// -----------------------------------------------------------------
console.log("Test Suite 4: User Persistence Isolation & Consistency");

const userA = "laptop_user_A_" + Date.now();
const userB = "laptop_user_B_" + Date.now();

const userARecord = {
  userId: userA,
  currentScore: { ...normalRes, score: 32 },
  scenario: "normal" as const,
  baseline: { ...baseline },
  currentSample: { ...normalSample },
  history: [normalRes],
  updatedAt: new Date().toISOString(),
};

const userBRecord = {
  userId: userB,
  currentScore: { ...elevatedRes, score: 68 },
  scenario: "elevated_risk" as const,
  baseline: { ...baseline, restingHR: 85 },
  currentSample: { ...elevatedSample },
  history: [elevatedRes],
  updatedAt: new Date().toISOString(),
};

// Save records to shared persistent store
saveUserISIScore(userA, userARecord);
saveUserISIScore(userB, userBRecord);

// Retrieve records (simulating Laptop A and Laptop B logins)
const retrievedA1 = getUserISIScore(userA);
const retrievedA2 = getUserISIScore(userA); // simulated Laptop B login for User A
const retrievedB = getUserISIScore(userB);

assert(retrievedA1 !== null, "User A record must exist in store");
assert(retrievedB !== null, "User B record must exist in store");

// Cross-device consistency: Laptop A and Laptop B get the exact same score for User A
assert.strictEqual(
  retrievedA1?.currentScore.score,
  retrievedA2?.currentScore.score,
  "User A must receive identical score on Laptop A and Laptop B"
);
assert.strictEqual(
  retrievedA1?.currentScore.score,
  32,
  "User A score must match persisted 32"
);

// User Isolation: User B's data is distinct from User A
assert.strictEqual(
  retrievedB?.currentScore.score,
  68,
  "User B score must match persisted 68"
);
assert.notStrictEqual(
  retrievedA1?.currentScore.score,
  retrievedB?.currentScore.score,
  "User A and User B must not share scores"
);
assert.notStrictEqual(
  retrievedA1?.baseline.restingHR,
  retrievedB?.baseline.restingHR,
  "User A and User B must not share baseline vitals"
);

console.log("✓ Cross-device consistency & user data isolation verified.\n");
console.log("=================================================");
console.log("ALL AUTOMATED TESTS PASSED SUCCESSFULLY!");
console.log("=================================================");
