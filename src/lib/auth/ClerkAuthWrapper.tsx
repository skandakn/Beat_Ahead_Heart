"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ClerkProvider, useAuth, useUser, useClerk, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export interface BeatAheadUser {
  id: string;
  fullName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
}

export interface BeatAheadAuthContextType {
  isConfigured: boolean;
  isSignedIn: boolean;
  isLoaded: boolean;
  userId: string | null | undefined;
  user: BeatAheadUser | null;
  signOut: () => Promise<void>;
  signInDemoUser: (demoUser?: { email?: string; name?: string; imageUrl?: string }) => void;
}

const BeatAheadAuthContext = createContext<BeatAheadAuthContextType>({
  isConfigured: false,
  isSignedIn: false,
  isLoaded: true,
  userId: null,
  user: null,
  signOut: async () => {},
  signInDemoUser: () => {},
});

export function checkIsClerkConfigured(): boolean {
  const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pubKey) return false;
  if (pubKey.includes("YOUR_") || pubKey.includes("placeholder")) return false;
  if (!pubKey.startsWith("pk_")) return false;
  // Key must be long enough to be real (not just "pk_test_")
  if (pubKey.length < 20) return false;
  return true;
}

function getStoredDemoUser(): BeatAheadUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("beatahead_demo_session");
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

function stableDemoUserId(email?: string | null): string {
  const normalizedEmail = (email ?? "demo-user@beatahead.local").trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalizedEmail.length; i++) {
    hash = Math.imul(hash ^ normalizedEmail.charCodeAt(i), 16777619);
  }
  return `user_google_${(hash >>> 0).toString(36)}`;
}

function migrateDemoHealthRecord(previousId: string, nextId: string) {
  if (typeof window === "undefined" || previousId === nextId) return;
  try {
    const previousKey = `beatahead-patient-record-${previousId}`;
    const nextKey = `beatahead-patient-record-${nextId}`;
    const previousRecord = localStorage.getItem(previousKey);
    if (previousRecord && !localStorage.getItem(nextKey)) {
      const record = JSON.parse(previousRecord) as Record<string, unknown>;
      localStorage.setItem(nextKey, JSON.stringify({ ...record, userId: nextId }));
    }
  } catch (error) {
    console.error("Unable to migrate the saved health record to the stable demo account:", error);
  }
}

function migrateSingleLegacyDemoHealthRecord(nextId: string) {
  if (typeof window === "undefined") return;
  try {
    const nextKey = `beatahead-patient-record-${nextId}`;
    if (localStorage.getItem(nextKey)) return;
    const prefix = "beatahead-patient-record-user_google_";
    const legacyKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length))));
    // A single legacy demo record is unambiguous. With multiple records, keep them
    // isolated instead of risking attaching one person's health data to another.
    if (legacyKeys.length !== 1) return;
    const value = localStorage.getItem(legacyKeys[0]);
    if (!value) return;
    const record = JSON.parse(value) as Record<string, unknown>;
    localStorage.setItem(nextKey, JSON.stringify({ ...record, userId: nextId }));
  } catch (error) {
    console.error("Unable to migrate the legacy demo health record:", error);
  }
}

function normalizeStoredDemoUser(user: BeatAheadUser | null): BeatAheadUser | null {
  if (!user) return null;
  const normalized = { ...user, id: stableDemoUserId(user.email) };
  migrateDemoHealthRecord(user.id, normalized.id);
  if (normalized.id !== user.id) persistDemoUser(normalized);
  return normalized;
}

function persistDemoUser(user: BeatAheadUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      const serialized = JSON.stringify(user);
      localStorage.setItem("beatahead_demo_session", serialized);
      document.cookie = `beatahead_demo_session=${encodeURIComponent(serialized)}; path=/; max-age=2592000; SameSite=Lax`;
    } else {
      localStorage.removeItem("beatahead_demo_session");
      document.cookie = "beatahead_demo_session=; path=/; max-age=0; SameSite=Lax";
    }
  } catch (e) {
    console.error("Error persisting auth session:", e);
  }
}

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { isSignedIn: clerkSignedIn, isLoaded: clerkLoaded, userId: clerkUserId } = useAuth();
  const { user: clerkUser } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const router = useRouter();

  const [demoUser, setDemoUser] = useState<BeatAheadUser | null>(null);
  const [demoLoaded, setDemoLoaded] = useState(false);

  useEffect(() => {
    setDemoUser(normalizeStoredDemoUser(getStoredDemoUser()));
    setDemoLoaded(true);
  }, []);

  const signInDemoUser = useCallback(
    (demoUserArg?: { email?: string; name?: string; imageUrl?: string }) => {
      const email = demoUserArg?.email || "skandakn13@gmail.com";
      const newUser: BeatAheadUser = {
        id: stableDemoUserId(email),
        fullName: demoUserArg?.name || "Skanda K N",
        email,
        imageUrl:
          demoUserArg?.imageUrl ||
          "https://lh3.googleusercontent.com/a/ACg8ocIq_placeholder=s96-c",
      };
      const previousUser = getStoredDemoUser();
      if (previousUser) migrateDemoHealthRecord(previousUser.id, newUser.id);
      migrateSingleLegacyDemoHealthRecord(newUser.id);
      setDemoUser(newUser);
      persistDemoUser(newUser);
      // Clear vitals session flag so the modal re-appears on this new sign-in
      try { sessionStorage.removeItem("beatahead-vitals-session-checked"); } catch {/* ignore */}
    },
    []
  );

  const handleSignOut = async () => {
    if (demoUser) migrateDemoHealthRecord(demoUser.id, stableDemoUserId(demoUser.email));
    setDemoUser(null);
    persistDemoUser(null);
    // Clear vitals session flag on sign-out too
    try { sessionStorage.removeItem("beatahead-vitals-session-checked"); } catch {/* ignore */}
    if (clerkSignedIn && clerkSignOut) {
      try {
        await clerkSignOut();
      } catch (e) {
        console.error("Error signing out from Clerk:", e);
      }
    }
    router.push("/sign-in");
  };

  const isEffectiveSignedIn = Boolean(clerkSignedIn) || Boolean(demoUser);
  const effectiveUserId = clerkUserId || demoUser?.id || null;
  const effectiveUser: BeatAheadUser | null = clerkUser
    ? {
        id: clerkUser.id,
        fullName: clerkUser.fullName || clerkUser.firstName || "User",
        email: clerkUser.primaryEmailAddress?.emailAddress || null,
        imageUrl: clerkUser.imageUrl,
      }
    : demoUser;

  return (
    <BeatAheadAuthContext.Provider
      value={{
        isConfigured: true,
        isSignedIn: isEffectiveSignedIn,
        isLoaded: Boolean(clerkLoaded && demoLoaded),
        userId: effectiveUserId,
        user: effectiveUser,
        signOut: handleSignOut,
        signInDemoUser,
      }}
    >
      {children}
    </BeatAheadAuthContext.Provider>
  );
}

function UnconfiguredAuthBridge({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<BeatAheadUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSessionUser(normalizeStoredDemoUser(getStoredDemoUser()));
    setIsLoaded(true);
  }, []);

  const signInDemoUser = useCallback(
    (demoUser?: { email?: string; name?: string; imageUrl?: string }) => {
      const email = demoUser?.email || "skandakn13@gmail.com";
      const newUser: BeatAheadUser = {
        id: stableDemoUserId(email),
        fullName: demoUser?.name || "Skanda K N",
        email,
        imageUrl:
          demoUser?.imageUrl ||
          "https://lh3.googleusercontent.com/a/ACg8ocIq_placeholder=s96-c",
      };
      const previousUser = getStoredDemoUser();
      if (previousUser) migrateDemoHealthRecord(previousUser.id, newUser.id);
      migrateSingleLegacyDemoHealthRecord(newUser.id);
      setSessionUser(newUser);
      persistDemoUser(newUser);
      // Clear vitals session flag so the modal re-appears on this new sign-in
      try { sessionStorage.removeItem("beatahead-vitals-session-checked"); } catch {/* ignore */}
    },
    []
  );

  const signOut = useCallback(async () => {
    if (sessionUser) migrateDemoHealthRecord(sessionUser.id, stableDemoUserId(sessionUser.email));
    setSessionUser(null);
    persistDemoUser(null);
    // Clear vitals session flag on sign-out
    try { sessionStorage.removeItem("beatahead-vitals-session-checked"); } catch {/* ignore */}
    router.push("/sign-in");
  }, [router, sessionUser]);

  return (
    <BeatAheadAuthContext.Provider
      value={{
        isConfigured: false,
        isSignedIn: Boolean(sessionUser),
        isLoaded,
        userId: sessionUser?.id || null,
        user: sessionUser,
        signOut,
        signInDemoUser,
      }}
    >
      {children}
    </BeatAheadAuthContext.Provider>
  );
}

export function BeatAheadAuthProvider({ children }: { children: React.ReactNode }) {
  const isConfigured = checkIsClerkConfigured();

  if (isConfigured) {
    return (
      <ClerkProvider>
        <ClerkAuthBridge>{children}</ClerkAuthBridge>
      </ClerkProvider>
    );
  }

  return <UnconfiguredAuthBridge>{children}</UnconfiguredAuthBridge>;
}

export function useBeatAheadAuth() {
  return useContext(BeatAheadAuthContext);
}

export function SafeUserButton(props: React.ComponentProps<typeof UserButton>) {
  const { isConfigured, isSignedIn, user, signOut } = useBeatAheadAuth();
  if (!isSignedIn) return null;

  if (isConfigured && user && !user.id.startsWith("user_google_")) {
    return <UserButton {...props} />;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-cardiac flex items-center justify-center text-white text-xs font-bold shadow-sm">
        {user?.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
      </div>
      <span className="text-xs font-semibold text-navy-800 hidden sm:inline-block">
        {user?.fullName || "Signed In"}
      </span>
      <button
        onClick={() => signOut()}
        className="text-xs text-navy-500 hover:text-cardiac font-medium ml-1 underline"
      >
        Sign Out
      </button>
    </div>
  );
}
