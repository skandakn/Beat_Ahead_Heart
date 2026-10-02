import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

describe('/api/emergency/nearby Route Handler (OpenStreetMap Overpass)', () => {
  it('returns 400 for invalid latitude (> 90)', async () => {
    const req = new NextRequest('http://localhost:3000/api/emergency/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 150, longitude: 77.5946 }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Invalid or missing geographical coordinates'));
  });

  it('returns 400 for missing coordinates when no text query is provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/emergency/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
  });

  it('GET endpoint validates latitude and longitude coordinates', async () => {
    const req = new NextRequest('http://localhost:3000/api/emergency/nearby?lat=invalid&lng=77.59');
    const res = await GET(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('valid latitude and longitude'));
  });
});
