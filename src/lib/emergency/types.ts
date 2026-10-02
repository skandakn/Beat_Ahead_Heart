/**
 * Types for BeatAhead Emergency Assistance feature.
 * Connects users to nearby hospitals, emergency facilities, clinics, doctors, and pharmacies
 * using OpenStreetMap Overpass API (Free, no API key required).
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
  openingHours?: string | null;
  placeType: HealthcarePlaceType;
  mapsUrl: string;
  rating?: number;
  userRatingCount?: number;
  source?: 'openstreetmap' | 'google_places';
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
  source?: 'openstreetmap' | 'cache';
  totalResults: number;
  attribution?: string;
}

export type GeolocationState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout';
