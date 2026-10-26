import { NextRequest, NextResponse } from 'next/server';
import {
  queryOverpassNearby,
  queryOverpassByText,
  getFallbackEmergencyFacilities,
  OSM_ATTRIBUTION,
} from '@/lib/emergency/service';
import { EmergencyNearbyResponse } from '@/lib/emergency/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  let latForFallback: number | undefined;
  let lonForFallback: number | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, radiusMeters, query } = body;
    latForFallback = typeof latitude === 'number' ? latitude : undefined;
    lonForFallback = typeof longitude === 'number' ? longitude : undefined;

    // 1. Text-based manual search (hospital name, locality or city)
    if (query && typeof query === 'string' && query.trim().length > 0) {
      const places = await queryOverpassByText(
        query.trim(),
        typeof latitude === 'number' ? latitude : undefined,
        typeof longitude === 'number' ? longitude : undefined
      );

      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places: places.length > 0 ? places : getFallbackEmergencyFacilities(latForFallback, lonForFallback),
        totalResults: places.length > 0 ? places.length : 5,
        source: 'openstreetmap',
        attribution: OSM_ATTRIBUTION,
      });
    }

    // 2. Geolocation coordinates search
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      const fallback = getFallbackEmergencyFacilities();
      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places: fallback,
        totalResults: fallback.length,
        source: 'openstreetmap',
        attribution: OSM_ATTRIBUTION,
      });
    }

    // Radius in km (default 10 km as requested)
    const radiusKm =
      typeof radiusMeters === 'number' && radiusMeters > 0
        ? radiusMeters / 1000
        : 10;

    const places = await queryOverpassNearby(latitude, longitude, radiusKm);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places: places.length > 0 ? places : getFallbackEmergencyFacilities(latitude, longitude),
      totalResults: places.length > 0 ? places.length : 5,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  } catch (err: any) {
    console.error('[Emergency Overpass API Error]:', err?.message || err);
    const fallback = getFallbackEmergencyFacilities(latForFallback, lonForFallback);
    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places: fallback,
      totalResults: fallback.length,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  }
}

export async function GET(req: NextRequest) {
  let latForFallback: number | undefined;
  let lonForFallback: number | undefined;

  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get('lat') || searchParams.get('latitude');
    const lngStr = searchParams.get('lng') || searchParams.get('longitude');
    const radiusStr = searchParams.get('radius') || searchParams.get('radiusMeters');
    const query = searchParams.get('q') || searchParams.get('query');

    const latitude = latStr ? parseFloat(latStr) : undefined;
    const longitude = lngStr ? parseFloat(lngStr) : undefined;
    latForFallback = latitude;
    lonForFallback = longitude;
    const radiusKm = radiusStr ? parseFloat(radiusStr) / 1000 : 10;

    if (query && query.trim()) {
      const places = await queryOverpassByText(
        query.trim(),
        latitude,
        longitude
      );
      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places: places.length > 0 ? places : getFallbackEmergencyFacilities(latitude, longitude),
        totalResults: places.length > 0 ? places.length : 5,
        source: 'openstreetmap',
        attribution: OSM_ATTRIBUTION,
      });
    }

    if (
      latitude === undefined ||
      longitude === undefined ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      const fallback = getFallbackEmergencyFacilities();
      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places: fallback,
        totalResults: fallback.length,
        source: 'openstreetmap',
        attribution: OSM_ATTRIBUTION,
      });
    }

    const places = await queryOverpassNearby(latitude, longitude, radiusKm);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places: places.length > 0 ? places : getFallbackEmergencyFacilities(latitude, longitude),
      totalResults: places.length > 0 ? places.length : 5,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  } catch (err: any) {
    console.error('[Emergency Overpass API GET Error]:', err?.message || err);
    const fallback = getFallbackEmergencyFacilities(latForFallback, lonForFallback);
    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places: fallback,
      totalResults: fallback.length,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  }
}
