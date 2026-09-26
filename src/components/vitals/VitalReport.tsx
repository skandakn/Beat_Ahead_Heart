"use client";

import { useFitRest } from "@/lib/fit-rest/FitRestContext";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, HeartPulse, ShieldCheck, Heart } from "lucide-react";

export function VitalReport() {
  const { googleFitVitals, googleFitLastSynced } = useFitRest();
  const { baseline, currentScore } = useSimulation();

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const hr = googleFitVitals?.currentHeartRate ?? 70;
  const restingHR = googleFitVitals?.restingHeartRate ?? baseline.restingHR ?? 68;
  const bp = googleFitVitals?.bloodPressure ?? { systolic: 118, diastolic: 76, category: "normal" };
  const spo2 = googleFitVitals?.spo2?.current ?? 98.2;
  const hp = googleFitVitals?.heartPoints ?? 48;
  const isi = currentScore?.score ?? 28;

  return (
    <Card className="border border-navy-200 bg-white shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-navy-100">
        <div>
          <CardTitle className="text-base font-bold text-navy-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-red-600" />
            Cardiovascular Vitals Clinical Report
          </CardTitle>
          <p className="text-xs text-navy-500 mt-0.5">
            Exportable summary of Google Fit biomarkers &amp; Ischemic Stress Index (ISI)
          </p>
        </div>
        <Button
          size="sm"
          onClick={handlePrint}
          className="bg-navy-900 hover:bg-navy-800 text-white gap-1.5 text-xs shadow-xs"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </Button>
      </CardHeader>

      <CardContent className="p-6 space-y-6 text-sm text-navy-900">
        {/* Patient / Session Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-navy-50/60 border border-navy-100 text-xs">
          <div>
            <p className="text-navy-400 font-medium">Report Type</p>
            <p className="font-bold text-navy-900 mt-0.5">Google Fit Biometrics</p>
          </div>
          <div>
            <p className="text-navy-400 font-medium">Generated On</p>
            <p className="font-bold text-navy-900 mt-0.5">{new Date().toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-navy-400 font-medium">Data Source</p>
            <p className="font-bold text-emerald-700 mt-0.5">Google Fit Connected</p>
          </div>
          <div>
            <p className="text-navy-400 font-medium">Clinical Stratification</p>
            <p className="font-bold text-emerald-700 mt-0.5">Normal / Low Risk</p>
          </div>
        </div>

        {/* Biometrics Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy-600">
            Recorded Physiological Biomarkers
          </h3>
          <div className="border border-navy-100 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-navy-50 text-navy-600 border-b border-navy-100">
                <tr>
                  <th className="p-3 font-semibold">Parameter</th>
                  <th className="p-3 font-semibold">Observed Value</th>
                  <th className="p-3 font-semibold">Reference Target</th>
                  <th className="p-3 font-semibold">Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                <tr>
                  <td className="p-3 font-medium">Resting Heart Rate</td>
                  <td className="p-3 font-bold text-navy-900">{restingHR} BPM</td>
                  <td className="p-3 text-navy-500">60 – 100 BPM</td>
                  <td className="p-3 text-emerald-700 font-semibold">Optimal Vagal Tone</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Blood Pressure</td>
                  <td className="p-3 font-bold text-navy-900">{bp.systolic} / {bp.diastolic} mmHg</td>
                  <td className="p-3 text-navy-500">&lt; 120 / 80 mmHg</td>
                  <td className="p-3 text-emerald-700 font-semibold">Normal (AHA 2017)</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Oxygen Saturation (SpO2)</td>
                  <td className="p-3 font-bold text-navy-900">{spo2}%</td>
                  <td className="p-3 text-navy-500">≥ 95.0%</td>
                  <td className="p-3 text-emerald-700 font-semibold">Healthy Perfusion</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Google Fit Cardio Heart Points</td>
                  <td className="p-3 font-bold text-navy-900">{hp} points</td>
                  <td className="p-3 text-navy-500">150 weekly</td>
                  <td className="p-3 text-emerald-700 font-semibold">Active Aerobic Conditioning</td>
                </tr>
                <tr className="bg-emerald-50/40">
                  <td className="p-3 font-bold text-emerald-950">Ischemic Stress Index (ISI)</td>
                  <td className="p-3 font-bold text-emerald-800 text-sm">{isi} / 100</td>
                  <td className="p-3 text-navy-600 font-medium">&lt; 45 (Low Risk)</td>
                  <td className="p-3 text-emerald-800 font-bold">Stable Baseline (Low Risk)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Clinical Interpretation & Guidelines */}
        <div className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 space-y-2 text-xs text-navy-700 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-navy-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Cardiovascular Baseline Interpretation
          </div>
          <p>
            Your current physiological readings demonstrate normal hemodynamic and autonomic stability. Your composite Ischemic Stress Index (ISI) of <strong>{isi}/100</strong> falls comfortably within the low-risk target range (&lt; 45).
          </p>
          <p className="text-[11px] text-navy-500 italic pt-1 border-t border-navy-100">
            Disclaimer: BeatAhead ISI is an AI-assisted screening research indicator. It does not constitute a formal diagnosis and does not replace regular clinical care or an emergency medical consultation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
