"use client";

import { VideoPlayer } from '@/components/tcm/video-player';
import { VideoClipInfo } from '@/lib/tcm-video-clips';

// Test video clip with a sample video
const testClip: VideoClipInfo = {
  videoId: 'test-video',
  videoTitle: 'Test Video Player Controls',
  startTime: 0,
  endTime: 60,
  description: 'This is a test page to verify video player controls are working correctly.',
  relevanceScore: 1.0,
  source: 'test'
};

export default function TestVideoPlayerPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-white">Video Player Controls Test</h1>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2 text-gray-300">Expected Controls:</h2>
        <ul className="list-disc list-inside text-gray-400 space-y-1">
          <li>Play/Pause button</li>
          <li>Skip Back 10s button</li>
          <li>Skip Forward 10s button</li>
          <li>Volume control with slider</li>
          <li>Time display (current / total)</li>
          <li>Playback speed control (clock icon with speed)</li>
          <li>Fullscreen button</li>
          <li>Progress bar at bottom of video (always visible)</li>
        </ul>
      </div>

      <div className="max-w-3xl">
        <div className="mb-4 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Video Player Component (debug mode enabled):</h3>
          <VideoPlayer
            clip={testClip}
            autoPlay={false}
            debug={true}
          />
        </div>

        <div className="mt-4 p-4 bg-zinc-800 rounded-lg text-sm text-gray-400">
          <p><strong>Test Instructions:</strong></p>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>Verify the controls bar (dark gray with buttons) is visible below the video</li>
            <li>The controls bar should have: Play, Skip-10, Skip+10, Volume, Time, Speed (1x), Fullscreen</li>
            <li>Click play and wait 4 seconds - controls should fade</li>
            <li>Move mouse over video - controls should reappear</li>
            <li>Check browser console for [VideoPlayer] debug logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
