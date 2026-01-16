import { NextRequest, NextResponse } from 'next/server';
import { assembleContext, generateContextBasedResponse } from '@/lib/tcm-context';
import { TCM_SYSTEM_PROMPT, CONTEXT_ASSEMBLY_PROMPT, formatContextForLLM } from '@/lib/tcm-prompts';
import { findFramesForTranscriptSearch, getVideosWithFrames } from '@/lib/tcm-frames';

// Check for Anthropic API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const USE_LLM = ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history } = body as {
      message: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Assemble context from knowledge base
    const context = assembleContext(message);
    const allResults = [...context.skills, ...context.documents, ...context.transcripts];

    let response: string;
    let sources = allResults.slice(0, 5);

    if (USE_LLM) {
      // Use Claude API for LLM-powered response
      response = await generateLLMResponse(message, context, history);
    } else {
      // Use context-based response (no LLM)
      response = generateContextBasedResponse(context);
    }

    // Find relevant video frames
    const frames = findRelevantFrames(message);

    return NextResponse.json({
      response,
      sources,
      frames,
      usedLLM: USE_LLM,
      contextSize: context.totalResults,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

// Generate response using Claude API
async function generateLLMResponse(
  message: string,
  context: ReturnType<typeof assembleContext>,
  history?: Array<{ role: string; content: string }>
): Promise<string> {
  const allResults = [...context.skills, ...context.documents, ...context.transcripts];
  const formattedContext = formatContextForLLM(allResults);

  const userPrompt = CONTEXT_ASSEMBLY_PROMPT
    .replace('{context}', formattedContext)
    .replace('{question}', message);

  // Build messages array
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add history if provided (limited to last 10 exchanges)
  if (history && history.length > 0) {
    const recentHistory = history.slice(-20); // Last 20 messages (10 exchanges)
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  // Add current question with context
  messages.push({ role: 'user', content: userPrompt });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: TCM_SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text;

    if (!assistantMessage) {
      throw new Error('No response from API');
    }

    return assistantMessage;
  } catch (error) {
    console.error('LLM generation error:', error);
    // Fallback to context-based response
    return generateContextBasedResponse(context);
  }
}

// Find relevant video frames for the query
function findRelevantFrames(query: string): Array<{
  videoId: string;
  videoTitle: string;
  frameNumber: number;
  timestamp: number;
  timestampFormatted: string;
  transcriptText: string;
}> {
  const videos = getVideosWithFrames();
  const allFrames: Array<{
    videoId: string;
    videoTitle: string;
    frameNumber: number;
    timestamp: number;
    timestampFormatted: string;
    transcriptText: string;
    matchScore: number;
  }> = [];

  for (const video of videos) {
    const results = findFramesForTranscriptSearch(video.videoId, query, 2);
    for (const result of results) {
      allFrames.push({
        videoId: video.videoId,
        videoTitle: video.title,
        frameNumber: result.frame.frameNumber,
        timestamp: result.frame.timestamp,
        timestampFormatted: result.frame.timestampFormatted,
        transcriptText: result.segment.text.substring(0, 200),
        matchScore: result.matchScore,
      });
    }
  }

  // Sort by match score and return top 3
  return allFrames
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
    .map(({ matchScore: _, ...rest }) => rest);
}
