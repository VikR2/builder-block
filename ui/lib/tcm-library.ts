/**
 * TCM Video Library - Data Layer
 * Functions for video browsing, metadata, and chapter generation
 */

import fs from 'fs';
import path from 'path';
import { getFolderIdByDbId, getVideoByFolderId } from './tcm-admin/db';

// Local videos directory path
const LOCAL_VIDEOS_DIR = path.join(process.cwd(), '..', 'data', 'local-videos');

/**
 * Resolve a video ID to a folder ID
 * Accepts both:
 * - Numeric database IDs (e.g., "4") -> resolves to folder_id from database
 * - Folder IDs (e.g., "read_and_interpret_volume_afa0985f") -> used directly
 *
 * @param id - Either a numeric DB ID or a folder ID string
 * @returns The folder ID string, or null if not found
 */
export function resolveVideoId(id: string): string | null {
  // If id looks like a folder (contains underscore followed by hex hash pattern)
  // Pattern: slug_xxxxxxxx where x is hex
  if (/^[a-z0-9_]+_[a-f0-9]{8}$/i.test(id)) {
    // Verify the folder exists
    const folderPath = path.join(LOCAL_VIDEOS_DIR, id);
    try {
      fs.accessSync(folderPath);
      return id;
    } catch {
      // Folder doesn't exist, try database lookup in case it's a coincidental pattern
      const dbVideo = getVideoByFolderId(id);
      return dbVideo?.folder_id || null;
    }
  }

  // If numeric, look up folder_id from database
  if (/^\d+$/.test(id)) {
    const folderId = getFolderIdByDbId(parseInt(id, 10));
    return folderId;
  }

  // Try as folder ID directly (might be a slug without the hash)
  const folderPath = path.join(LOCAL_VIDEOS_DIR, id);
  try {
    fs.accessSync(folderPath);
    return id;
  } catch {
    return null;
  }
}

export interface VideoDetails {
  id: string;
  title: string;
  duration: number;           // seconds
  frameCount: number;
  thumbnailUrl: string;
  frameInterval: number;      // seconds between frames
}

export interface VideoChapter {
  timestamp: number;          // seconds
  title: string;
  frameUrl?: string;          // optional thumbnail for chapter
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoManifest {
  source_id: string;
  source_url: string;
  source_title: string;
  source_type: string;
  extracted_at: string;
  frame_interval_sec: number;
  frame_count: number;
  video_duration_sec: number;
  frames: {
    file: string;
    timestamp_sec: number;
    timestamp_str: string;
    transcript_segment: string;
  }[];
}

/**
 * Get all available video IDs from the local-videos directory
 */
export async function getVideoIds(): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(LOCAL_VIDEOS_DIR, { withFileTypes: true });
    const videoIds: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if manifest.json exists
        const manifestPath = path.join(LOCAL_VIDEOS_DIR, entry.name, 'manifest.json');
        try {
          await fs.promises.access(manifestPath);
          videoIds.push(entry.name);
        } catch {
          // No manifest, skip this directory
        }
      }
    }

    return videoIds;
  } catch (error) {
    console.error('Error reading video directory:', error);
    return [];
  }
}

/**
 * Read the manifest.json for a video
 */
export async function getVideoManifest(videoId: string): Promise<VideoManifest | null> {
  try {
    const manifestPath = path.join(LOCAL_VIDEOS_DIR, videoId, 'manifest.json');
    const data = await fs.promises.readFile(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading manifest for ${videoId}:`, error);
    return null;
  }
}

/**
 * Get video details from manifest
 */
export async function getVideoDetails(videoId: string): Promise<VideoDetails | null> {
  const manifest = await getVideoManifest(videoId);
  if (!manifest) return null;

  // Clean up the title (remove underscores, clean up formatting)
  const cleanTitle = manifest.source_title
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Use frame 3 or 4 as thumbnail (usually more representative)
  const thumbnailFrame = manifest.frames[3] || manifest.frames[2] || manifest.frames[0];
  const frameNumber = thumbnailFrame ?
    parseInt(thumbnailFrame.file.replace('frame_', '').replace('.jpg', '')) : 1;

  return {
    id: videoId,
    title: cleanTitle,
    duration: manifest.video_duration_sec,
    frameCount: manifest.frame_count,
    thumbnailUrl: `/api/tcm/frames/${encodeURIComponent(videoId)}/${frameNumber}`,
    frameInterval: manifest.frame_interval_sec
  };
}

/**
 * Get all videos for the library
 */
export async function getLibraryVideos(): Promise<VideoDetails[]> {
  const videoIds = await getVideoIds();
  const videos: VideoDetails[] = [];

  for (const id of videoIds) {
    const details = await getVideoDetails(id);
    if (details) {
      videos.push(details);
    }
  }

  // Sort by title alphabetically
  return videos.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Generate chapters from manifest frames
 * Uses frame timestamps and transcript segments
 */
export async function getVideoChapters(videoId: string): Promise<VideoChapter[]> {
  const manifest = await getVideoManifest(videoId);
  if (!manifest) return [];

  const chapters: VideoChapter[] = [];

  for (const frame of manifest.frames) {
    // Extract first sentence or meaningful phrase from transcript segment
    const title = extractChapterTitle(frame.transcript_segment, frame.timestamp_sec);
    const frameNumber = parseInt(frame.file.replace('frame_', '').replace('.jpg', ''));

    chapters.push({
      timestamp: frame.timestamp_sec,
      title,
      frameUrl: `/api/tcm/frames/${encodeURIComponent(videoId)}/${frameNumber}`
    });
  }

  return chapters;
}

/**
 * Extract a meaningful chapter title from transcript text
 */
function extractChapterTitle(text: string, timestampSec: number): string {
  if (!text || text.trim().length === 0) {
    return formatTimestamp(timestampSec);
  }

  // Clean up the text
  let cleaned = text.trim();

  // Try to get first sentence
  const sentenceMatch = cleaned.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length >= 10) {
    cleaned = sentenceMatch[0];
  }

  // Truncate to reasonable length
  if (cleaned.length > 60) {
    cleaned = cleaned.substring(0, 57) + '...';
  }

  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  return cleaned;
}

/**
 * Get transcript segments for a video
 */
export async function getVideoTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    const transcriptPath = path.join(LOCAL_VIDEOS_DIR, videoId, 'transcript_timed.json');
    const data = await fs.promises.readFile(transcriptPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading transcript for ${videoId}:`, error);
    return [];
  }
}

/**
 * Get grouped transcript segments (grouped by ~30 second intervals for display)
 */
export async function getGroupedTranscript(videoId: string, intervalSec: number = 30): Promise<{
  timestamp: number;
  text: string;
}[]> {
  const segments = await getVideoTranscript(videoId);
  if (segments.length === 0) return [];

  const grouped: { timestamp: number; text: string }[] = [];
  let currentGroup: { timestamp: number; texts: string[] } | null = null;

  for (const segment of segments) {
    const groupTimestamp = Math.floor(segment.start / intervalSec) * intervalSec;

    if (!currentGroup || currentGroup.timestamp !== groupTimestamp) {
      if (currentGroup) {
        grouped.push({
          timestamp: currentGroup.timestamp,
          text: currentGroup.texts.join(' ')
        });
      }
      currentGroup = { timestamp: groupTimestamp, texts: [segment.text] };
    } else {
      currentGroup.texts.push(segment.text);
    }
  }

  // Push last group
  if (currentGroup) {
    grouped.push({
      timestamp: currentGroup.timestamp,
      text: currentGroup.texts.join(' ')
    });
  }

  return grouped;
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration for display (e.g., "1hr 21min")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}hr ${minutes}min`;
  }
  return `${minutes}min`;
}

/**
 * Find the transcript segment at a given timestamp
 */
export function findSegmentAtTime(segments: TranscriptSegment[], time: number): TranscriptSegment | null {
  for (const segment of segments) {
    if (time >= segment.start && time <= segment.end) {
      return segment;
    }
  }
  // If no exact match, find closest
  let closest: TranscriptSegment | null = null;
  let minDiff = Infinity;

  for (const segment of segments) {
    const diff = Math.abs(segment.start - time);
    if (diff < minDiff) {
      minDiff = diff;
      closest = segment;
    }
  }

  return closest;
}
