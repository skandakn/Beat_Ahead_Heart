"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useBeatAheadAuth } from "@/lib/auth/ClerkAuthWrapper";

export type FeatureId =
  | "AI_INSIGHTS"
  | "PERSONAL_BASELINE"
  | "LONG_TERM_TRENDS"
  | "FEATURE_CONTRIBUTIONS"
  | "ADVANCED_ANALYTICS";

export type SubscriptionStatus = "active" | "inactive" | "pending" | "cancelled";

interface SubscriptionContextType {
  subscriptionStatus: SubscriptionStatus;
  demoMode: boolean;
  isLoading: boolean;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
  canAccessFeature: (feature: FeatureId | string) => boolean;
  refreshSubscriptionStatus: () => Promise<void>;
  subscribeToPro: () => Promise<void>;
  setSubscriptionStatusState: (status: SubscriptionStatus) => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export const PREMIUM_ACCOUNTS = [
  "skandakn13@gmail.com",
];

export function isPremiumAccount(email?: string | null): boolean {
  if (!email) return false;
  return true;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId, user, isLoaded: isUserLoaded } = useBeatAheadAuth();

  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("active");
  const [demoMode, setDemoModeState] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load demo mode from localStorage if present
  useEffect(() => {
    try {
      const savedDemo = localStorage.getItem("beatahead-demo-mode");
      if (savedDemo !== null) {
        setDemoModeState(JSON.parse(savedDemo));
      }
    } catch (e) {
      console.error("Error reading demo mode preference:", e);
    }
  }, []);

  const refreshSubscriptionStatus = useCallback(async () => {
    setSubscriptionStatus("active");
    setIsLoading(false);
  }, []);

  const setDemoMode = (enabled: boolean) => {
    setDemoModeState(enabled);
    try {
      localStorage.setItem("beatahead-demo-mode", JSON.stringify(enabled));
    } catch (e) {
      console.error("Error saving demo mode:", e);
    }
  };

  const toggleDemoMode = () => {
    setDemoMode(!demoMode);
  };

  // All features are unconditionally unlocked and accessible
  const canAccessFeature = useCallback(
    (_feature: FeatureId | string): boolean => {
      return true;
    },
    []
  );

  const setSubscriptionStatusState = async (status: SubscriptionStatus) => {
    setSubscriptionStatus(status);
  };

  const subscribeToPro = async () => {
    setSubscriptionStatus("active");
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptionStatus,
        demoMode,
        isLoading,
        setDemoMode,
        toggleDemoMode,
        canAccessFeature,
        refreshSubscriptionStatus,
        subscribeToPro,
        setSubscriptionStatusState,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}
