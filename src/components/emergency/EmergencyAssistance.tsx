"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Phone,
  Navigation,
  MapPin,
  AlertTriangle,
  Share2,
  Search,
  RefreshCw,
  Clock,
  ShieldAlert,
  ExternalLink,
  Check,
  Copy,
  Building2,
  X,
  Stethoscope,
  Pill,
  HeartPulse,
} from "lucide-react";
import { HealthcarePlace, HealthcarePlaceType } from "@/lib/emergency/types";
import {
  EMERGENCY_SERVICES_NUMBER,
  EMERGENCY_SERVICES_TEL,
  buildLocationMapLink,
} from "@/lib/emergency/service";
import { Button } from "@/components/ui/button";

interface EmergencyAssistanceProps {
  onClose?: () => void;
  isModal?: boolean;
}

export function EmergencyAssistance({ onClose, isModal = false }: EmergencyAssistanceProps) {
  // Coordinates & Location State
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);

  // Search & Places State
  const [places, setPlaces] = useState<HealthcarePlace[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState<boolean>(false);

  // Manual Locality Search
  const [manualQuery, setManualQuery] = useState<string>("");
  const [activeQuery, setActiveQuery] = useState<string>("");

  // Filter Tabs
  const [activeFilter, setActiveFilter] = useState<"all" | "hospital" | "doctor" | "pharmacy">("all");

  // Share Feedback State
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // Request browser geolocation
  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser. Please search by city/locality.");
      setPermissionDenied(true);
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    setPermissionDenied(false);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setCoords(userCoords);
        setIsLocating(false);
        setLocationError(null);
        setPermissionDenied(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setLocationError("Location access is required to find nearby healthcare facilities.");
        } else if (err.code === err.TIMEOUT) {
          setLocationError("Location request timed out. Please retry or enter your location manually.");
        } else {
          setLocationError("Unable to acquire your location. Please retry or search manually.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  // Auto-request location on component mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Fetch places from backend API
  const fetchNearbyPlaces = useCallback(
    async (lat?: number, lng?: number, queryText?: string) => {
      setIsLoadingPlaces(true);
      setApiError(null);

      try {
        const payload: Record<string, any> = {};
        if (typeof lat === "number" && typeof lng === "number") {
          payload.latitude = lat;
          payload.longitude = lng;
          payload.radiusMeters = 10000;
        }
        if (queryText && queryText.trim()) {
          payload.query = queryText.trim();
        }

        const res = await fetch("/api/emergency/nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        setHasQueried(true);

        if (!res.ok || !data.success) {
          setApiError(data.error || "Unable to fetch nearby healthcare facilities. Please try again or call 112.");
          setPlaces([]);
        } else {
          setPlaces(Array.isArray(data.places) ? data.places : []);
          setApiError(null);
        }
      } catch (err: any) {
        setHasQueried(true);
        setApiError(err?.message || "Network error while connecting to emergency assistance service.");
        setPlaces([]);
      } finally {
        setIsLoadingPlaces(false);
      }
    },
    []
  );

  // When coordinates become available and no manual query is active, fetch nearby places
  useEffect(() => {
    if (coords && !activeQuery) {
      fetchNearbyPlaces(coords.latitude, coords.longitude);
    }
  }, [coords, activeQuery, fetchNearbyPlaces]);

  // Manual Search Handler
  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setActiveQuery(manualQuery.trim());
    fetchNearbyPlaces(coords?.latitude, coords?.longitude, manualQuery.trim());
  };

  // Reset to auto-location
  const handleResetToAutoLocation = () => {
    setActiveQuery("");
    setManualQuery("");
    if (coords) {
      fetchNearbyPlaces(coords.latitude, coords.longitude);
    } else {
      requestLocation();
    }
  };

  // Share Location handler (Web Share API with fallback)
  const handleShareLocation = async () => {
    if (!coords) {
      alert("Location is not available yet. Please enable location to share your coordinates.");
      return;
    }

    const shareUrl = buildLocationMapLink(coords.latitude, coords.longitude);
    const shareText = `Emergency Assistance Alert: I need immediate help. My current location is: ${shareUrl}`;

    if (navigator.share && navigator.canShare && navigator.canShare({ url: shareUrl })) {
      try {
        await navigator.share({
          title: "BeatAhead Emergency Location",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return; // User cancelled share dialog
      }
    }

    // Fallback: Copy link to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 4000);
    } catch {
      window.open(shareUrl, "_blank");
    }
  };

  // Filtered places
  const filteredPlaces = useMemo(() => {
    if (activeFilter === "all") return places;
    if (activeFilter === "hospital") {
      return places.filter(
        (p) => p.placeType === "hospital" || p.placeType === "emergency_room"
      );
    }
    if (activeFilter === "doctor") {
      return places.filter(
        (p) => p.placeType === "doctor" || p.placeType === "clinic"
      );
    }
    if (activeFilter === "pharmacy") {
      return places.filter((p) => p.placeType === "pharmacy");
    }
    return places;
  }, [places, activeFilter]);

  // Counts for tabs
  const counts = useMemo(() => {
    const hospitalCount = places.filter(
      (p) => p.placeType === "hospital" || p.placeType === "emergency_room"
    ).length;
    const doctorCount = places.filter(
      (p) => p.placeType === "doctor" || p.placeType === "clinic"
    ).length;
    const pharmacyCount = places.filter((p) => p.placeType === "pharmacy").length;
    return {
      all: places.length,
      hospital: hospitalCount,
      doctor: doctorCount,
      pharmacy: pharmacyCount,
    };
  }, [places]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 text-navy-900">
      {/* ─── Header Section ─── */}
      <div className="flex items-start justify-between gap-4 border-b border-navy-100 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-red-600 uppercase">
              Emergency Assistance
            </h1>
          </div>
          <p className="text-base sm:text-lg font-bold text-navy-800 mt-1">
            How can we help?
          </p>
          <p className="text-xs text-navy-500 mt-0.5">
            Your location is used only to find nearby emergency healthcare services.
          </p>
        </div>

        {isModal && onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-navy-400 hover:text-navy-700 hover:bg-navy-50 transition-colors"
            aria-label="Close emergency modal"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* ─── Medical Safety Disclaimer (Item 11) ─── */}
      <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-3 sm:p-4 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Medical Safety Notice: </strong>
          BeatAhead does not diagnose medical emergencies. If you believe you are experiencing a medical emergency,
          contact emergency services or seek immediate medical care.
        </p>
      </div>

      {/* ─── PRIMARY ACTION 1: CALL EMERGENCY SERVICES (112) (Item 7 & 12) ─── */}
      <div className="mb-6">
        <a
          href={EMERGENCY_SERVICES_TEL}
          className="group relative flex items-center justify-between gap-4 w-full p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-red-600 via-red-600 to-rose-700 text-white shadow-lg shadow-red-600/30 hover:shadow-xl hover:shadow-red-600/40 hover:from-red-500 hover:to-rose-600 transition-all duration-200 active:scale-[0.99] border-2 border-red-500"
          data-testid="emergency-services-button"
        >
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm group-hover:scale-105 transition-transform shrink-0">
              <Phone className="h-6 w-6 sm:h-7 sm:w-7 text-white fill-white" />
            </div>
            <div className="text-left">
              <span className="inline-block px-2 py-0.5 rounded-full bg-white/25 text-[11px] font-extrabold uppercase tracking-wider text-white mb-1">
                🚨 Immediate Action
              </span>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-tight">
                CALL EMERGENCY SERVICES (112)
              </h2>
              <p className="text-xs sm:text-sm text-red-100 font-medium mt-0.5">
                National Emergency Number • Medical, Ambulance & Police
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end text-right shrink-0">
            <span className="text-xs uppercase tracking-wider font-semibold text-red-100">
              Toll-Free 24/7
            </span>
            <span className="text-2xl font-black tracking-tight">112</span>
          </div>
        </a>
        <p className="text-[11px] text-navy-400 mt-2 px-1 text-center sm:text-left">
          *BeatAhead connects directly to your phone dialer. BeatAhead does not itself operate an emergency dispatch or ambulance service.
        </p>
      </div>

      {/* ─── PRIMARY ACTION 2: SHARE MY LOCATION (Item 8) ─── */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-navy-50/80 border border-navy-100">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-5 h-5 text-cardiac shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-navy-800">
              {coords
                ? `GPS Active: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                : isLocating
                ? "Locating your position..."
                : "Location not yet established"}
            </span>
            <p className="text-navy-500">
              Share real-time GPS coordinates with your family, ambulance, or trusted contacts.
            </p>
          </div>
        </div>

        <Button
          onClick={handleShareLocation}
          variant="outline"
          size="sm"
          className="shrink-0 font-bold border-navy-300 hover:bg-navy-100 text-navy-800 gap-1.5 h-10 px-4"
          data-testid="share-location-button"
        >
          {shareCopied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-navy-600" />
              <span>Share My Location</span>
            </>
          )}
        </Button>
      </div>

      {/* ─── ERROR HANDLING / PERMISSION DENIED (Item 9) ─── */}
      {permissionDenied && (
        <div
          className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50/70 p-4 sm:p-5 text-navy-900"
          data-testid="permission-denied-banner"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm sm:text-base font-bold text-red-800">
                Location access is required to find nearby healthcare facilities.
              </h3>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                Please allow browser location permissions to automatically discover the nearest hospitals and emergency rooms, or search manually by entering your city or locality below.
              </p>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button
                  onClick={requestLocation}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5"
                  data-testid="retry-location-button"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Location
                </Button>
                <a href={EMERGENCY_SERVICES_TEL}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-100 font-bold gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call 112
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Location Error Banner (non-permission) ─── */}
      {!permissionDenied && locationError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs text-amber-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{locationError}</span>
          </div>
          <Button
            onClick={requestLocation}
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold shrink-0"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* ─── Manual Search by City/Locality (Item 9) ─── */}
      <div className="mb-6">
        <form onSubmit={handleManualSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Search by city, locality or hospital name (e.g. Bangalore, Indiranagar)..."
              className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-4 text-sm text-navy-900 placeholder-navy-400 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              data-testid="manual-search-input"
            />
          </div>
          <Button
            type="submit"
            className="bg-navy-900 hover:bg-navy-800 text-white font-semibold px-4 h-10 shrink-0"
            disabled={!manualQuery.trim() || isLoadingPlaces}
            data-testid="manual-search-submit"
          >
            {isLoadingPlaces ? "Searching..." : "Search"}
          </Button>
          {activeQuery && (
            <Button
              type="button"
              variant="outline"
              onClick={handleResetToAutoLocation}
              className="text-xs font-semibold px-3 h-10 border-navy-200"
              title="Reset to GPS location"
            >
              Reset GPS
            </Button>
          )}
        </form>

        {activeQuery && (
          <p className="text-xs text-navy-500 mt-2 px-1">
            Showing results for: <span className="font-semibold text-navy-800">&quot;{activeQuery}&quot;</span>
          </p>
        )}
      </div>

      {/* ─── Category Filter Tabs ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        <button
          onClick={() => setActiveFilter("all")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
            activeFilter === "all"
              ? "bg-navy-900 text-white shadow-sm"
              : "bg-navy-50 text-navy-600 hover:bg-navy-100"
          }`}
        >
          All Facilities ({counts.all})
        </button>
        <button
          onClick={() => setActiveFilter("hospital")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeFilter === "hospital"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-red-50 text-red-700 hover:bg-red-100"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Hospitals & Emergency ({counts.hospital})
        </button>
        <button
          onClick={() => setActiveFilter("doctor")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeFilter === "doctor"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          Clinics & Doctors ({counts.doctor})
        </button>
        <button
          onClick={() => setActiveFilter("pharmacy")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
            activeFilter === "pharmacy"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          <Pill className="w-3.5 h-3.5" />
          Pharmacies ({counts.pharmacy})
        </button>
      </div>

      {/* ─── NEARBY HEALTHCARE CARDS SECTION (Item 4 & 12) ─── */}
      <div className="space-y-3" data-testid="nearby-facilities-list">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-red-600" />
            Nearby Healthcare Options
          </h3>
          <span className="text-xs text-navy-500">
            {places.length > 0 ? `Found ${filteredPlaces.length} facilities` : ""}
          </span>
        </div>

        {/* Loading State */}
        {(isLocating || isLoadingPlaces) && (
          <div className="rounded-2xl border border-navy-100 bg-white p-8 text-center shadow-card">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-3 animate-pulse">
              <HeartPulse className="h-6 w-6 animate-spin" />
            </div>
            <p className="text-sm font-bold text-navy-900">
              {isLocating ? "Acquiring your GPS location..." : "Searching nearby hospitals & emergency facilities..."}
            </p>
            <p className="text-xs text-navy-500 mt-1">
              Querying Google Places API for real-time healthcare providers
            </p>
          </div>
        )}

        {/* API Error Graceful Fallback (Item 9) */}
        {!isLoadingPlaces && apiError && (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-navy-900 shadow-card"
            data-testid="api-error-card"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-900">
                  Healthcare Directory Service Notice
                </h4>
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  {apiError}
                </p>
                <p className="text-xs text-navy-600 mt-2">
                  In a medical emergency, do not wait. Use the direct Emergency Services button below or dial 112 from any telephone.
                </p>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a href={EMERGENCY_SERVICES_TEL}>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Call Emergency Services (112)
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (coords) fetchNearbyPlaces(coords.latitude, coords.longitude, activeQuery);
                      else requestLocation();
                    }}
                    className="border-navy-300 font-semibold gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Search
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty Results (Item 9) */}
        {!isLoadingPlaces && !apiError && hasQueried && places.length === 0 && (
          <div
            className="rounded-2xl border border-navy-100 bg-white p-8 text-center shadow-card"
            data-testid="no-results-card"
          >
            <Building2 className="w-10 h-10 text-navy-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-navy-900">
              No nearby healthcare facilities were found.
            </h4>
            <p className="text-xs text-navy-500 mt-1 max-w-md mx-auto">
              We couldn&apos;t locate facilities matching your search radius. Try searching for a nearby major city name, or call emergency services directly.
            </p>

            <div className="mt-5 flex justify-center gap-3">
              <a href={EMERGENCY_SERVICES_TEL}>
                <Button className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5">
                  <Phone className="w-4 h-4" />
                  Call Emergency Services (112)
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Facility Cards (Item 4, 5, 6, 12) */}
        {!isLoadingPlaces &&
          filteredPlaces.map((place) => (
            <HealthcarePlaceCard key={place.id} place={place} />
          ))}
      </div>
    </div>
  );
}

/**
 * Individual Healthcare Facility Card
 * Displays:
 * - Hospital/provider name
 * - Address
 * - Distance from current location
 * - Open/closed status
 * - Phone number
 * - "Call" button (tel: link)
 * - "Navigate" button (Google Maps directions)
 */
export function HealthcarePlaceCard({ place }: { place: HealthcarePlace }) {
  const isHospital = place.placeType === "hospital" || place.placeType === "emergency_room";
  const isDoctor = place.placeType === "doctor" || place.placeType === "clinic";
  const isPharmacy = place.placeType === "pharmacy";

  // Sanitize phone number for tel: link
  const sanitizedTel = place.phoneNumber ? place.phoneNumber.replace(/[^\d+]/g, "") : null;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-card transition-all duration-200 hover:shadow-elevated ${
        isHospital ? "border-red-200/80 bg-gradient-to-br from-white to-red-50/20" : "border-navy-100"
      }`}
      data-testid="healthcare-place-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Place Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${
                isHospital
                  ? "bg-red-100 text-red-800 border border-red-200"
                  : isDoctor
                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                  : isPharmacy
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-navy-100 text-navy-800 border border-navy-200"
              }`}
            >
              {isHospital && <Building2 className="w-3 h-3" />}
              {isDoctor && <Stethoscope className="w-3 h-3" />}
              {isPharmacy && <Pill className="w-3 h-3" />}
              {place.placeType === "emergency_room"
                ? "Emergency Department"
                : place.placeType.replace("_", " ")}
            </span>

            {/* Open / Closed Status */}
            {place.openNow !== null && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  place.openNow
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                <Clock className="w-3 h-3" />
                {place.openNow ? "Open Now" : "Closed"}
              </span>
            )}

            {/* Distance Badge */}
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-navy-700 bg-navy-50 border border-navy-200 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3 text-red-600" />
              {place.distance}
            </span>
          </div>

          {/* Place Name */}
          <h4 className="text-base sm:text-lg font-bold text-navy-900 leading-snug truncate">
            {place.name}
          </h4>

          {/* Address */}
          {place.address && (
            <p className="text-xs text-navy-600 mt-1 line-clamp-2 leading-relaxed">
              {place.address}
            </p>
          )}

          {/* Phone Display */}
          <div className="mt-2 text-xs text-navy-500 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-navy-400" />
            {place.phoneNumber ? (
              <span className="font-semibold text-navy-800">{place.phoneNumber}</span>
            ) : (
              <span className="italic text-navy-400">Phone not listed</span>
            )}
          </div>
        </div>

        {/* ─── ACTION BUTTONS: CALL & NAVIGATE (Item 4, 5, 6) ─── */}
        <div className="flex items-center sm:flex-col gap-2 shrink-0 pt-2 sm:pt-0">
          {/* Call Button (tel: link) */}
          {sanitizedTel ? (
            <a
              href={`tel:${sanitizedTel}`}
              className="flex-1 sm:w-32"
              data-testid="facility-call-button"
            >
              <Button
                variant="destructive"
                size="sm"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-10 gap-1.5 shadow-sm"
              >
                <Phone className="w-4 h-4 fill-white" />
                Call
              </Button>
            </a>
          ) : (
            <div className="flex-1 sm:w-32">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="w-full opacity-40 cursor-not-allowed text-xs h-10 border-navy-200"
                title="No phone number available"
                data-testid="facility-call-button-disabled"
              >
                No Phone
              </Button>
            </div>
          )}

          {/* Navigate Button (Google Maps) */}
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:w-32"
            data-testid="facility-navigate-button"
          >
            <Button
              variant="outline"
              size="sm"
              className="w-full border-navy-300 hover:bg-navy-50 text-navy-900 font-bold h-10 gap-1.5 shadow-sm"
            >
              <Navigation className="w-4 h-4 text-navy-700" />
              Navigate
              <ExternalLink className="w-3 h-3 text-navy-400 ml-0.5" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
