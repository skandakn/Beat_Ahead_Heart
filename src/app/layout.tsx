import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BeatAheadAuthProvider } from "@/lib/auth/ClerkAuthWrapper";
import { SimulationProvider } from "@/lib/simulation/SimulationContext";
import { HardwareSerialProvider } from "@/lib/hardware/HardwareSerialContext";
import { SubscriptionProvider } from "@/lib/subscription/SubscriptionContext";
import { Sidebar, MobileNav } from "@/components/layout/Sidebar";
import { AppContentWrapper } from "@/components/layout/AppContentWrapper";
import { Toast } from "@/components/layout/Toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CardiacVoiceWidget } from "@/components/voice/CardiacVoiceWidget";
import { TourProvider } from "@/lib/tour/TourContext";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "BeatAhead — Ischemic Stress Index",
  description:
    "AI Framework for Early Cardiac Risk Assessment. Multimodal physiological signal fusion for personalized risk-trend screening.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BeatAhead",
  },
  keywords: ["cardiac", "ISI", "wearable", "HRV", "healthcare AI", "physiological monitoring"],
  authors: [{ name: "BeatAhead" }],
  openGraph: {
    title: "BeatAhead — See the Trend Before the Event",
    description:
      "Multimodal AI fusion for personalized cardiac risk-trend screening. Research prototype — not a medical diagnosis.",
    type: "website",
    siteName: "BeatAhead",
  },
  twitter: {
    card: "summary_large_image",
    title: "BeatAhead — Ischemic Stress Index",
    description:
      "Multimodal physiological signal fusion for personalized risk-trend screening.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <BeatAheadAuthProvider>
      <html lang="en" dir="ltr">
        <body className={`${inter.variable} font-sans`}>
          <I18nProvider>
            <SubscriptionProvider>
              <SimulationProvider>
              <HardwareSerialProvider>
                <TooltipProvider>
                  <TourProvider>
                    <GuidedTour />
                    <PWAInstallPrompt />
                    <Sidebar />
                    <AppContentWrapper>{children}</AppContentWrapper>
                    <MobileNav />
                    <Toast />
                    <CardiacVoiceWidget />
                  </TourProvider>
                </TooltipProvider>
              </HardwareSerialProvider>
              </SimulationProvider>
            </SubscriptionProvider>
          </I18nProvider>
        </body>
      </html>
    </BeatAheadAuthProvider>
  );
}
