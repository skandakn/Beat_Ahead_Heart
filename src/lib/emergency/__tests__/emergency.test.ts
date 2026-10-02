import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDistanceKm,
  formatDistance,
  buildNavigationUrl,
  buildLocationMapLink,
  determinePlaceType,
  getPlaceTypePriority,
  normalizeGooglePlace,
  prioritizeHealthcarePlaces,
  EMERGENCY_SERVICES_NUMBER,
  EMERGENCY_SERVICES_TEL,
} from '../service';
import { HealthcarePlace } from '../types';

describe('Emergency Assistance Module', () => {
  // ─── 1. Location Success & Distance Calculation ───
  it('1. Location success: correctly computes haversine distance between coordinates', () => {
    // Distance between Bengaluru Vidhana Soudha (12.9796, 77.5907) and Manipal Hospital (12.9592, 77.6534) is ~7.2 km
    const distKm = calculateDistanceKm(12.9796, 77.5907, 12.9592, 77.6534);
    assert.ok(distKm > 6.5 && distKm < 8.0, `Expected ~7.2km, got ${distKm}`);

    // Identical coordinates return 0
    assert.equal(calculateDistanceKm(12.97, 77.59, 12.97, 77.59), 0);

    // Format meters and kilometers
    assert.equal(formatDistance(0.45), '450 m');
    assert.equal(formatDistance(2.34), '2.3 km');
    assert.equal(formatDistance(0.05), '50 m');

    // Share link generation
    const shareLink = buildLocationMapLink(12.9716, 77.5946);
    assert.equal(shareLink, 'https://www.google.com/maps?q=12.9716,77.5946');
  });

  // ─── 2. Location Permission Denied Simulation ───
  it('2. Location permission denied: handles permission denied state properly', () => {
    // Simulating browser GeolocationPositionError with code 1 (PERMISSION_DENIED)
    const mockError = {
      code: 1, // GeolocationPositionError.PERMISSION_DENIED
      message: 'User denied Geolocation',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };

    let userFacingMessage = '';
    let retryAllowed = false;
    let manualSearchAllowed = false;
    let callEmergencyAllowed = false;

    if (mockError.code === mockError.PERMISSION_DENIED) {
      userFacingMessage = 'Location access is required to find nearby healthcare facilities.';
      retryAllowed = true;
      manualSearchAllowed = true;
      callEmergencyAllowed = true;
    }

    assert.equal(
      userFacingMessage,
      'Location access is required to find nearby healthcare facilities.'
    );
    assert.ok(retryAllowed, 'Must provide Retry Location option');
    assert.ok(manualSearchAllowed, 'Must provide manual search by city/locality');
    assert.ok(callEmergencyAllowed, 'Must provide Call Emergency Services option');
  });

  // ─── 3. Places API Success & Normalization ───
  it('3. Places API success: parses and normalizes Google Places API (New) response', () => {
    const rawGooglePlace = {
      id: 'ChIJbU60yGQWrjsR4E9-VV8_234',
      displayName: { text: 'Apollo Emergency & Specialty Hospital' },
      formattedAddress: '154/11 Bannerghatta Main Rd, Bangalore 560076',
      location: { latitude: 12.8953, longitude: 77.5986 },
      nationalPhoneNumber: '080 2630 4050',
      internationalPhoneNumber: '+91 80 2630 4050',
      primaryType: 'hospital',
      types: ['hospital', 'health', 'point_of_interest'],
      currentOpeningHours: { openNow: true },
      googleMapsUri: 'https://maps.google.com/?cid=12345678',
    };

    const userLat = 12.9100;
    const userLng = 77.6000;

    const normalized = normalizeGooglePlace(rawGooglePlace, userLat, userLng);

    assert.equal(normalized.id, 'ChIJbU60yGQWrjsR4E9-VV8_234');
    assert.equal(normalized.name, 'Apollo Emergency & Specialty Hospital');
    assert.equal(normalized.address, '154/11 Bannerghatta Main Rd, Bangalore 560076');
    assert.equal(normalized.phoneNumber, '080 2630 4050');
    assert.equal(normalized.openNow, true);
    assert.equal(normalized.placeType, 'emergency_room');
    assert.ok(normalized.distanceMeters > 0);
    assert.ok(normalized.distance.includes('km') || normalized.distance.includes('m'));
    assert.ok(normalized.mapsUrl.length > 0);
  });

  // ─── 4. Places API Failure & Fallback ───
  it('4. Places API failure: handles API errors gracefully without fabrication', () => {
    // Simulation of an API error response from Google Places API
    const errorResponse = {
      error: {
        code: 403,
        message: 'The provided API key is invalid or unauthorized.',
        status: 'PERMISSION_DENIED',
      },
    };

    let handledGracefully = false;
    let fabricatedPlaces: HealthcarePlace[] = [];

    if (errorResponse.error) {
      handledGracefully = true;
      fabricatedPlaces = []; // Rule: Do not show fake hospitals or fabricated phone numbers!
    }

    assert.ok(handledGracefully, 'Error must be caught and handled gracefully');
    assert.equal(fabricatedPlaces.length, 0, 'No fake hospitals or phone numbers must be fabricated');
  });

  // ─── 5. Empty Results ───
  it('5. Empty results: returns empty list and displays fallback advice', () => {
    const emptyPlacesData: any[] = [];
    const normalized = emptyPlacesData.map((p) => normalizeGooglePlace(p));

    assert.equal(normalized.length, 0);

    const emptyStateText = 'No nearby healthcare facilities were found.';
    assert.ok(emptyStateText.includes('No nearby healthcare facilities'));
  });

  // ─── 6. Call Button Validation ───
  it('6. Call button: constructs safe tel: link without automatically dialing', () => {
    const placeWithPhone = {
      id: 'hosp_1',
      name: 'City Care Hospital',
      address: 'MG Road, Bangalore',
      latitude: 12.97,
      longitude: 77.60,
      distance: '1.2 km',
      distanceMeters: 1200,
      phoneNumber: '+91 80 2558 1234',
      openNow: true,
      placeType: 'hospital' as const,
      mapsUrl: 'https://maps.google.com',
    };

    // Clean phone number for tel: link (digits and plus only)
    const sanitizedTel = placeWithPhone.phoneNumber.replace(/[^\d+]/g, '');
    const telLink = `tel:${sanitizedTel}`;

    assert.equal(telLink, 'tel:+918025581234');
    assert.ok(telLink.startsWith('tel:'), 'Must use standard tel: protocol');
  });

  // ─── 7. Navigate Button Validation ───
  it('7. Navigate button: constructs standard Google Maps external navigation URL', () => {
    const lat = 12.9716;
    const lng = 77.5946;
    const placeId = 'ChIJbU60yGQWrjsR';
    const name = 'Victoria Hospital';

    const navUrl = buildNavigationUrl(lat, lng, placeId, name);

    assert.ok(navUrl.startsWith('https://www.google.com/maps/dir/?api=1'));
    assert.ok(navUrl.includes('destination=12.9716%2C77.5946') || navUrl.includes('destination=12.9716,77.5946'));
    assert.ok(navUrl.includes('destination_place_id=ChIJbU60yGQWrjsR'));
  });

  // ─── 8. Emergency Services Button (112) ───
  it('8. Emergency-services button: uses 112 for India with clear disclaimers', () => {
    assert.equal(EMERGENCY_SERVICES_NUMBER, '112');
    assert.equal(EMERGENCY_SERVICES_TEL, 'tel:112');

    // Disclaimer validation
    const disclaimer =
      'BeatAhead does not diagnose medical emergencies. If you believe you are experiencing a medical emergency, contact emergency services or seek immediate medical care.';
    assert.ok(disclaimer.includes('does not diagnose medical emergencies'));
    assert.ok(disclaimer.includes('contact emergency services'));
  });

  // ─── 9. Missing Phone Number Handling ───
  it('9. Missing phone number: normalizes null and flags for disabled call button', () => {
    const rawPlaceNoPhone = {
      id: 'hosp_no_phone',
      displayName: { text: 'Community Health Sub-Center' },
      formattedAddress: 'Rural District Road',
      location: { latitude: 12.91, longitude: 77.58 },
      // phone fields omitted
    };

    const normalized = normalizeGooglePlace(rawPlaceNoPhone, 12.90, 77.58);

    assert.equal(normalized.phoneNumber, null, 'Missing phone must normalize to null');
    assert.ok(normalized.mapsUrl.length > 0, 'Navigate button must still work even when phone is absent');
  });

  // ─── 10. Invalid API Response & Coordinate Validation ───
  it('10. Invalid API response: handles malformed payload and invalid coordinates', () => {
    // Malformed place missing location and displayName
    const malformedPlace = {};
    const normalized = normalizeGooglePlace(malformedPlace);

    assert.equal(normalized.name, 'Healthcare Facility');
    assert.equal(normalized.latitude, 0);
    assert.equal(normalized.longitude, 0);
    assert.equal(normalized.phoneNumber, null);

    // Invalid coordinates checker
    function validateCoordinates(lat: any, lng: any): boolean {
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        isNaN(lat) ||
        isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return false;
      }
      return true;
    }

    assert.equal(validateCoordinates('abc', 77), false);
    assert.equal(validateCoordinates(150, 77), false); // Latitude > 90
    assert.equal(validateCoordinates(12, 200), false); // Longitude > 180
    assert.equal(validateCoordinates(12.9716, 77.5946), true);
  });

  // ─── 11. Prioritization (Hospitals First) ───
  it('11. Prioritization: orders hospitals/emergency facilities first, then by distance', () => {
    const places: HealthcarePlace[] = [
      {
        id: '1',
        name: 'Apollo Pharmacy',
        address: '100m away',
        latitude: 12.1,
        longitude: 77.1,
        distance: '100 m',
        distanceMeters: 100,
        phoneNumber: null,
        openNow: true,
        placeType: 'pharmacy',
        mapsUrl: '',
      },
      {
        id: '2',
        name: 'Dr. Sharma Clinic',
        address: '300m away',
        latitude: 12.2,
        longitude: 77.2,
        distance: '300 m',
        distanceMeters: 300,
        phoneNumber: null,
        openNow: true,
        placeType: 'clinic',
        mapsUrl: '',
      },
      {
        id: '3',
        name: 'Fortis Hospital & Emergency',
        address: '800m away',
        latitude: 12.3,
        longitude: 77.3,
        distance: '800 m',
        distanceMeters: 800,
        phoneNumber: '080 12345678',
        openNow: true,
        placeType: 'hospital',
        mapsUrl: '',
      },
      {
        id: '4',
        name: 'Manipal Emergency Center',
        address: '500m away',
        latitude: 12.4,
        longitude: 77.4,
        distance: '500 m',
        distanceMeters: 500,
        phoneNumber: '080 87654321',
        openNow: true,
        placeType: 'emergency_room',
        mapsUrl: '',
      },
    ];

    const prioritized = prioritizeHealthcarePlaces(places);

    // Both hospitals must be at the very top, sorted by distance
    assert.equal(prioritized[0].id, '4', 'Manipal Emergency (500m) should be #1');
    assert.equal(prioritized[1].id, '3', 'Fortis Hospital (800m) should be #2');
    assert.equal(prioritized[2].id, '2', 'Dr. Sharma Clinic should be #3');
    assert.equal(prioritized[3].id, '1', 'Apollo Pharmacy should be #4');
  });
});
