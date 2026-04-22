import { NextRequest, NextResponse } from 'next/server';
import { getPublishedReadyVideoByFolderId } from '@/lib/tcm-admin/db';
import { readVideoLesson } from '@/lib/tcm-lessons';
import { resolveVideoDirectory } from '@/lib/tcm-video-artifacts';
import { getVideoDetails, resolveVideoId } from '@/lib/tcm-library';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const resolvedId = resolveVideoId(videoId);

    if (!resolvedId) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const video = getPublishedReadyVideoByFolderId(resolvedId);
    if (!video) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const videoDir = resolveVideoDirectory(video);
    if (!videoDir) {
      return NextResponse.json({ error: 'Lesson assets missing' }, { status: 404 });
    }

    const lesson = readVideoLesson(videoDir);
    const details = await getVideoDetails(resolvedId);

    if (!lesson || !details) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    return NextResponse.json({
      video: details,
      lesson,
      watchLink: `/tcm/library/${encodeURIComponent(resolvedId)}`,
      lessonLink: `/tcm/library/${encodeURIComponent(resolvedId)}/lesson`
    });
  } catch (error) {
    console.error('Error fetching video lesson:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lesson' },
      { status: 500 }
    );
  }
}
