import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { TranscriptSegment, getVideoTranscript, formatTimestamp } from './tcm-db';

const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');

// Frame metadata
export interface FrameInfo {
  videoId: string;
  frameNumber: number;
  filename: string;
  path: string;
  timestamp: number;
  timestampFormatted: string;
}

// Get list of frames for a video
export function getVideoFrames(videoId: string): FrameInfo[] {
  const framesPath = join(LOCAL_VIDEOS_PATH, videoId, 'frames');

  if (!existsSync(framesPath)) {
    return [];
  }

  const files = readdirSync(framesPath)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort();

  // Parse frame numbers and estimate timestamps
  // Assuming 45-second intervals (from the extraction settings)
  const FRAME_INTERVAL = 45; // seconds

  return files.map((filename, index) => {
    const match = filename.match(/frame_(\d+)/);
    const frameNumber = match ? parseInt(match[1]) : index + 1;
    const timestamp = (frameNumber - 1) * FRAME_INTERVAL;

    return {
      videoId,
      frameNumber,
      filename,
      path: join(framesPath, filename),
      timestamp,
      timestampFormatted: formatTimestamp(timestamp),
    };
  });
}

// Get a single frame by number
export function getFrame(videoId: string, frameNumber: number): FrameInfo | null {
  const frames = getVideoFrames(videoId);
  return frames.find(f => f.frameNumber === frameNumber) || null;
}

// Get frame content as buffer
export function getFrameBuffer(videoId: string, frameNumber: number): Buffer | null {
  const frame = getFrame(videoId, frameNumber);

  if (!frame || !existsSync(frame.path)) {
    return null;
  }

  return readFileSync(frame.path);
}

// Find frames near a timestamp
export function findFramesNearTimestamp(
  videoId: string,
  timestamp: number,
  windowSeconds: number = 30
): FrameInfo[] {
  const frames = getVideoFrames(videoId);

  return frames.filter(f =>
    Math.abs(f.timestamp - timestamp) <= windowSeconds
  );
}

// Find frames that match a transcript search
export function findFramesForTranscriptSearch(
  videoId: string,
  query: string,
  limit: number = 5
): Array<{ frame: FrameInfo; segment: TranscriptSegment; matchScore: number }> {
  const transcript = getVideoTranscript(videoId);
  const frames = getVideoFrames(videoId);

  if (!transcript || frames.length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const results: Array<{ frame: FrameInfo; segment: TranscriptSegment; matchScore: number }> = [];

  for (const segment of transcript) {
    if (segment.text.toLowerCase().includes(lowerQuery)) {
      // Find the closest frame to this segment's timestamp
      const closestFrame = findClosestFrame(frames, segment.start);

      if (closestFrame) {
        // Calculate match score (how many times query appears)
        const matches = (segment.text.toLowerCase().match(
          new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        ) || []).length;

        results.push({
          frame: closestFrame,
          segment,
          matchScore: matches,
        });
      }
    }
  }

  // Sort by match score and limit
  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

// Find the closest frame to a timestamp
function findClosestFrame(frames: FrameInfo[], timestamp: number): FrameInfo | null {
  if (frames.length === 0) return null;

  let closest = frames[0];
  let minDiff = Math.abs(frames[0].timestamp - timestamp);

  for (const frame of frames) {
    const diff = Math.abs(frame.timestamp - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = frame;
    }
  }

  return closest;
}

// Get all videos with frames
export function getVideosWithFrames(): Array<{
  videoId: string;
  title: string;
  frameCount: number;
}> {
  if (!existsSync(LOCAL_VIDEOS_PATH)) {
    return [];
  }

  const folders = readdirSync(LOCAL_VIDEOS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory());

  const results: Array<{ videoId: string; title: string; frameCount: number }> = [];

  for (const folder of folders) {
    const framesPath = join(LOCAL_VIDEOS_PATH, folder.name, 'frames');
    if (existsSync(framesPath)) {
      const frameCount = readdirSync(framesPath).filter(f =>
        f.endsWith('.jpg') || f.endsWith('.png')
      ).length;

      const title = folder.name.replace(/_[a-f0-9]+$/, '').replace(/_/g, ' ');

      results.push({
        videoId: folder.name,
        title,
        frameCount,
      });
    }
  }

  return results;
}
