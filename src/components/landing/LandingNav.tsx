"use client";

import { useState } from "react";
import Link from "next/link";
import { useBeatAheadAuth, SafeUserButton } from "@/lib/auth/ClerkAuthWrapper";
import { Heart, Menu, X, LogIn, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { EmergencyButton } from "@/components/emergency/EmergencyButton";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const { isSignedIn } = useBeatAheadAuth();
  const { t } = useI18n();
  const links = [
    { href: "/helpline", label: t("nav.helpline") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/methodology", label: t("nav.methodology") },
    { href: "/about", label: t("nav.about") },
  ];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-navy-100">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy-900 flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-bold text-navy-900">BeatAhead</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-navy-600 hover:text-navy-900 font-medium">
              {link.label}
            </Link>
          ))}
          <EmergencyButton variant="nav" />
          <LanguageSelector compact className="border-l border-navy-200 ps-3" />

          {isSignedIn ? (
            <>
              <Link href="/dashboard">
                <Button size="sm" className="gap-1.5 font-semibold">
                  {t("common.openDashboard")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <SafeUserButton showName />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm text-navy-700 hover:text-navy-900 font-semibold flex items-center gap-1">
                <LogIn className="w-4 h-4" />
                {t("common.signIn")}
              </Link>
              <Link href="/sign-up">
                <Button size="sm" className="font-semibold shadow-sm">
                  {t("common.getStarted")}
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen(true)}
          className="md:hidden p-2 rounded-lg hover:bg-navy-50 text-navy-600"
          aria-label={t("common.openMenu")}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-navy-100">
              <span className="font-semibold text-navy-900">{t("common.menu")}</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-navy-50" aria-label={t("common.closeMenu")}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <div className="pb-1">
                <EmergencyButton variant="sidebar" className="p-0" />
              </div>
              <div className="px-3 py-2.5">
                <LanguageSelector />
              </div>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block px-3 py-2.5 rounded-lg text-sm font-medium text-navy-600 hover:bg-navy-50 hover:text-navy-900"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="px-4 pt-2 space-y-2 border-t border-navy-100">
              {isSignedIn ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <SafeUserButton showName />
                  </div>
                  <Link href="/dashboard" onClick={() => setOpen(false)}>
                    <Button className="w-full">{t("common.openDashboard")}</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/sign-in" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full mb-2">{t("common.signIn")}</Button>
                  </Link>
                  <Link href="/sign-up" onClick={() => setOpen(false)}>
                    <Button className="w-full">{t("common.getStarted")}</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}



