import { NextRequest, NextResponse } from 'next/server';
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

  try {
    const body = await request.json() as ChatRequestBody;

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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

          send('done', {
            response: llmResult.response,
            structuredAnswer: payload.structuredAnswer,
            usedLLM: llmResult.usedLLM,
            model: llmResult.model,
            timings: {
              retrievalMs: payload.retrievalMs,
              generationMs: llmResult.generationMs,
              totalMs: Date.now() - startedAt
            }
          });
        } catch (error) {
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
    console.error('Chat stream bootstrap error:', error);
    return NextResponse.json(
      { error: 'Failed to start chat stream' },
      { status: 500 }
    );
  }
}
