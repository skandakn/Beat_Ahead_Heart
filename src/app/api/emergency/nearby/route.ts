import { NextRequest, NextResponse } from 'next/server';
import {
  queryOverpassNearby,
  queryOverpassByText,
  OSM_ATTRIBUTION,
} from '@/lib/emergency/service';
import { EmergencyNearbyResponse } from '@/lib/emergency/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, radiusMeters, query, cardiacOnly } = body;

    // 1. Text-based manual search (hospital name, locality or city)
    if (query && typeof query === 'string' && query.trim().length > 0) {
      const places = await queryOverpassByText(
        query.trim(),
        typeof latitude === 'number' ? latitude : undefined,
        typeof longitude === 'number' ? longitude : undefined,
        cardiacOnly === true
      );

      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places,
        totalResults: places.length,
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
      return NextResponse.json<EmergencyNearbyResponse>(
        {
          success: false,
          places: [],
          totalResults: 0,
          error: 'Invalid or missing geographical coordinates (latitude and longitude).',
        },
        { status: 400 }
      );
    }

    // Radius in km (default 10 km as requested)
    const radiusKm =
      typeof radiusMeters === 'number' && radiusMeters > 0
        ? radiusMeters / 1000
        : 10;

    const places = await queryOverpassNearby(latitude, longitude, radiusKm, cardiacOnly === true);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places,
      totalResults: places.length,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  } catch (err: any) {
    console.error('[Emergency Overpass API Error]:', err?.message || err);
    return NextResponse.json<EmergencyNearbyResponse>(
      {
        success: false,
        places: [],
        totalResults: 0,
        error:
          'OpenStreetMap Overpass service is momentarily busy. In an emergency, dial 112 directly.',
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get('lat') || searchParams.get('latitude');
    const lngStr = searchParams.get('lng') || searchParams.get('longitude');
    const radiusStr = searchParams.get('radius') || searchParams.get('radiusMeters');
    const query = searchParams.get('q') || searchParams.get('query');
    const cardiacOnly = searchParams.get('cardiacOnly') === 'true';

    const latitude = latStr ? parseFloat(latStr) : undefined;
    const longitude = lngStr ? parseFloat(lngStr) : undefined;
    const radiusKm = radiusStr ? parseFloat(radiusStr) / 1000 : 10;

    if (query && query.trim()) {
      const places = await queryOverpassByText(
        query.trim(),
        latitude,
        longitude,
        cardiacOnly
      );
      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places,
        totalResults: places.length,
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
      return NextResponse.json<EmergencyNearbyResponse>(
        {
          success: false,
          places: [],
          totalResults: 0,
          error: 'Please provide valid latitude and longitude coordinates, or a search query.',
        },
        { status: 400 }
      );
    }

    const places = await queryOverpassNearby(latitude, longitude, radiusKm, cardiacOnly);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places,
      totalResults: places.length,
      source: 'openstreetmap',
      attribution: OSM_ATTRIBUTION,
    });
  } catch (err: any) {
    console.error('[Emergency Overpass API GET Error]:', err?.message || err);
    return NextResponse.json<EmergencyNearbyResponse>(
      {
        success: false,
        places: [],
        totalResults: 0,
        error: 'OpenStreetMap Overpass service is unavailable. Please dial 112 directly.',
      },
      { status: 502 }
    );
  }
}
