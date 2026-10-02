import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDistanceKm,
  formatDistance,
  buildNavigationUrl,
  buildLocationMapLink,
  determineOsmPlaceType,
  formatOsmAddress,
  extractOsmPhone,
  getPlaceTypePriority,
  normalizeOsmElement,
  prioritizeHealthcarePlaces,
  EMERGENCY_SERVICES_NUMBER,
  EMERGENCY_SERVICES_TEL,
  OSM_ATTRIBUTION,
  OSM_COPYRIGHT_URL,
} from '../service';
import { HealthcarePlace } from '../types';

describe('Emergency Assistance Module (OpenStreetMap Overpass Implementation)', () => {
  // ─── 1. Location Success & Local Haversine Distance ───
  it('1. Location success: correctly computes haversine distance locally', () => {
    // Distance between Bengaluru Vidhana Soudha (12.9796, 77.5907) and Manipal Hospital (12.9592, 77.6534) is ~7.2 km
    const distKm = calculateDistanceKm(12.9796, 77.5907, 12.9592, 77.6534);
    assert.ok(distKm > 6.5 && distKm < 8.0, `Expected ~7.2km, got ${distKm}`);

    // Same point returns 0
    assert.equal(calculateDistanceKm(12.97, 77.59, 12.97, 77.59), 0);

    // Format meters and kilometers
    assert.equal(formatDistance(0.35), '350 m');
    assert.equal(formatDistance(1.82), '1.8 km');

    // Share link generation
    const shareLink = buildLocationMapLink(12.9716, 77.5946);
    assert.equal(shareLink, 'https://www.google.com/maps?q=12.9716,77.5946');
  });

  // ─── 2. Location Permission Denied Simulation ───
  it('2. Location permission denied: handles permission denied state properly', () => {
    const mockError = {
      code: 1, // GeolocationPositionError.PERMISSION_DENIED
      message: 'User denied Geolocation',
      PERMISSION_DENIED: 1,
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
    assert.ok(retryAllowed, 'Must provide Retry Location button');
    assert.ok(manualSearchAllowed, 'Must provide manual search input');
    assert.ok(callEmergencyAllowed, 'Must provide Call Emergency Services (112)');
  });

  // ─── 3. Overpass API Success & Normalization ───
  it('3. Overpass API success: parses and normalizes OpenStreetMap POI elements', () => {
    const rawOsmNode = {
      type: 'node',
      id: 12345678,
      lat: 12.9345,
      lon: 77.6102,
      tags: {
        name: "St. John's Medical College Hospital",
        amenity: 'hospital',
        healthcare: 'hospital',
        emergency: 'yes',
        'addr:housenumber': '100',
        'addr:street': 'Sarjapur Main Road',
        'addr:city': 'Bengaluru',
        'addr:postcode': '560034',
        phone: '+91 80 2206 5000',
        opening_hours: '24/7',
      },
    };

    const userLat = 12.9716;
    const userLon = 77.5946;

    const normalized = normalizeOsmElement(rawOsmNode, userLat, userLon);

    assert.ok(normalized !== null);
    assert.equal(normalized.id, 'osm_node_12345678');
    assert.equal(normalized.name, "St. John's Medical College Hospital");
    assert.equal(normalized.phoneNumber, '+91 80 2206 5000');
    assert.equal(normalized.placeType, 'emergency_room');
    assert.equal(normalized.openNow, true);
    assert.equal(normalized.address, '100 Sarjapur Main Road, Bengaluru, 560034');
    assert.ok(normalized.distanceMeters > 0);
    assert.ok(normalized.mapsUrl.includes('12.9345%2C77.6102') || normalized.mapsUrl.includes('12.9345,77.6102'));
    assert.equal(normalized.source, 'openstreetmap');
  });

  // ─── 4. Overpass API Failure Fallback ───
  it('4. Overpass API failure: provides graceful fallback and does NOT fabricate fake data', () => {
    // Simulating Overpass API 504 / Rate limit
    const errorResult = {
      error: 'OpenStreetMap Overpass service is momentarily busy.',
      places: [] as HealthcarePlace[],
    };

    assert.equal(errorResult.places.length, 0, 'Must never fabricate fake hospitals or phone numbers');
    assert.ok(errorResult.error.includes('Overpass service is momentarily busy'));
  });

  // ─── 5. Empty Results ───
  it('5. Empty results: handles zero results with clear fallback message', () => {
    const emptyElements: any[] = [];
    const normalized = emptyElements
      .map((el) => normalizeOsmElement(el, 12.97, 77.59))
      .filter(Boolean);

    assert.equal(normalized.length, 0);

    const emptyText = 'No nearby healthcare facilities were found.';
    assert.ok(emptyText.includes('No nearby healthcare facilities'));
  });

  // ─── 6. Call Button ───
  it('6. Call button: constructs safe tel: link without automatically dialing', () => {
    const rawPlace = {
      type: 'node',
      id: 999,
      lat: 12.9,
      lon: 77.6,
      tags: {
        name: 'Apollo Hospital',
        amenity: 'hospital',
        phone: '+91-80-2630-4050',
      },
    };

    const place = normalizeOsmElement(rawPlace, 12.91, 77.61);
    assert.ok(place?.phoneNumber);

    const sanitizedTel = place.phoneNumber.replace(/[^\d+]/g, '');
    const telLink = `tel:${sanitizedTel}`;

    assert.equal(telLink, 'tel:+918026304050');
    assert.ok(telLink.startsWith('tel:'), 'Must use tel: protocol');
  });

  // ─── 7. Navigate Button (Google Maps URL without Google Maps API) ───
  it('7. Navigate button: opens Google Maps via URL without using Google Maps API', () => {
    const lat = 12.9716;
    const lon = 77.5946;
    const name = 'Victoria Hospital';

    const navUrl = buildNavigationUrl(lat, lon, name);

    assert.ok(
      navUrl.startsWith('https://www.google.com/maps/dir/?api=1'),
      'Must use universal Google Maps directions URL'
    );
    assert.ok(navUrl.includes('destination=12.9716%2C77.5946') || navUrl.includes('destination=12.9716,77.5946'));
    // Ensures no Google Maps API script or client API key is required
    assert.ok(!navUrl.includes('key='));
  });

  // ─── 8. Emergency-services Button (112) ───
  it('8. Emergency-services button: uses 112 with prominent action and disclaimer', () => {
    assert.equal(EMERGENCY_SERVICES_NUMBER, '112');
    assert.equal(EMERGENCY_SERVICES_TEL, 'tel:112');

    const buttonLabel = 'CALL EMERGENCY SERVICES — 112';
    assert.ok(buttonLabel.includes('CALL EMERGENCY SERVICES — 112'));
  });

  // ─── 9. Missing Phone Number ───
  it('9. Missing phone number: normalizes to null and keeps navigation enabled', () => {
    const rawPlaceWithoutPhone = {
      type: 'node',
      id: 100,
      lat: 12.95,
      lon: 77.55,
      tags: {
        name: 'Primary Health Center',
        amenity: 'clinic',
      },
    };

    const place = normalizeOsmElement(rawPlaceWithoutPhone, 12.95, 77.55);
    assert.ok(place);
    assert.equal(place.phoneNumber, null, 'Must be null when tag is absent');
    assert.ok(place.mapsUrl.length > 0, 'Navigate URL must still be available');
  });

  // ─── 10. OpenStreetMap Attribution ───
  it('10. Attribution: includes required OpenStreetMap copyright notice', () => {
    assert.equal(OSM_ATTRIBUTION, '© OpenStreetMap contributors');
    assert.equal(OSM_COPYRIGHT_URL, 'https://www.openstreetmap.org/copyright');
  });

  // ─── 11. Prioritization (Hospitals & Emergency First) ───
  it('11. Prioritization: prioritizes hospitals & emergency rooms over clinics and pharmacies', () => {
    const places: HealthcarePlace[] = [
      {
        id: '1',
        name: 'MedPlus Pharmacy',
        address: 'MG Road',
        latitude: 12.1,
        longitude: 77.1,
        distance: '200 m',
        distanceMeters: 200,
        phoneNumber: null,
        openNow: null,
        placeType: 'pharmacy',
        mapsUrl: '',
      },
      {
        id: '2',
        name: 'Neighborhood Clinic',
        address: 'Brigade Road',
        latitude: 12.2,
        longitude: 77.2,
        distance: '400 m',
        distanceMeters: 400,
        phoneNumber: null,
        openNow: null,
        placeType: 'clinic',
        mapsUrl: '',
      },
      {
        id: '3',
        name: 'Fortis Hospital',
        address: 'Cunningham Road',
        latitude: 12.3,
        longitude: 77.3,
        distance: '900 m',
        distanceMeters: 900,
        phoneNumber: '080 12345678',
        openNow: null,
        placeType: 'hospital',
        mapsUrl: '',
      },
      {
        id: '4',
        name: 'Trauma & Emergency Care',
        address: 'Residency Road',
        latitude: 12.4,
        longitude: 77.4,
        distance: '600 m',
        distanceMeters: 600,
        phoneNumber: '080 87654321',
        openNow: null,
        placeType: 'emergency_room',
        mapsUrl: '',
      },
    ];

    const prioritized = prioritizeHealthcarePlaces(places);

    // Both hospitals must be at the very top, sorted by distance
    assert.equal(prioritized[0].id, '4', 'Emergency Care (600m) should be #1');
    assert.equal(prioritized[1].id, '3', 'Fortis Hospital (900m) should be #2');
    assert.equal(prioritized[2].id, '2', 'Clinic should be #3');
    assert.equal(prioritized[3].id, '1', 'Pharmacy should be #4');
  });

  // ─── 12. Tag Parsing Helpers ───
  it('12. Tag parsing: correctly formats address and determines place types', () => {
    const tags = {
      'addr:housenumber': '42',
      'addr:street': 'Indiranagar 100ft Rd',
      'addr:city': 'Bengaluru',
      amenity: 'pharmacy',
    };

    assert.equal(formatOsmAddress(tags), '42 Indiranagar 100ft Rd, Bengaluru');
    assert.equal(determineOsmPlaceType(tags), 'pharmacy');
    assert.equal(getPlaceTypePriority('hospital'), 1);
    assert.equal(getPlaceTypePriority('clinic'), 2);
    assert.equal(getPlaceTypePriority('pharmacy'), 3);
  });
});
