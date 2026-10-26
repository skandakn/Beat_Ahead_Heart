"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is running as standalone PWA
    const isApp =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true);
    setIsStandalone(Boolean(isApp));

    // Register service worker if supported
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW registration error:", err);
      });
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem("beatahead_pwa_dismissed");
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("beatahead_pwa_dismissed", "true");
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <aside
      aria-label="Install BeatAhead App"
      className="fixed top-3 inset-x-3 z-50 sm:max-w-md sm:left-auto sm:right-4 bg-navy-900/95 text-white backdrop-blur-md rounded-2xl p-4 shadow-elevated border border-white/10 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-cardiac flex items-center justify-center shrink-0 shadow-sm">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white truncate">Install BeatAhead Mobile</p>
          <p className="text-[11px] text-navy-300 truncate">
            Add to home screen for fullscreen cardiac monitoring
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={handleInstall}
          className="bg-cardiac hover:bg-red-700 text-white text-xs h-8 px-3 font-semibold rounded-lg"
        >
          Install
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-white/10"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
