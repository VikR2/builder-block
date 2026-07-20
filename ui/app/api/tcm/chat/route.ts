import { NextRequest, NextResponse } from 'next/server';
import { consumeUserCredits, getCurrentUser, grantUserCredits } from '@/lib/auth';
import {
  buildChatResponsePayload,
  generateLLMResponse,
  type ChatRequestBody
} from '@/lib/tcm-chat.server';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let creditReserved = false;
  let reservedUserId: number | null = null;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication is required' }, { status: 401 });
    }

    if (!user.hasChatAccess) {
      return NextResponse.json(
        { error: 'Premium access or chat credits are required to use the Knowledge Bot' },
        { status: 402 }
      );
    }

    const body = await request.json() as ChatRequestBody;

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!user.isPremium && !user.isAdmin) {
      const reservation = consumeUserCredits(user.id, 1, 'tcm_chat_answer', {
        messageLength: body.message.trim().length
      });

      if (!reservation.success) {
        return NextResponse.json(
          {
            error: 'You do not have enough chat credits for a grounded answer',
            creditBalance: reservation.balance
          },
          { status: 402 }
        );
      }

      creditReserved = true;
      reservedUserId = user.id;
    }

    const payload = await buildChatResponsePayload(body);
    const llmResult = await generateLLMResponse({
      message: body.message,
      context: payload.context,
      history: body.history,
      mode: payload.mode
    });

    let remainingCredits = user.creditBalance;

    if (creditReserved && reservedUserId !== null) {
      if (!llmResult.usedLLM) {
        const refund = grantUserCredits(reservedUserId, 1, 'tcm_chat_refund', {
          reason: 'llm_not_used'
        });
        remainingCredits = refund.balance_credits;
        creditReserved = false;
      } else {
        remainingCredits = Math.max(0, user.creditBalance - 1);
      }
    }

    return NextResponse.json({
      response: llmResult.response,
      structuredAnswer: payload.structuredAnswer,
      sources: payload.sources,
      frames: payload.frames,
      chartData: payload.chartData,
      videoClip: payload.videoClip,
      primaryClip: payload.primaryClip,
      recommendedClips: payload.recommendedClips,
      watchLink: payload.watchLink,
      lessonLink: payload.lessonLink,
      usedLLM: llmResult.usedLLM,
      fallbackReason: llmResult.fallbackReason,
      chargedCredits: creditReserved && llmResult.usedLLM ? 1 : 0,
      remainingCredits,
      contextSize: payload.contextSize,
      timings: {
        retrievalMs: payload.retrievalMs,
        generationMs: llmResult.generationMs,
        totalMs: Date.now() - startedAt
      },
      model: llmResult.model
    });
  } catch (error) {
    if (creditReserved && reservedUserId !== null) {
      try {
        grantUserCredits(reservedUserId, 1, 'tcm_chat_refund', {
          reason: 'request_failed'
        });
      } catch (refundError) {
        console.error('Chat credit refund error:', refundError);
      }
    }
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
