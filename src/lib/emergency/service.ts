import {
  HealthcarePlace,
  HealthcarePlaceType,
  EmergencyNearbyResponse,
} from './types';

export const EMERGENCY_SERVICES_NUMBER = '112';
export const EMERGENCY_SERVICES_TEL = 'tel:112';

/**
 * Calculates haversine distance in kilometers between two lat/lng points.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats distance into a human-readable string (meters or kilometers).
 */
export function formatDistance(distanceKm: number): string {
  if (isNaN(distanceKm) || distanceKm < 0) return 'Nearby';
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Constructs an official Google Maps navigation URL.
 * Uses Google Maps Directions Universal URL scheme.
 */
export function buildNavigationUrl(
  latitude: number,
  longitude: number,
  placeId?: string,
  name?: string
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
  });
  if (placeId) {
    params.set('destination_place_id', placeId);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Constructs a shareable Google Maps location link.
 */
export function buildLocationMapLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Categorizes a Google Place into a standard HealthcarePlaceType.
 */
export function determinePlaceType(
  primaryType?: string,
  types: string[] = [],
  name: string = ''
): HealthcarePlaceType {
  const lowerName = name.toLowerCase();
  const allTypes = [primaryType || '', ...types].map((t) => t.toLowerCase());

  if (
    allTypes.includes('hospital') ||
    lowerName.includes('hospital') ||
    lowerName.includes('medical college') ||
    lowerName.includes('institute of medical') ||
    lowerName.includes('emergency') ||
    lowerName.includes('trauma')
  ) {
    if (lowerName.includes('emergency') || lowerName.includes('trauma')) {
      return 'emergency_room';
    }
    return 'hospital';
  }

  if (
    allTypes.includes('pharmacy') ||
    allTypes.includes('drugstore') ||
    lowerName.includes('pharmacy') ||
    lowerName.includes('druggist') ||
    lowerName.includes('chemist') ||
    lowerName.includes('medicals')
  ) {
    return 'pharmacy';
  }

  if (
    allTypes.includes('doctor') ||
    allTypes.includes('physician') ||
    lowerName.includes('clinic') ||
    lowerName.includes('polyclinic') ||
    lowerName.includes('dr.') ||
    lowerName.includes('doctor')
  ) {
    return allTypes.includes('doctor') ? 'doctor' : 'clinic';
  }

  return 'healthcare';
}

/**
 * Assigns priority score for sorting:
 * Hospitals/Emergency rooms = 1 (highest)
 * Clinics & Doctors = 2
 * Pharmacies = 3
 * Other = 4
 */
export function getPlaceTypePriority(type: HealthcarePlaceType): number {
  switch (type) {
    case 'emergency_room':
    case 'hospital':
      return 1;
    case 'clinic':
    case 'doctor':
      return 2;
    case 'pharmacy':
      return 3;
    default:
      return 4;
  }
}

/**
 * Normalizes a raw Google Places API (New) place object into a HealthcarePlace.
 */
export function normalizeGooglePlace(
  rawPlace: any,
  userLat?: number,
  userLng?: number
): HealthcarePlace {
  const id = rawPlace.id || `place_${Math.random().toString(36).slice(2, 9)}`;
  const name =
    rawPlace.displayName?.text ||
    rawPlace.displayName ||
    rawPlace.name ||
    'Healthcare Facility';
  const address = rawPlace.formattedAddress || rawPlace.address || '';
  const lat = rawPlace.location?.latitude ?? 0;
  const lng = rawPlace.location?.longitude ?? 0;

  let distanceKm = 0;
  if (userLat !== undefined && userLng !== undefined && lat !== 0 && lng !== 0) {
    distanceKm = calculateDistanceKm(userLat, userLng, lat, lng);
  }

  const distanceMeters = Math.round(distanceKm * 1000);
  const distanceFormatted = formatDistance(distanceKm);

  // Phone number (strip formatting for tel link, keep display as national/intl)
  const rawPhone =
    rawPlace.nationalPhoneNumber ||
    rawPlace.internationalPhoneNumber ||
    rawPlace.phoneNumber ||
    null;

  const openNow =
    rawPlace.currentOpeningHours?.openNow !== undefined
      ? Boolean(rawPlace.currentOpeningHours.openNow)
      : null;

  const placeType = determinePlaceType(
    rawPlace.primaryType,
    rawPlace.types || [],
    name
  );

  const mapsUrl =
    rawPlace.googleMapsUri ||
    buildNavigationUrl(lat, lng, id, name);

  return {
    id,
    name,
    address,
    latitude: lat,
    longitude: lng,
    distance: distanceFormatted,
    distanceMeters,
    phoneNumber: rawPhone ? String(rawPhone).trim() : null,
    openNow,
    placeType,
    mapsUrl,
    rating: typeof rawPlace.rating === 'number' ? rawPlace.rating : undefined,
    userRatingCount:
      typeof rawPlace.userRatingCount === 'number'
        ? rawPlace.userRatingCount
        : undefined,
  };
}

/**
 * Sorts healthcare places:
 * Prioritizes hospitals/emergency departments first, then doctors/clinics, then pharmacies.
 * Within the same category, orders by distance (closest first).
 */
export function prioritizeHealthcarePlaces(places: HealthcarePlace[]): HealthcarePlace[] {
  return [...places].sort((a, b) => {
    const priorityA = getPlaceTypePriority(a.placeType);
    const priorityB = getPlaceTypePriority(b.placeType);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.distanceMeters - b.distanceMeters;
  });
}

/**
 * Queries Google Places API (New) searchNearby endpoint.
 */
export async function queryGooglePlacesNearby(
  latitude: number,
  longitude: number,
  radiusMeters: number = 10000,
  apiKey: string
): Promise<HealthcarePlace[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const requestBody = {
    includedTypes: ['hospital', 'doctor', 'pharmacy'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude,
          longitude,
        },
        radius: Math.min(Math.max(radiusMeters, 1000), 50000),
      },
    },
    rankPreference: 'DISTANCE',
  };

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.currentOpeningHours',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.primaryType',
    'places.types',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
  ].join(',');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = response.statusText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        parsedMessage = parsed.error.message;
      }
    } catch {}
    throw new Error(`Google Places API returned ${response.status}: ${parsedMessage}`);
  }

  const data = await response.json();
  const rawPlaces: any[] = Array.isArray(data.places) ? data.places : [];

  const normalized = rawPlaces.map((p) =>
    normalizeGooglePlace(p, latitude, longitude)
  );

  return prioritizeHealthcarePlaces(normalized);
}

/**
 * Queries Google Places API (New) searchText endpoint for manual locality/city queries.
 */
export async function queryGooglePlacesByText(
  query: string,
  userLat?: number,
  userLng?: number,
  apiKey?: string
): Promise<HealthcarePlace[]> {
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';

  const requestBody: Record<string, any> = {
    textQuery: `hospitals and emergency healthcare in ${query}`,
    maxResultCount: 20,
  };

  if (typeof userLat === 'number' && typeof userLng === 'number') {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: userLat,
          longitude: userLng,
        },
        radius: 25000.0,
      },
    };
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.currentOpeningHours',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.primaryType',
    'places.types',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
  ].join(',');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = response.statusText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        parsedMessage = parsed.error.message;
      }
    } catch {}
    throw new Error(`Google Places API text search returned ${response.status}: ${parsedMessage}`);
  }

  const data = await response.json();
  const rawPlaces: any[] = Array.isArray(data.places) ? data.places : [];

  const normalized = rawPlaces.map((p) =>
    normalizeGooglePlace(p, userLat, userLng)
  );

  return prioritizeHealthcarePlaces(normalized);
}
