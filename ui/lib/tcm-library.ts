/**
 * TCM Video Library - Data Layer
 * Functions for video browsing, metadata, and chapter generation
 */

import fs from 'fs';
import path from 'path';
import {
  ensureAdminTables,
  getPublishedReadyVideoByFolderId,
  getPublishedReadyVideoById,
  getPublishedReadyVideos
} from './tcm-admin/db';
import { readVideoLesson } from './tcm-lessons';

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
  ensureAdminTables();

  if (/^\d+$/.test(id)) {
    return getPublishedReadyVideoById(parseInt(id, 10))?.folder_id || null;
  }

  return getPublishedReadyVideoByFolderId(id)?.folder_id || null;
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

const GENERIC_CHAPTER_TITLE_RE = /^(key teaching moment|lesson section|chapter|\d+:\d{2}(?::\d{2})?)$/i;

function cleanVideoTitle(title: string): string {
  return title
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bFufilment\b/gi, 'Fulfillment')
    .replace(/\bInsighst\b/gi, 'Insights')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get all available video IDs from the local-videos directory
 */
export async function getVideoIds(): Promise<string[]> {
  ensureAdminTables();
  return getPublishedReadyVideos()
    .map(video => video.folder_id)
    .filter((folderId): folderId is string => Boolean(folderId));
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
  const cleanTitle = cleanVideoTitle(manifest.source_title);

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
 * Generate chapters from lesson sections when available.
 * Falls back to a coarse manifest-derived list when lesson data is missing.
 */
export async function getVideoChapters(videoId: string): Promise<VideoChapter[]> {
  const manifest = await getVideoManifest(videoId);
  if (!manifest) return [];

  const lessonChapters = buildLessonChapters(videoId, manifest);
  if (lessonChapters.length > 0) {
    return lessonChapters;
  }

  return buildFallbackChaptersFromManifest(videoId, manifest);
}

function buildLessonChapters(videoId: string, manifest: VideoManifest): VideoChapter[] {
  const lesson = readVideoLesson(path.join(LOCAL_VIDEOS_DIR, videoId));
  if (!lesson || lesson.sections.length === 0) {
    return [];
  }

  const usedTitles = new Set<string>();
  const chapters = lesson.sections
    .slice()
    .sort((left, right) => left.startTime - right.startTime)
    .map((section) => ({
      timestamp: section.startTime,
      title: buildLessonChapterTitle(
        section.title,
        section.summary,
        section.transcriptExcerpt,
        section.startTime,
        usedTitles
      ),
      frameUrl: getNearestFrameUrl(videoId, manifest, section.startTime),
    }))
    .filter((chapter) => chapter.title);

  return dedupeChapters(chapters);
}

function buildFallbackChaptersFromManifest(videoId: string, manifest: VideoManifest): VideoChapter[] {
  const duration = Math.max(0, manifest.video_duration_sec || 0);
  const minGap = Math.max(120, Math.floor(duration / 6) || 120);
  const chapters: VideoChapter[] = [];
  const seenTitles = new Set<string>();
  let lastTimestamp = -Infinity;

  for (const frame of manifest.frames) {
    const timestamp = frame.timestamp_sec;
    const title = extractChapterTitle(frame.transcript_segment, timestamp);
    const normalizedTitle = title.toLowerCase();

    if (chapters.length > 0 && timestamp - lastTimestamp < minGap) {
      continue;
    }

    if (seenTitles.has(normalizedTitle) && chapters.length > 0) {
      continue;
    }

    chapters.push({
      timestamp,
      title,
      frameUrl: getNearestFrameUrl(videoId, manifest, timestamp),
    });

    seenTitles.add(normalizedTitle);
    lastTimestamp = timestamp;

    if (chapters.length >= 8) {
      break;
    }
  }

  return dedupeChapters(chapters);
}

function getNearestFrameUrl(videoId: string, manifest: VideoManifest, timestamp: number): string | undefined {
  if (!manifest.frames.length) {
    return undefined;
  }

  const nearestFrame = manifest.frames
    .slice()
    .sort((left, right) => Math.abs(left.timestamp_sec - timestamp) - Math.abs(right.timestamp_sec - timestamp))[0];

  if (!nearestFrame) {
    return undefined;
  }

  const frameNumber = parseInt(nearestFrame.file.replace('frame_', '').replace('.jpg', ''), 10);
  if (!Number.isFinite(frameNumber)) {
    return undefined;
  }

  return `/api/tcm/frames/${encodeURIComponent(videoId)}/${frameNumber}`;
}

function buildLessonChapterTitle(
  title: string,
  summary: string,
  transcriptExcerpt: string,
  timestampSec: number,
  usedTitles: Set<string>
): string {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim();
  const titleKey = normalizedTitle.toLowerCase();
  const needsFallback = !normalizedTitle
    || GENERIC_CHAPTER_TITLE_RE.test(normalizedTitle)
    || usedTitles.has(titleKey);

  let candidate = needsFallback
    ? extractChapterTitle(summary || transcriptExcerpt, timestampSec)
    : normalizedTitle;

  if (usedTitles.has(candidate.toLowerCase())) {
    candidate = `${candidate} (${formatTimestamp(timestampSec)})`;
  }

  usedTitles.add(candidate.toLowerCase());
  return candidate;
}

function dedupeChapters(chapters: VideoChapter[]): VideoChapter[] {
  const seen = new Set<string>();

  return chapters
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter((chapter) => {
      const key = `${Math.round(chapter.timestamp)}:${chapter.title.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
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
