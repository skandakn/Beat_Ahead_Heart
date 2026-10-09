"use client";

import { Check, Sparkles, Building2, UserCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/subscription/SubscriptionContext";
import { useI18n } from "@/lib/i18n/I18nProvider";


export default function PricingPage() {
  const { subscriptionStatus, demoMode, subscribeToPro, setDemoMode, isLoading } = useSubscription();
  const { t } = useI18n();

  const isProActive = subscriptionStatus === "active" || demoMode;

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-navy-900">{t("pricing.title")}</h1>
        <p className="text-sm text-navy-500 mt-1">
          {t("pricing.subtitle")}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 pt-4">
        {/* Free Plan */}
        <div className="rounded-2xl border border-navy-100 bg-white p-6 md:p-8 shadow-card flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy-50 text-navy-700 text-xs font-semibold">
              {t("pricing.freeTier")}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-navy-900">{t("pricing.freeUser")}</h2>
              <p className="text-xs text-navy-500 mt-1">{t("pricing.freeDescription")}</p>
            </div>
            <div className="pt-2">
              <span className="text-4xl font-extrabold text-navy-900">₹0</span>
              <span className="text-sm font-medium text-navy-500"> {t("paywall.pricePerMonth")}</span>
            </div>

            <hr className="border-navy-100" />

            <ul className="space-y-3 text-sm text-navy-700">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t("pricing.basicDashboard")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t("pricing.basicMetrics")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t("pricing.basicMonitoring")}</span>
              </li>
              <li className="flex items-center gap-2.5 opacity-50">
                <Lock className="w-4 h-4 text-navy-400 shrink-0" />
                <span className="line-through">{t("pricing.aiInsightsLocked")}</span>
              </li>
              <li className="flex items-center gap-2.5 opacity-50">
                <Lock className="w-4 h-4 text-navy-400 shrink-0" />
                <span className="line-through">{t("pricing.baselineLocked")}</span>
              </li>
            </ul>
          </div>

          <Button variant="outline" className="w-full" disabled>
            {t("pricing.currentAccess")}
          </Button>
        </div>

        {/* BeatAhead Pro Plan */}
        <div className="relative rounded-2xl border-2 border-navy-900 bg-white p-6 md:p-8 shadow-elevated flex flex-col justify-between space-y-6">
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-navy-900 text-white text-xs font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> {t("pricing.mostPopular")}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-cardiac text-xs font-semibold border border-red-100">
                {t("pricing.proTier")}
              </div>
              {isProActive && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {t("pricing.proActive")}
                </span>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-navy-900">{t("pricing.proTier")}</h2>
              <p className="text-xs text-navy-500 mt-1">{t("pricing.proDescription")}</p>
            </div>

            <div className="pt-2">
              <span className="text-4xl font-extrabold text-navy-900">₹599</span>
              <span className="text-sm font-medium text-navy-500"> {t("paywall.pricePerMonth")}</span>
            </div>

            <hr className="border-navy-100" />

            <ul className="space-y-3 text-sm text-navy-800">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-medium">{t("pricing.personalizedBaseline")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-medium">{t("pricing.aiInsightsGraph")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-medium">{t("pricing.longTermTrends")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-medium">{t("pricing.featureContribution")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                <span className="font-medium">{t("pricing.advancedAnalytics")}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              onClick={subscribeToPro}
              disabled={isLoading || subscriptionStatus === "active"}
              size="lg"
              className="w-full bg-navy-900 hover:bg-navy-800 text-white font-semibold py-5"
            >
              {subscriptionStatus === "active" ? (
                <>
                  <UserCheck className="w-4 h-4" /> {t("pricing.subscriptionActive")}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" /> {t("pricing.subscribe599")}
                </>
              )}
            </Button>

            {!demoMode && (
              <button
                onClick={() => setDemoMode(true)}
                className="w-full text-center text-xs text-amber-700 hover:text-amber-900 font-semibold pt-1"
              >
                {t("pricing.evaluatingDemo")}
              </button>
            )}
          </div>
        </div>

        {/* Hospital B2B Plan */}
        <div className="rounded-2xl border border-navy-100 bg-navy-50/50 p-6 md:p-8 shadow-card flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5" /> {t("pricing.institutionalB2B")}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-navy-900">{t("pricing.hospital")}</h2>
              <p className="text-xs text-navy-500 mt-1">{t("pricing.hospitalDescription")}</p>
            </div>
            <div className="pt-2">
              <span className="text-2xl font-bold text-navy-900">{t("pricing.perHospitalLicence")}</span>
            </div>

            <hr className="border-navy-200" />

            <ul className="space-y-3 text-sm text-navy-700">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{t("pricing.clinicianDashboard")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{t("pricing.multiPatient")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{t("pricing.ehrIntegration")}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{t("pricing.hospitalAnalytics")}</span>
              </li>
            </ul>
          </div>

          <Button variant="outline" className="w-full border-navy-300 text-navy-800">
            {t("pricing.contactB2B")}
          </Button>
        </div>
      </div>
    </div>
  );
}
