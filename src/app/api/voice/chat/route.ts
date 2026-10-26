import { NextResponse } from 'next/server';
import { getDefaultVoiceAgent } from '@/core/default-agent';

export async function POST(request: Request) {
  let callId = `browser_${Date.now()}`;
  let message: string | undefined;
  let action = 'utterance';
  let callerId = 'Patient';

  try {
    const body = await request.json().catch(() => ({}));
    if (body.callId) callId = body.callId;
    if (body.message) message = body.message;
    if (body.action) action = body.action;
    if (body.callerId) callerId = body.callerId;

    const voiceAgent = getDefaultVoiceAgent();

    // 1. Start session
    if (action === 'start') {
      const { session, greetingText, greetingAudio } = await voiceAgent.startSession({
        callId,
        callerId,
        mode: 'browser',
      });

      return NextResponse.json({
        success: true,
        callId,
        action: 'start',
        responseText: greetingText,
        audioBase64: greetingAudio ? greetingAudio.toString('base64') : null,
        session,
      });
    }

    // 2. End session
    if (action === 'end') {
      const completedCall = await voiceAgent.endCall(callId);
      return NextResponse.json({
        success: true,
        callId,
        action: 'end',
        completedCall,
      });
    }

    // 3. Process utterance
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    // Ensure session exists
    const activeSession = voiceAgent.getActiveSession(callId);
    if (!activeSession) {
      await voiceAgent.startSession({
        callId,
        callerId,
        mode: 'browser',
      });
    }

    const { responseText, audioBuffer, liveStructuredData, toolExecutions } =
      await voiceAgent.handleCallerUtterance(callId, message);

    return NextResponse.json({
      success: true,
      callId,
      responseText,
      audioBase64: audioBuffer && audioBuffer.length > 0 ? audioBuffer.toString('base64') : null,
      structuredData: liveStructuredData,
      toolExecutions,
    });
  } catch (error: any) {
    console.error('[Voice Chat API] Error:', error);

    try {
      // Emergency Clinical Triage Fallback (prevents chatbot from crashing when external keys/network fail)
      const { generateEmergencyCardiacFallback } = await import('@/core/extraction/cardiac-clinical-brain');
      const { extractCardiacFindings } = await import('@/core/extraction/deterministic-extractor');
      
      const parsed = typeof message === 'string' ? message : '';
      const fallback = generateEmergencyCardiacFallback(parsed);
      const findings = extractCardiacFindings(parsed);

      return NextResponse.json({
        success: true,
        callId: typeof callId === 'string' ? callId : `fallback_${Date.now()}`,
        responseText: fallback.text,
        audioBase64: null,
        structuredData: findings,
        toolExecutions: fallback.toolCalls || [],
        source: 'emergency_clinical_brain',
      });
    } catch {
      return NextResponse.json(
        { error: error.message || 'Voice turn processing failed' },
        { status: 500 }
      );
    }
  }
}
