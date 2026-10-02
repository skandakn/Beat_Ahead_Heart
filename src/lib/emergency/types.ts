/**
 * Types for BeatAhead Emergency Assistance feature.
 * Connects users to nearby hospitals, emergency departments, clinics, doctors, and pharmacies.
 */

export type HealthcarePlaceType =
  | 'hospital'
  | 'emergency_room'
  | 'clinic'
  | 'doctor'
  | 'pharmacy'
  | 'healthcare';

export interface HealthcarePlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: string;
  distanceMeters: number;
  phoneNumber: string | null;
  openNow: boolean | null;
  placeType: HealthcarePlaceType;
  mapsUrl: string;
  rating?: number;
  userRatingCount?: number;
}

export interface EmergencyNearbyRequest {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  query?: string;
  typeFilter?: 'all' | 'hospital' | 'doctor' | 'pharmacy';
}

export interface EmergencyNearbyResponse {
  success: boolean;
  places: HealthcarePlace[];
  error?: string;
  source?: 'google_places' | 'fallback_search';
  totalResults: number;
}

export type GeolocationState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout';
