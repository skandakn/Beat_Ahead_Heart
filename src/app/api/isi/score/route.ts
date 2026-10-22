import { NextRequest, NextResponse } from "next/server";
import { getUserISIScore, saveUserISIScore } from "@/lib/db/store";
import type { UserISIScoreRecord } from "@/lib/isi/types";

function resolveUserId(request: NextRequest, bodyUserId?: string | null): string {
  if (bodyUserId && typeof bodyUserId === "string" && bodyUserId.trim().length > 0) {
    const sanitized = bodyUserId.trim();
    if (sanitized.length <= 256 && /^[\w\-@.]+$/.test(sanitized)) {
      return sanitized;
    }
  }

  const queryUserId = request.nextUrl.searchParams.get("userId");
  if (queryUserId && queryUserId.trim().length > 0) {
    const sanitized = queryUserId.trim();
    if (sanitized.length <= 256 && /^[\w\-@.]+$/.test(sanitized)) {
      return sanitized;
    }
  }

  // Check demo session cookie if available
  const demoCookie = request.cookies.get("beatahead_demo_session");
  if (demoCookie?.value) {
    try {
      const parsed = JSON.parse(decodeURIComponent(demoCookie.value)) as { id?: string };
      if (parsed?.id && typeof parsed.id === "string") {
        return parsed.id;
      }
    } catch {}
  }

  return "demo-user-1";
}

/**
 * GET /api/isi/score?userId=<id>
 * Retrieves the latest saved ISI score, baseline, score history, and timestamps for an account.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    const record = getUserISIScore(userId);
    return NextResponse.json({
      success: true,
      userId,
      record: record ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error retrieving ISI record";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/isi/score
 * Persists user's latest computed ISI score, baseline, history, and measurements to shared store.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<UserISIScoreRecord>;
    const userId = resolveUserId(request, body.userId);

    if (body.currentScore && typeof body.currentScore.score === "number") {
      // Validate bounds
      body.currentScore.score = Math.max(0, Math.min(100, Math.round(body.currentScore.score)));
    }

    const saved = saveUserISIScore(userId, {
      ...body,
      userId,
    });

    return NextResponse.json({
      success: true,
      userId,
      record: saved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error saving ISI record";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
