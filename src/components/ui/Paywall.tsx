"use client";

import React from "react";
import { Check, Lock, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/subscription/SubscriptionContext";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface PaywallProps {
  featureName?: string;
  description?: string;
  children?: React.ReactNode;
}

export function Paywall({
  featureName = "Advanced AI Analytics",
  description = "Unlock personalized baselines, explainable AI contribution analysis, and 30-day risk trends.",
  children,
}: PaywallProps) {
  const { subscribeToPro, setDemoMode, isLoading } = useSubscription();
  const { t } = useI18n();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-elevated">
      {/* Blurred preview of the background content if provided */}
      {children && (
        <div className="pointer-events-none select-none opacity-20 blur-md filter">
          {children}
        </div>
      )}

      {/* Paywall Overlay */}
      <div className={`${children ? "absolute inset-0 flex items-center justify-center p-4 bg-navy-950/40 backdrop-blur-sm" : "p-8 md:p-12 text-center"}`}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-navy-100 text-left space-y-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Header Badge */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-cardiac text-xs font-semibold border border-red-100">
              <Lock className="w-3.5 h-3.5" />
              {t("paywall.proFeature")}
            </div>
            <span className="text-xs font-medium text-navy-400">{t("paywall.researchPrototype")}</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-navy-900">
              {t("paywall.proTitle")}
            </h2>
            <p className="text-sm text-navy-600 mt-1">
              {t("paywall.unlockFeature").replace("{feature}", featureName.toLowerCase())}
            </p>
          </div>

          {/* Feature Checklist */}
          <div className="space-y-2.5 bg-navy-50/70 p-4 rounded-xl border border-navy-100/80">
            <p className="text-xs font-semibold uppercase text-navy-400 tracking-wider">
              {t("paywall.includedInPro")}
            </p>
            <ul className="space-y-2 text-sm text-navy-800">
              <li className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span>{t("paywall.personalBaseline")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span>{t("paywall.aiInsights")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span>{t("paywall.longTermTrends")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span>{t("paywall.advancedAnalytics")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span>{t("paywall.clinicianDashboard")}</span>
              </li>
            </ul>
          </div>

          {/* Price & Action */}
          <div className="space-y-3 pt-1">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-extrabold text-navy-900">₹599</span>
                <span className="text-sm font-medium text-navy-500"> {t("paywall.pricePerMonth")}</span>
              </div>
              <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                {t("paywall.razorpayTest")}
              </span>
            </div>

            <Button
              onClick={subscribeToPro}
              disabled={isLoading}
              size="lg"
              className="w-full gap-2 bg-navy-900 hover:bg-navy-800 text-white font-semibold py-6 text-base shadow-lg shadow-navy-900/20"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              {t("paywall.subscribe599")}
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
          </div>

          {/* Presentation / Judge Demo Mode Banner inside Paywall */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold text-amber-950">{t("paywall.presentingTitle")}</p>
              <p className="mt-0.5 text-amber-800" dangerouslySetInnerHTML={{ __html: t("paywall.presentingDescription") }} />
              <button
                onClick={() => setDemoMode(true)}
                className="mt-2 text-xs font-bold text-amber-900 underline hover:text-amber-950 inline-flex items-center gap-1"
              >
                {t("paywall.enableJudgeDemo")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
