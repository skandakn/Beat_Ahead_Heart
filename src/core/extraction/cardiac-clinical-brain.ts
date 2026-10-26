import { LLMResponse, LLMGenerateOptions } from "../types/providers";
import { extractCardiacFindings } from "./deterministic-extractor";

export function generateEmergencyCardiacFallback(
  userText: string,
  options?: LLMGenerateOptions
): LLMResponse {
  const lower = (userText || "").toLowerCase();
  const findings = extractCardiacFindings(userText);

  // 1. Critical Red Flag Emergency
  if (
    findings.urgency_level?.value === "CRITICAL_EMERGENCY" ||
    /\b(chest pain|chest pressure|heart attack|crushing|cannot breathe|radiat|passing out)\b/i.test(lower)
  ) {
    const hasAspirinMention = /\baspirin\b/i.test(lower);
    const painScale = findings.pain_severity_scale?.value;

    let response = "Please sit down immediately with your knees bent to relieve strain on your heart. ";
    if (!hasAspirinMention) {
      response += "If you are not allergic and have no active stomach bleeding, chew one 325 mg adult aspirin now. ";
    }
    response += "We recommend calling emergency services (112 or local EMS) right away. Do not attempt to drive yourself. Are you alone, or is someone with you?";

    return {
      text: response,
      toolCalls: [
        {
          id: `tool_${Date.now()}_urgency`,
          name: "assess_cardiac_urgency",
          arguments: {
            chest_pressure: true,
            radiating_pain: /\bradiat\b/i.test(lower),
            diaphoresis: /\bsweat\b/i.test(lower),
            pain_scale: typeof painScale === "number" ? painScale : 8,
          },
        },
      ],
    };
  }

  // 2. High Risk / Breathlessness / Palpitations
  if (
    findings.urgency_level?.value === "HIGH_RISK_URGENT" ||
    /\b(shortness of breath|breathless|palpitation|racing heart|fluttering)\b/i.test(lower)
  ) {
    return {
      text: "I hear that you are experiencing noticeable breathing difficulty or racing pulse. Please sit down comfortably, loosen any tight clothing around your neck or chest, and take slow, steady breaths. If this started suddenly or worsens, please have someone take you to urgent care or call emergency services.",
      toolCalls: [
        {
          id: `tool_${Date.now()}_urgency`,
          name: "assess_cardiac_urgency",
          arguments: {
            chest_pressure: false,
            radiating_pain: false,
            pain_scale: 5,
          },
        },
      ],
    };
  }

  // 3. Questions about Ischemic Stress Index (ISI)
  if (/\b(isi|ischemic stress|score|biomarker|wearable|smartwatch)\b/i.test(lower)) {
    return {
      text: "The Ischemic Stress Index (ISI) integrates your HRV autonomic entropy, pulse wave morphological delays, and ST-segment trends into a 0 to 100 risk score. Scores above 65 indicate elevated ischemic strain and warrant a formal consultation with a cardiologist.",
      toolCalls: [
        {
          id: `tool_${Date.now()}_isi`,
          name: "retrieve_patient_isi_baseline",
          arguments: { patient_id: "current" },
        },
      ],
    };
  }

  // 4. Inquiries about doctor or human specialist
  if (/\b(doctor|cardiologist|human|specialist|hospital|clinic)\b/i.test(lower)) {
    return {
      text: "I can connect you with an expedited tele-cardiology consultation or our RapidCare emergency network. Would you like me to initiate an emergency telehealth alert or direct you to the nearest cardiac center?",
    };
  }

  // 5. First aid and medication guidance
  if (/\b(aspirin|nitroglycerin|first aid|what should i do|help)\b/i.test(lower)) {
    return {
      text: "For suspected cardiac symptoms: 1) Sit upright with knees bent. 2) Chew one unbuffered 325 mg aspirin if not allergic. 3) If prescribed sublingual nitroglycerin, take one dose under your tongue while seated. 4) Unlock your door and summon emergency assistance.",
    };
  }

  // 6. General / Wellness / Greetings
  if (/\b(hello|hi|hey|good morning|good evening)\b/i.test(lower)) {
    return {
      text: "Hello! This is the BeatAhead 24/7 AI Cardiac Care Helpline. I am here to assist with cardiac symptom triage, Ischemic Stress Index questions, and heart wellness. How are you feeling right now?",
    };
  }

  return {
    text: "I have recorded your symptom details. For any sudden chest pressure, radiating discomfort, or acute breathlessness, seek immediate medical care. Could you tell me how many minutes ago this sensation started, or rate any discomfort from 1 to 10?",
  };
}
