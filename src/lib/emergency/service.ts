import {
  HealthcarePlace,
  HealthcarePlaceType,
} from './types';

export const EMERGENCY_SERVICES_NUMBER = '112';
export const EMERGENCY_SERVICES_TEL = 'tel:112';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

// Overpass API mirrors for high availability and failover (fastest/most reliable first)
const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

// In-memory cache to respect Overpass usage policies (10-minute TTL)
interface CacheEntry {
  timestamp: number;
  places: HealthcarePlace[];
}
const overpassCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Calculates Haversine distance in kilometers between two lat/lng coordinates locally.
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
 * Constructs an official Google Maps navigation URL without using Google Maps API.
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
 * Assembles a clean, readable address from OpenStreetMap tags.
 */
export function formatOsmAddress(tags: Record<string, any> = {}): string {
  if (tags['addr:full']) {
    return String(tags['addr:full']).trim();
  }

  const parts: string[] = [];
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }

  if (tags['addr:suburb']) {
    parts.push(tags['addr:suburb']);
  } else if (tags['addr:neighbourhood']) {
    parts.push(tags['addr:neighbourhood']);
  }

  if (tags['addr:city']) {
    parts.push(tags['addr:city']);
  } else if (tags['addr:district']) {
    parts.push(tags['addr:district']);
  }

  if (tags['addr:postcode']) {
    parts.push(tags['addr:postcode']);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  if (tags['addr:place']) {
    return String(tags['addr:place']);
  }

  return '';
}

/**
 * Extracts phone number from OpenStreetMap tags.
 */
export function extractOsmPhone(tags: Record<string, any> = {}): string | null {
  const phone =
    tags.phone ||
    tags['contact:phone'] ||
    tags['emergency:phone'] ||
    tags.telephone ||
    tags.mobile ||
    tags['contact:mobile'] ||
    null;

  if (!phone) return null;
  return String(phone).trim();
}

/**
 * Categorizes healthcare facility into standard HealthcarePlaceType.
 */
export function determinePlaceType(
  primaryType?: string,
  types: string[] = [],
  name: string = ''
): HealthcarePlaceType {
  const lowerName = name.toLowerCase();
  const allTypes = [primaryType || '', ...types].map((t) => t.toLowerCase());

  if (
    allTypes.includes('emergency_room') ||
    lowerName.includes('emergency') ||
    lowerName.includes('trauma')
  ) {
    return 'emergency_room';
  }

  // Doctor check: if typed as doctor or name starts with Dr. / Dr
  if (
    allTypes.includes('doctor') ||
    allTypes.includes('doctors') ||
    lowerName.startsWith('dr.') ||
    lowerName.includes('dr. ') ||
    (lowerName.includes('doctor') && !lowerName.includes('hospital'))
  ) {
    return 'doctor';
  }

  // Clinic check
  if (
    allTypes.includes('clinic') ||
    lowerName.includes('polyclinic') ||
    (lowerName.includes('clinic') && !lowerName.includes('hospital'))
  ) {
    return 'clinic';
  }

  // Pharmacy check
  if (
    allTypes.includes('pharmacy') ||
    lowerName.includes('pharmacy') ||
    lowerName.includes('chemist') ||
    lowerName.includes('druggist') ||
    lowerName.includes('medicals')
  ) {
    return 'pharmacy';
  }

  // Hospital check
  if (
    allTypes.includes('hospital') ||
    lowerName.includes('hospital') ||
    lowerName.includes('medical college') ||
    lowerName.includes('institute of medical') ||
    lowerName.includes('cardiac') ||
    lowerName.includes('heart')
  ) {
    return 'hospital';
  }

  return 'healthcare';
}

/**
 * Categorizes an OpenStreetMap element into standard HealthcarePlaceType.
 */
export function determineOsmPlaceType(
  tags: Record<string, any> = {},
  name: string = ''
): HealthcarePlaceType {
  const primary = tags.amenity || tags.healthcare || '';
  const types = [
    tags.amenity,
    tags.healthcare,
    tags.emergency === 'yes' ? 'emergency_room' : '',
  ].filter(Boolean);
  return determinePlaceType(primary, types, name);
}

/**
 * Assigns priority score for sorting:
 * Hospitals / Emergency rooms = 1 (highest priority)
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
 * Normalizes an OpenStreetMap Overpass element into a clean HealthcarePlace.
 */
export function normalizeOsmElement(
  element: any,
  userLat?: number,
  userLon?: number
): HealthcarePlace | null {
  if (!element) return null;

  const tags = element.tags || {};

  // Resolve coordinates: nodes have lat/lon; ways/relations have center.lat/center.lon
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }

  // Resolve name
  let name =
    tags.name ||
    tags['name:en'] ||
    tags.int_name ||
    tags.operator ||
    tags.brand ||
    '';

  const placeType = determineOsmPlaceType(tags, name);

  if (!name) {
    switch (placeType) {
      case 'emergency_room':
        name = 'Emergency Care Facility';
        break;
      case 'hospital':
        name = 'Hospital / Medical Center';
        break;
      case 'clinic':
        name = 'Medical Clinic';
        break;
      case 'doctor':
        name = "Doctor's Clinic";
        break;
      case 'pharmacy':
        name = 'Pharmacy';
        break;
      default:
        name = 'Healthcare Facility';
    }
  }

  const address = formatOsmAddress(tags);
  const phoneNumber = extractOsmPhone(tags);

  let distanceKm = 0;
  if (userLat !== undefined && userLon !== undefined) {
    distanceKm = calculateDistanceKm(userLat, userLon, lat, lon);
  }

  const distanceMeters = Math.round(distanceKm * 1000);
  const distanceFormatted = formatDistance(distanceKm);

  const openingHours = tags.opening_hours ? String(tags.opening_hours) : null;
  const openNow = openingHours === '24/7' ? true : null;

  const id = `osm_${element.type || 'node'}_${element.id || Math.random().toString(36).slice(2, 8)}`;
  const mapsUrl = buildNavigationUrl(lat, lon, id, name);

  return {
    id,
    name,
    address,
    latitude: lat,
    longitude: lon,
    distance: distanceFormatted,
    distanceMeters,
    phoneNumber,
    openNow,
    openingHours,
    placeType,
    mapsUrl,
    cardiacCare: isCardiacCareOsmElement(element),
    source: 'openstreetmap',
  };
}

function isCardiacCareOsmElement(element: any): boolean {
  const tags = element?.tags ?? {};
  const amenity = String(tags.amenity ?? '').toLowerCase();
  if (!['hospital', 'clinic', 'doctors'].includes(amenity)) return false;

  const specialties = [
    tags['healthcare:speciality'],
    tags['healthcare:specialty'],
    tags.speciality,
    tags.specialty,
    tags.healthcare,
  ].filter(Boolean).join(' ').toLowerCase();
  const name = [tags.name, tags.brand, tags.operator].filter(Boolean).join(' ').toLowerCase();

  return /cardio|cardiac|heart/.test(specialties) || /cardio|cardiac|heart/.test(name);
}

/**
 * Normalizes raw Google Places API (New) object into a HealthcarePlace.
 */
export function normalizeGooglePlace(
  rawPlace: any = {},
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
  const lat = rawPlace.location?.latitude ?? rawPlace.lat ?? 0;
  const lng = rawPlace.location?.longitude ?? rawPlace.lng ?? rawPlace.lon ?? 0;

  const hasCoords =
    (rawPlace.location?.latitude !== undefined || rawPlace.lat !== undefined) &&
    (rawPlace.location?.longitude !== undefined || rawPlace.lng !== undefined || rawPlace.lon !== undefined);

  let distanceKm = -1;
  let distanceMeters = 0;
  if (hasCoords && userLat !== undefined && userLng !== undefined) {
    distanceKm = calculateDistanceKm(userLat, userLng, lat, lng);
    distanceMeters = Math.round(distanceKm * 1000);
  }

  const distanceFormatted = formatDistance(distanceKm);

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
    source: 'google_places',
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
 * Queries OpenStreetMap Overpass API for nearby healthcare facilities within radiusKm (~10 km).
 * Uses fast spatial bounding box indexing and automatic multi-mirror failover.
 */
export async function queryOverpassNearby(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
): Promise<HealthcarePlace[]> {
  // Check in-memory cache
  const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}_${radiusKm}`;
  const cached = overpassCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.places;
  }

  // Calculate radius in meters (capped at 8km to guarantee fast Overpass execution <3s)
  const safeRadiusKm = Math.min(Math.max(radiusKm, 1), 25);
  const radiusMeters = Math.round(Math.min(safeRadiusKm * 1000, 8000));

  const query = `[out:json][timeout:10];
(
  node["amenity"="hospital"](around:${radiusMeters},${latitude},${longitude});
  node["amenity"="clinic"](around:${radiusMeters},${latitude},${longitude});
  node["amenity"="doctors"](around:${radiusMeters},${latitude},${longitude});
  node["amenity"="pharmacy"](around:${radiusMeters},${latitude},${longitude});
  way["amenity"="hospital"](around:${radiusMeters},${latitude},${longitude});
  way["amenity"="clinic"](around:${radiusMeters},${latitude},${longitude});
  way["amenity"="pharmacy"](around:${radiusMeters},${latitude},${longitude});
);
out center tags 50;`;

  let lastError: Error | null = null;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'BeatAhead-EmergencyAssistance/1.0 (Emergency healthcare directory; https://beat-ahead.vercel.app; skanda.kn@gmail.com)',
          Accept: 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(6000), // 6-second failover timeout
      });

      if (!response.ok) {
        throw new Error(`Mirror ${mirror} returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawElements: any[] = Array.isArray(data.elements) ? data.elements : [];

      const normalized: HealthcarePlace[] = [];
      for (const el of rawElements) {
        const place = normalizeOsmElement(el, latitude, longitude);
        if (place) {
          // Verify element is within radius
          const distKm = place.distanceMeters / 1000;
          if (distKm <= safeRadiusKm * 1.2) {
            normalized.push(place);
          }
        }
      }

      const prioritized = prioritizeHealthcarePlaces(normalized);

      // Cache result
      overpassCache.set(cacheKey, {
        timestamp: Date.now(),
        places: prioritized,
      });

      // Keep cache size bounded
      if (overpassCache.size > 200) {
        const oldestKey = overpassCache.keys().next().value;
        if (oldestKey) overpassCache.delete(oldestKey);
      }

      return prioritized;
    } catch (err: any) {
      lastError = err;
      // Try next mirror
    }
  }

  throw new Error(
    `OpenStreetMap Overpass API is currently unavailable: ${lastError?.message || 'Gateway Timeout'}. Please use the direct Call Emergency Services (112) option.`
  );
}

/**
 * Searches OpenStreetMap Overpass by text query (hospital name, locality or city).
 */
export async function queryOverpassByText(
  queryText: string,
  userLat?: number,
  userLon?: number
): Promise<HealthcarePlace[]> {
  const sanitized = queryText.replace(/[^\w\s-]/g, '').trim();
  if (!sanitized) return [];

  // If user coordinates are available, fetch nearby and filter locally first
  if (typeof userLat === 'number' && typeof userLon === 'number') {
    try {
      const nearby = await queryOverpassNearby(userLat, userLon, 15);
      const qLower = sanitized.toLowerCase();
      const matched = nearby.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          p.address.toLowerCase().includes(qLower)
      );
      if (matched.length > 0) return matched;
    } catch {}
  }

  // Name search on Overpass
  const query = `[out:json][timeout:10];
(
  node["amenity"~"hospital|clinic|doctors|pharmacy"]["name"~"${sanitized}",i];
  way["amenity"~"hospital|clinic|doctors|pharmacy"]["name"~"${sanitized}",i];
);
out center tags 30;`;

  let lastError: Error | null = null;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'BeatAhead-EmergencyAssistance/1.0 (Emergency healthcare directory; https://beat-ahead.vercel.app; skanda.kn@gmail.com)',
          Accept: 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawElements: any[] = Array.isArray(data.elements) ? data.elements : [];

      const normalized: HealthcarePlace[] = [];
      for (const el of rawElements) {
        const place = normalizeOsmElement(el, userLat, userLon);
        if (place) normalized.push(place);
      }

      return prioritizeHealthcarePlaces(normalized);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(
    `Overpass text search unavailable: ${lastError?.message || 'Network error'}`
  );
}
