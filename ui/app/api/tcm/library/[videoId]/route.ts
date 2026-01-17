import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoDetails,
  getVideoChapters,
  getGroupedTranscript,
  getVideoTranscript,
  VideoDetails,
  VideoChapter,
  TranscriptSegment
} from '@/lib/tcm-library';

export interface VideoLibraryResponse {
  video: VideoDetails;
  chapters: VideoChapter[];
  transcript: {
    grouped: { timestamp: number; text: string }[];
    segments: TranscriptSegment[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  try {
    const video = await getVideoDetails(videoId);

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const [chapters, grouped, segments] = await Promise.all([
      getVideoChapters(videoId),
      getGroupedTranscript(videoId, 30),
      getVideoTranscript(videoId)
    ]);

    const response: VideoLibraryResponse = {
      video,
      chapters,
      transcript: {
        grouped,
        segments
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching video library data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
