import { NextRequest, NextResponse } from 'next/server';
import { consumeUserCredits, getCurrentUser, grantUserCredits } from '@/lib/auth';
import {
  buildChatResponsePayload,
  streamLLMResponse,
  type ChatRequestBody
} from '@/lib/tcm-chat.server';

function formatSSE(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

    const encoder = new TextEncoder();
    const payload = await buildChatResponsePayload(body);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(formatSSE(event, data)));
        };

        try {
          send('meta', {
            structuredAnswer: payload.structuredAnswer,
            sources: payload.sources,
            frames: payload.frames,
            chartData: payload.chartData,
            videoClip: payload.videoClip,
            primaryClip: payload.primaryClip,
            recommendedClips: payload.recommendedClips,
            watchLink: payload.watchLink,
            lessonLink: payload.lessonLink,
            contextSize: payload.contextSize,
            timings: {
              retrievalMs: payload.retrievalMs
            }
          });

          const llmResult = await streamLLMResponse({
            message: body.message,
            context: payload.context,
            history: body.history,
            mode: payload.mode,
            onToken: (delta) => {
              send('token', { delta });
            }
          });

          let remainingCredits = user.creditBalance;
          let chargedCredits = 0;

          if (creditReserved && reservedUserId !== null) {
            if (!llmResult.usedLLM) {
              const refund = grantUserCredits(reservedUserId, 1, 'tcm_chat_refund', {
                reason: 'llm_not_used'
              });
              remainingCredits = refund.balance_credits;
              creditReserved = false;
            } else {
              chargedCredits = 1;
              remainingCredits = Math.max(0, user.creditBalance - 1);
            }
          }

          send('done', {
            response: llmResult.response,
            structuredAnswer: payload.structuredAnswer,
            usedLLM: llmResult.usedLLM,
            fallbackReason: llmResult.fallbackReason,
            model: llmResult.model,
            chargedCredits,
            remainingCredits,
            timings: {
              retrievalMs: payload.retrievalMs,
              generationMs: llmResult.generationMs,
              totalMs: Date.now() - startedAt
            }
          });
        } catch (error) {
          if (creditReserved && reservedUserId !== null) {
            try {
              grantUserCredits(reservedUserId, 1, 'tcm_chat_refund', {
                reason: 'stream_failed'
              });
              creditReserved = false;
            } catch (refundError) {
              console.error('Streaming chat credit refund error:', refundError);
            }
          }

          console.error('Streaming chat error:', error);
          send('error', {
            error: error instanceof Error ? error.message : 'Failed to stream chat message'
          });
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      }
    });
  } catch (error) {
    if (creditReserved && reservedUserId !== null) {
      try {
        grantUserCredits(reservedUserId, 1, 'tcm_chat_refund', {
          reason: 'request_failed'
        });
      } catch (refundError) {
        console.error('Chat stream bootstrap credit refund error:', refundError);
      }
    }

    console.error('Chat stream bootstrap error:', error);
    return NextResponse.json(
      { error: 'Failed to start chat stream' },
      { status: 500 }
    );
  }
}
