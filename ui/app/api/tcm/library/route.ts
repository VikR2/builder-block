import { NextResponse } from 'next/server';
import { getLibraryVideos } from '@/lib/tcm-library';

export async function GET() {
  try {
    const videos = await getLibraryVideos();
    return NextResponse.json(videos);
  } catch (error) {
    console.error('Error fetching library videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}
