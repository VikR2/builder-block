import { NextRequest, NextResponse } from 'next/server';
import { getVideoFrames, getVideosWithFrames, findFramesForTranscriptSearch } from '@/lib/tcm-frames';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoId = searchParams.get('videoId');
  const query = searchParams.get('q');

  try {
    // If query provided, search across all videos
    if (query) {
      const videos = getVideosWithFrames();
      const allResults = [];

      for (const video of videos) {
        const results = findFramesForTranscriptSearch(video.videoId, query, 3);
        for (const result of results) {
          allResults.push({
            videoId: video.videoId,
            videoTitle: video.title,
            frameNumber: result.frame.frameNumber,
            timestamp: result.frame.timestamp,
            timestampFormatted: result.frame.timestampFormatted,
            transcriptText: result.segment.text,
            matchScore: result.matchScore,
          });
        }
      }

      // Sort by match score and limit
      allResults.sort((a, b) => b.matchScore - a.matchScore);

      return NextResponse.json({
        query,
        count: allResults.length,
        frames: allResults.slice(0, 10),
      });
    }

    // If videoId provided, get frames for that video
    if (videoId) {
      const frames = getVideoFrames(videoId);
      return NextResponse.json({
        videoId,
        count: frames.length,
        frames: frames.map(f => ({
          videoId: f.videoId,
          frameNumber: f.frameNumber,
          timestamp: f.timestamp,
          timestampFormatted: f.timestampFormatted,
        })),
      });
    }

    // Otherwise, list all videos with frame counts
    const videos = getVideosWithFrames();
    return NextResponse.json({
      count: videos.length,
      videos,
    });
  } catch (error) {
    console.error('Frames API error:', error);
    return NextResponse.json({ error: 'Failed to get frames' }, { status: 500 });
  }
}
