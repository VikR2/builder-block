import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { TranscriptSegment, getVideoTranscript, formatTimestamp } from './tcm-db';

const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');

// Stop words to filter from search queries (same as tcm-db.ts)
const STOP_WORDS = new Set([
  'explain', 'what', 'is', 'are', 'how', 'the', 'a', 'an', 'to', 'for', 'of', 'in',
  'on', 'with', 'about', 'can', 'you', 'me', 'tell', 'show', 'describe', 'help',
  'please', 'i', 'my', 'do', 'does', 'and', 'this', 'that', 'it', 'be'
]);

// Extract meaningful keywords from a query
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

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

// Find frames that match a transcript search using keyword matching
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

  // Extract keywords from query (filters stop words)
  const keywords = extractKeywords(query);

  // If no keywords after filtering, fall back to original words
  const searchTerms = keywords.length > 0
    ? keywords
    : query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

  const results: Array<{ frame: FrameInfo; segment: TranscriptSegment; matchScore: number }> = [];

  for (const segment of transcript) {
    const lowerText = segment.text.toLowerCase();

    // Score based on keyword matches
    let score = 0;
    for (const term of searchTerms) {
      if (lowerText.includes(term)) {
        score += 1;
      }
    }

    if (score > 0) {
      // Find the closest frame to this segment's timestamp
      const closestFrame = findClosestFrame(frames, segment.start);

      if (closestFrame) {
        results.push({
          frame: closestFrame,
          segment,
          matchScore: score,
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
