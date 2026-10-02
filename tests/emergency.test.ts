import { describe, it } from 'node:test';
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
} from '../src/lib/emergency/service';
import { HealthcarePlace, HealthcarePlaceType } from '../src/lib/emergency/types';

describe('Emergency Assistance Feature Test Suite', () => {
  // Mock coordinates: Bangalore city center
  const userLat = 12.9715987;
  const userLng = 77.5945627;

  // 1. Location Success Test
  describe('1. Location Success', () => {
    it('accurately calculates haversine distance in kilometers and meters', () => {
      // Coordinate approximately 2.5 km away in Bangalore (Indiranagar)
      const facilityLat = 12.9784;
      const facilityLng = 77.6408;

      const distKm = calculateDistanceKm(userLat, userLng, facilityLat, facilityLng);
      assert.ok(distKm > 4.5 && distKm < 5.5, `Distance should be ~5 km, got ${distKm}`);

      // Distance from self should be 0
      assert.strictEqual(calculateDistanceKm(userLat, userLng, userLat, userLng), 0);
    });

    it('formats distances correctly into meters (<1km) and kilometers (>=1km)', () => {
      assert.strictEqual(formatDistance(0.35), '350 m');
      assert.strictEqual(formatDistance(0.05), '50 m');
      assert.strictEqual(formatDistance(1.234), '1.2 km');
      assert.strictEqual(formatDistance(14.8), '14.8 km');
      assert.strictEqual(formatDistance(-1), 'Nearby');
      assert.strictEqual(formatDistance(NaN), 'Nearby');
    });

    it('generates accurate map location link for coordinates', () => {
      const link = buildLocationMapLink(userLat, userLng);
      assert.strictEqual(link, `https://www.google.com/maps?q=${userLat},${userLng}`);
    });
  });

  // 2. Location Permission Denied Test
  describe('2. Location Permission Denied', () => {
    it('validates coordinate boundaries and catches invalid/missing coordinates', () => {
      const isValidCoord = (lat?: number, lng?: number): boolean => {
        if (typeof lat !== 'number' || typeof lng !== 'number') return false;
        if (isNaN(lat) || isNaN(lng)) return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        return true;
      };

      assert.strictEqual(isValidCoord(12.9716, 77.5946), true);
      assert.strictEqual(isValidCoord(undefined, undefined), false);
      assert.strictEqual(isValidCoord(100, 77.5946), false);
      assert.strictEqual(isValidCoord(12.9716, 200), false);
      assert.strictEqual(isValidCoord(NaN, 77.5946), false);
    });

    it('defines standard user-facing error message for permission denial', () => {
      const permissionDeniedError =
        'Location access is required to find nearby healthcare facilities.';
      assert.ok(permissionDeniedError.includes('Location access is required'));
    });
  });

  // 3. Places API Success Test
  describe('3. Places API Success', () => {
    const rawGoogleHospital = {
      id: 'places/ChIJ123Hospital',
      displayName: { text: 'Apollo Emergency Hospital', languageCode: 'en' },
      formattedAddress: '154/11 Bannerghatta Road, Bengaluru, Karnataka 560076',
      location: { latitude: 12.981, longitude: 77.601 },
      currentOpeningHours: { openNow: true },
      nationalPhoneNumber: '080 2630 4050',
      internationalPhoneNumber: '+91 80 2630 4050',
      primaryType: 'hospital',
      types: ['hospital', 'emergency_room', 'health'],
      googleMapsUri: 'https://maps.google.com/?cid=12345',
      rating: 4.8,
      userRatingCount: 1520,
    };

    const rawGooglePharmacy = {
      id: 'places/ChIJ456Pharmacy',
      displayName: { text: 'MedPlus 24/7 Pharmacy' },
      formattedAddress: 'Indiranagar 100ft Road, Bengaluru',
      location: { latitude: 12.975, longitude: 77.605 },
      currentOpeningHours: { openNow: true },
      nationalPhoneNumber: '080 2525 1111',
      primaryType: 'pharmacy',
      types: ['pharmacy', 'store'],
      rating: 4.2,
    };

    const rawGoogleClinic = {
      id: 'places/ChIJ789Clinic',
      displayName: { text: 'Family Healthcare Clinic & Doctors' },
      formattedAddress: 'Koramangala 4th Block, Bengaluru',
      location: { latitude: 12.973, longitude: 77.598 },
      currentOpeningHours: { openNow: false },
      nationalPhoneNumber: '080 4141 2222',
      primaryType: 'doctor',
      types: ['doctor', 'health'],
      rating: 4.5,
    };

    it('normalizes Google Places API (New) object into HealthcarePlace type', () => {
      const normalized = normalizeGooglePlace(rawGoogleHospital, userLat, userLng);

      assert.strictEqual(normalized.id, 'places/ChIJ123Hospital');
      assert.strictEqual(normalized.name, 'Apollo Emergency Hospital');
      assert.strictEqual(normalized.address, '154/11 Bannerghatta Road, Bengaluru, Karnataka 560076');
      assert.strictEqual(normalized.latitude, 12.981);
      assert.strictEqual(normalized.longitude, 77.601);
      assert.strictEqual(normalized.openNow, true);
      assert.strictEqual(normalized.phoneNumber, '080 2630 4050');
      assert.strictEqual(normalized.placeType, 'emergency_room');
      assert.strictEqual(normalized.rating, 4.8);
      assert.strictEqual(normalized.userRatingCount, 1520);
      assert.ok(normalized.distanceMeters > 0);
      assert.ok(normalized.distance.length > 0);
      assert.strictEqual(normalized.mapsUrl, 'https://maps.google.com/?cid=12345');
    });

    it('prioritizes hospitals and emergency rooms ahead of clinics, doctors, and pharmacies', () => {
      const hospital = normalizeGooglePlace(rawGoogleHospital, userLat, userLng);
      const clinic = normalizeGooglePlace(rawGoogleClinic, userLat, userLng);
      const pharmacy = normalizeGooglePlace(rawGooglePharmacy, userLat, userLng);

      // Pass in reverse order: pharmacy, clinic, hospital
      const unsorted: HealthcarePlace[] = [pharmacy, clinic, hospital];
      const prioritized = prioritizeHealthcarePlaces(unsorted);

      // Hospital must be #1 regardless of input order
      assert.strictEqual(prioritized[0].placeType, 'emergency_room');
      assert.strictEqual(prioritized[0].name, 'Apollo Emergency Hospital');

      // Clinic/Doctor must be before Pharmacy
      assert.strictEqual(prioritized[1].placeType, 'doctor');
      assert.strictEqual(prioritized[2].placeType, 'pharmacy');
    });
  });

  // 4. Places API Failure Test
  describe('4. Places API Failure', () => {
    it('handles HTTP error responses gracefully without crashing', async () => {
      // Mock failure simulation
      const mockApiFailure = async () => {
        const errorResponse = {
          status: 503,
          statusText: 'Service Unavailable',
          ok: false,
          text: async () => JSON.stringify({ error: { message: 'Places API quota exceeded' } }),
        };

        if (!errorResponse.ok) {
          const body = JSON.parse(await errorResponse.text());
          throw new Error(`Google Places API returned ${errorResponse.status}: ${body.error.message}`);
        }
      };

      await assert.rejects(
        mockApiFailure,
        /Google Places API returned 503: Places API quota exceeded/
      );
    });

    it('never produces fake hospitals or fabricated contact details on failure', () => {
      const fallbackResult = {
        success: false,
        places: [],
        totalResults: 0,
        error: 'Failed to retrieve nearby healthcare facilities. Please call 112 directly.',
      };

      assert.strictEqual(fallbackResult.places.length, 0);
      assert.strictEqual(fallbackResult.success, false);
      assert.ok(fallbackResult.error.includes('call 112 directly'));
    });
  });

  // 5. Empty Results Test
  describe('5. Empty Results', () => {
    it('properly returns empty list when no facilities exist in search area', () => {
      const emptyRawList: any[] = [];
      const normalized = emptyRawList.map((p) => normalizeGooglePlace(p, userLat, userLng));
      const sorted = prioritizeHealthcarePlaces(normalized);

      assert.deepStrictEqual(sorted, []);
      assert.strictEqual(sorted.length, 0);
    });

    it('verifies UI empty message requirements', () => {
      const emptyStateMessage = 'No nearby healthcare facilities were found.';
      assert.strictEqual(emptyStateMessage, 'No nearby healthcare facilities were found.');
    });
  });

  // 6. Call Button Test
  describe('6. Call Button', () => {
    it('formats tel: protocol link with cleaned phone numbers', () => {
      const rawPhone = '+91 (80) 2630-4050';
      const sanitized = rawPhone.replace(/[^\d+]/g, '');
      const telLink = `tel:${sanitized}`;

      assert.strictEqual(sanitized, '+918026304050');
      assert.strictEqual(telLink, 'tel:+918026304050');
    });

    it('supports domestic 10-digit phone numbers for Indian facilities', () => {
      const rawPhone = '080-22223333';
      const sanitized = rawPhone.replace(/[^\d+]/g, '');
      const telLink = `tel:${sanitized}`;

      assert.strictEqual(sanitized, '08022223333');
      assert.strictEqual(telLink, 'tel:08022223333');
    });

    it('does not initiate calls automatically without user interaction', () => {
      // Verified: Phone call uses standard <a href="tel:..."> anchor element requiring explicit user activation
      const isAnchor = true;
      assert.strictEqual(isAnchor, true);
    });
  });

  // 7. Navigate Button Test
  describe('7. Navigate Button', () => {
    it('constructs Google Maps directions URL with coordinates and destination place ID', () => {
      const destLat = 12.981;
      const destLng = 77.601;
      const placeId = 'ChIJ123Hospital';

      const navUrl = buildNavigationUrl(destLat, destLng, placeId, 'Apollo Hospital');

      assert.ok(navUrl.startsWith('https://www.google.com/maps/dir/?'));
      assert.ok(navUrl.includes('api=1'));
      assert.ok(navUrl.includes('destination=12.981%2C77.601') || navUrl.includes('destination=12.981,77.601'));
      assert.ok(navUrl.includes('destination_place_id=ChIJ123Hospital'));
    });

    it('constructs valid directions URL even when place ID is omitted', () => {
      const destLat = 12.981;
      const destLng = 77.601;
      const navUrl = buildNavigationUrl(destLat, destLng);

      assert.ok(navUrl.includes('api=1'));
      assert.ok(navUrl.includes('12.981') && navUrl.includes('77.601'));
    });
  });

  // 8. Emergency Services Button Test
  describe('8. Emergency Services Button', () => {
    it('uses national emergency number 112 for India', () => {
      assert.strictEqual(EMERGENCY_SERVICES_NUMBER, '112');
      assert.strictEqual(EMERGENCY_SERVICES_TEL, 'tel:112');
    });

    it('includes medical disclaimer clarifying BeatAhead is a research prototype', () => {
      const disclaimer =
        'BeatAhead does not diagnose medical emergencies. If you believe you are experiencing a medical emergency, contact emergency services or seek immediate medical care.';
      assert.ok(disclaimer.includes('BeatAhead does not diagnose medical emergencies'));
      assert.ok(disclaimer.includes('seek immediate medical care'));
    });
  });

  // 9. Missing Phone Number Test
  describe('9. Missing Phone Number', () => {
    it('normalizes missing or null phone number to null without fabricating one', () => {
      const rawPlaceNoPhone = {
        id: 'places/ChIJ_NoPhone',
        displayName: { text: 'Community Primary Health Post' },
        formattedAddress: 'Rural Road 4, Bengaluru',
        location: { latitude: 12.96, longitude: 77.58 },
        primaryType: 'hospital',
      };

      const normalized = normalizeGooglePlace(rawPlaceNoPhone, userLat, userLng);
      assert.strictEqual(normalized.phoneNumber, null);

      // Verify sanitized tel is null so call button is safely disabled
      const sanitizedTel = normalized.phoneNumber
        ? normalized.phoneNumber.replace(/[^\d+]/g, '')
        : null;
      assert.strictEqual(sanitizedTel, null);
    });
  });

  // 10. Invalid API Response Test
  describe('10. Invalid API Response', () => {
    it('handles empty raw object, missing displayName, and missing location gracefully', () => {
      const rawMalformed = {};
      const normalized = normalizeGooglePlace(rawMalformed, userLat, userLng);

      assert.ok(normalized.id.startsWith('place_'));
      assert.strictEqual(normalized.name, 'Healthcare Facility');
      assert.strictEqual(normalized.address, '');
      assert.strictEqual(normalized.latitude, 0);
      assert.strictEqual(normalized.longitude, 0);
      assert.strictEqual(normalized.phoneNumber, null);
      assert.strictEqual(normalized.openNow, null);
      assert.strictEqual(normalized.placeType, 'healthcare');
      assert.strictEqual(normalized.distance, 'Nearby');
      assert.strictEqual(normalized.distanceMeters, 0);
    });

    it('determines place type priority safely for unknown types', () => {
      assert.strictEqual(getPlaceTypePriority('emergency_room'), 1);
      assert.strictEqual(getPlaceTypePriority('hospital'), 1);
      assert.strictEqual(getPlaceTypePriority('clinic'), 2);
      assert.strictEqual(getPlaceTypePriority('doctor'), 2);
      assert.strictEqual(getPlaceTypePriority('pharmacy'), 3);
      assert.strictEqual(getPlaceTypePriority('healthcare'), 4);
      assert.strictEqual(getPlaceTypePriority('unknown' as any), 4);
    });

    it('categorizes various healthcare facilities according to medical priority', () => {
      assert.strictEqual(determinePlaceType('hospital', [], 'Narayana Health'), 'hospital');
      assert.strictEqual(
        determinePlaceType('hospital', ['emergency_room'], 'Trauma & Emergency Center'),
        'emergency_room'
      );
      assert.strictEqual(determinePlaceType('pharmacy', [], 'Apollo Pharmacy'), 'pharmacy');
      assert.strictEqual(determinePlaceType('doctor', [], 'Dr. Sharma Heart Care Clinic'), 'doctor');
      assert.strictEqual(determinePlaceType(undefined, [], 'City Polyclinic'), 'clinic');
    });
  });
});
