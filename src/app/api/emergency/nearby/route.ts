import { NextRequest, NextResponse } from 'next/server';
import {
  queryGooglePlacesNearby,
  queryGooglePlacesByText,
} from '@/lib/emergency/service';
import { EmergencyNearbyResponse } from '@/lib/emergency/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, radiusMeters, query } = body;

    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json<EmergencyNearbyResponse>(
        {
          success: false,
          places: [],
          totalResults: 0,
          error:
            'Google Places API key is not configured on the server. Use the direct Call Emergency Services (112) option.',
        },
        { status: 503 }
      );
    }

    // 1. Text-based manual search (City/locality)
    if (query && typeof query === 'string' && query.trim().length > 0) {
      const places = await queryGooglePlacesByText(
        query.trim(),
        typeof latitude === 'number' ? latitude : undefined,
        typeof longitude === 'number' ? longitude : undefined,
        apiKey
      );

      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places,
        totalResults: places.length,
        source: 'google_places',
      });
    }

    // 2. Geolocation coordinate-based search
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

    const radius =
      typeof radiusMeters === 'number' && radiusMeters > 0
        ? radiusMeters
        : 10000; // default 10km

    const places = await queryGooglePlacesNearby(latitude, longitude, radius, apiKey);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places,
      totalResults: places.length,
      source: 'google_places',
    });
  } catch (err: any) {
    console.error('[Emergency API Error]:', err?.message || err);
    return NextResponse.json<EmergencyNearbyResponse>(
      {
        success: false,
        places: [],
        totalResults: 0,
        error:
          err?.message ||
          'Failed to retrieve nearby healthcare facilities. Please call 112 directly.',
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

    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json<EmergencyNearbyResponse>(
        {
          success: false,
          places: [],
          totalResults: 0,
          error:
            'Google Places API key is not configured on the server. Please call 112 directly.',
        },
        { status: 503 }
      );
    }

    const latitude = latStr ? parseFloat(latStr) : undefined;
    const longitude = lngStr ? parseFloat(lngStr) : undefined;
    const radiusMeters = radiusStr ? parseFloat(radiusStr) : 10000;

    if (query && query.trim()) {
      const places = await queryGooglePlacesByText(
        query.trim(),
        latitude,
        longitude,
        apiKey
      );
      return NextResponse.json<EmergencyNearbyResponse>({
        success: true,
        places,
        totalResults: places.length,
        source: 'google_places',
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

    const places = await queryGooglePlacesNearby(latitude, longitude, radiusMeters, apiKey);

    return NextResponse.json<EmergencyNearbyResponse>({
      success: true,
      places,
      totalResults: places.length,
      source: 'google_places',
    });
  } catch (err: any) {
    console.error('[Emergency API GET Error]:', err?.message || err);
    return NextResponse.json<EmergencyNearbyResponse>(
      {
        success: false,
        places: [],
        totalResults: 0,
        error: err?.message || 'Failed to retrieve nearby healthcare facilities.',
      },
      { status: 502 }
    );
  }
}
