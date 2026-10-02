import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

describe('/api/emergency/nearby Route Handler', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 503 when GOOGLE_PLACES_API_KEY is not configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const req = new NextRequest('http://localhost:3000/api/emergency/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 12.9716, longitude: 77.5946 }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 503);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Google Places API key is not configured'));
    assert.deepEqual(data.places, []);
  });

  it('returns 400 for invalid geographical coordinates', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test_mock_key';

    const req = new NextRequest('http://localhost:3000/api/emergency/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 150, longitude: 77.5946 }), // Latitude > 90
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Invalid or missing geographical coordinates'));
  });

  it('GET endpoint validates latitude and longitude coordinates', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test_mock_key';

    const req = new NextRequest('http://localhost:3000/api/emergency/nearby?lat=invalid&lng=77.59');
    const res = await GET(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('valid latitude and longitude'));
  });
});
