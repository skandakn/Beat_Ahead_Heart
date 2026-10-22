import { NextRequest, NextResponse } from "next/server";
import { validatePatientRecordUpdate } from "@/lib/patient-record";
import { getPatientRecord, updatePatientRecord } from "@/lib/db/store";

function resolveUserId(raw: string | null): string {
  const id = (raw ?? "").trim();
  if (!id || id.length > 256 || !/^[\w\-@.]+$/.test(id)) return "demo-user-1";
  return id;
}

export async function GET(request: NextRequest) {
  const userId = resolveUserId(request.nextUrl.searchParams.get("userId"));
  const record = getPatientRecord(userId);
  return NextResponse.json({ record });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const userId = resolveUserId(typeof body.userId === "string" ? body.userId : null);

    // Validate + sanitise — throws on bad input
    const update = validatePatientRecordUpdate(body);

    const record = updatePatientRecord(userId, update);

    return NextResponse.json({ record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid patient record data";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
