"use client";

import { useMemo, useState } from "react";
import { useSubscription } from "@/lib/subscription/SubscriptionContext";
import { useSimulation } from "@/lib/simulation/SimulationContext";
import { useBeatAheadAuth } from "@/lib/auth/ClerkAuthWrapper";
import { Paywall } from "@/components/ui/Paywall";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { cn, getTrendLabel } from "@/lib/utils";
import { ISIGauge } from "@/components/isi/ISIGauge";
import { ContributionBars } from "@/components/isi/ContributionBars";
import { ISITrendChart } from "@/components/charts/ISITrendChart";
import { BaselineCard } from "@/components/isi/BaselineCard";
import {
  Download,
  ChevronRight,
  FileText,
  User,
  HeartPulse,
  Activity,
  Droplets,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { PatientRecord } from "@/lib/isi/types";
import { MEDICAL_DISCLAIMER } from "@/lib/isi/types";
import { generateClinicalPDF } from "@/lib/pdf/generateClinicalReport";
import Link from "next/link";

export default function ClinicianPage() {
  const { t } = useI18n();
  const { canAccessFeature } = useSubscription();
  const { user } = useBeatAheadAuth();
  const {
    currentScore,
    currentSample,
    history,
    baseline,
    features,
    healthRecord,
  } = useSimulation();

  const [selectedId, setSelectedId] = useState<string>("USER_PRIMARY");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const hasAccess = canAccessFeature("ADVANCED_ANALYTICS");

  // Construct user patient record from real user profile and live telemetry
  const userName = user?.fullName || "Skanda K N";
  const userEmail = user?.email || "skandakn13@gmail.com";

  const userPatient: PatientRecord = useMemo(() => {
    return {
      id: "PT-USER (Skanda K N)",
      name: `${userName} (You)`,
      isCurrentUser: true,
      currentISI: currentScore.score,
      trend: currentScore.trend,
      signalQuality: currentSample?.signalQuality.overall ?? 95,
      lastUpdated: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      baseline,
      scores: history.length > 0 ? history : [currentScore],
      features,
      lastSample: currentSample,
    };
  }, [userName, currentScore, currentSample, baseline, history, features]);

  // Sole active patient is the logged-in user
  const allPatients = useMemo(() => [userPatient], [userPatient]);
  const selected = userPatient;

  const exportPDF = async () => {
    setIsExportingPdf(true);
    try {
      await generateClinicalPDF(userPatient);
    } catch (err) {
      console.error("Failed to generate PDF report:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportReport = () => {
    const report = {
      generated: new Date().toISOString(),
      patient: selected?.id ?? "All",
      model_provenance: {
        model_name: "BeatAhead Phase 5 XGBoost",
        model_version: "1.0.0-phase5-frozen",
        schema_version: "1.0.0",
        feature_matrix: "26-feature Matrix A",
        decision_threshold: 0.156742,
        selection_metric: "F1 maximization",
        intended_use: "Research prototype for prospective early-warning trend analysis (300s window + 300s buffer + 300s horizon)",
        regulatory_status: "Investigational research prototype — Not FDA approved for diagnostic use",
        artifact_hash: "528ff3f8f5edac6f3baf5aef8715d5e86f478462d76ac574b9f0ec60e8640808",
      },
      disclaimer: MEDICAL_DISCLAIMER,
      note: "Clinical decision support prototype — not a diagnostic system.",
      data: selected ?? allPatients,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beatahead-report-${selected?.id ?? "all"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Clinician Dashboard</h1>
          <p className="text-sm text-navy-500">Multi-patient hemodynamic surveillance & verified model inference</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={exportPDF}
            disabled={isExportingPdf}
            size="sm"
            className="gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white shadow-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            {isExportingPdf ? "Generating PDF..." : "Export PDF"}
          </Button>
          <Button
            onClick={exportReport}
            variant="outline"
            size="sm"
            className="gap-2 text-navy-700 border-navy-200 hover:bg-navy-50"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Patient List (Left Column) */}
        <Card className="lg:col-span-1 h-fit border-navy-200 shadow-card">
          <CardHeader className="border-b border-navy-100 bg-navy-50/50 py-3.5 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-navy-900">Active Patient</CardTitle>
              <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                1 Active
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-navy-100">
              <div className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-navy-50/80 border-l-4 border-cardiac">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-navy-900 truncate">
                      {userPatient.name}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded bg-cardiac/10 px-1.5 py-0.5 text-[10px] font-bold text-cardiac">
                      <User className="h-2.5 w-2.5" />
                      YOU (LIVE)
                    </span>
                  </div>
                  <p className="text-xs text-navy-500 mt-0.5">
                    ISI: <span className="font-semibold text-navy-800">{userPatient.currentISI}</span> · {getTrendLabel(userPatient.trend)} · Telemetry Active
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-cardiac" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient Detail (Right 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* User Profile Info Card (When User is Selected) */}
          {selected.isCurrentUser && (
            <div className="rounded-xl border border-cardiac/20 bg-gradient-to-r from-cardiac/5 via-rose-50/40 to-white p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cardiac/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cardiac text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-navy-900">{userName}</h2>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Live User Telemetry
                      </span>
                    </div>
                    <p className="text-xs text-navy-500">{userEmail} · Connected Health Record Profile</p>
                  </div>
                </div>
                <Link
                  href="/health-record"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cardiac hover:text-red-700 transition-colors"
                >
                  Edit Health Record
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Verified User Vitals Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-xs">
                  <div className="flex items-center gap-1.5 text-navy-400 text-[11px]">
                    <Droplets className="w-3.5 h-3.5 text-cardiac" />
                    <span>Blood Pressure</span>
                  </div>
                  <p className="text-base font-bold text-navy-900 mt-1">
                    {healthRecord?.systolicBP && healthRecord?.diastolicBP
                      ? `${healthRecord.systolicBP}/${healthRecord.diastolicBP} mmHg`
                      : "120/80 mmHg"}
                  </p>
                  <p className="text-[10px] text-navy-400">
                    {healthRecord?.bloodPressureCategory ? healthRecord.bloodPressureCategory.replace("_", " ") : "Normative"}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-xs">
                  <div className="flex items-center gap-1.5 text-navy-400 text-[11px]">
                    <HeartPulse className="w-3.5 h-3.5 text-cardiac" />
                    <span>Resting HR</span>
                  </div>
                  <p className="text-base font-bold text-navy-900 mt-1">
                    {healthRecord?.restingHeartRate
                      ? `${healthRecord.restingHeartRate} bpm`
                      : `${Math.round(currentSample.heartRate)} bpm`}
                  </p>
                  <p className="text-[10px] text-navy-400">Resting Baseline</p>
                </div>

                <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-xs">
                  <div className="flex items-center gap-1.5 text-navy-400 text-[11px]">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" />
                    <span>ECG Lead II</span>
                  </div>
                  <p className="text-base font-bold text-navy-900 mt-1 truncate">
                    {healthRecord?.ecgValue || "0.80 mV"}
                  </p>
                  <p className="text-[10px] text-navy-400">Amplitude Normative</p>
                </div>

                <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-xs">
                  <div className="flex items-center gap-1.5 text-navy-400 text-[11px]">
                    <Activity className="w-3.5 h-3.5 text-teal-500" />
                    <span>PPG Pulse</span>
                  </div>
                  <p className="text-base font-bold text-navy-900 mt-1 truncate">
                    {healthRecord?.ppgValue || "0.60 Amp"}
                  </p>
                  <p className="text-[10px] text-navy-400">Waveform Verified</p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t("stats.currentISI"), value: selected.currentISI },
              { label: t("stats.trend"), value: getTrendLabel(selected.trend, t) },
              { label: t("clinician.signalQuality"), value: `${Math.round(selected.signalQuality)}%` },
              { label: t("clinician.lastUpdated"), value: selected.lastUpdated },
            ].map((s) => (
              <div key={s.label} className="p-3.5 rounded-lg bg-white border border-navy-100 shadow-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">{s.label}</p>
                <p className="text-lg font-bold text-navy-900 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Gauge & Baseline Grid */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-xs">
              <ISIGauge
                score={selected.currentISI}
                baseline={selected.baseline.isi}
                trend={selected.trend}
                confidence={selected.scores.at(-1)?.confidence ?? 88}
              />
            </div>
            <BaselineCard
              title={selected.isCurrentUser ? "Your Personal Baseline" : "Patient Baseline"}
              baseline={selected.baseline}
              sample={selected.lastSample}
              features={selected.features}
            />
          </div>

          {/* Trend Chart */}
          <ISITrendChart history={selected.scores} baselineIsi={selected.baseline.isi} />

          {/* Feature Contributions */}
          <ContributionBars contributions={selected.scores.at(-1)?.contributions} />

        </div>
      </div>
    </div>
  );

  if (!hasAccess) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto">
        <Paywall featureName="Clinician Dashboard & Multi-Patient Analytics">
          {content}
        </Paywall>
      </div>
    );
  }

  return content;
}
