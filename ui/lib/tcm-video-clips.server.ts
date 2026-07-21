/**
 * TCM Video Clips - Server-Side Dynamic Transcript Search
 *
 * This file provides video clip search with two modes:
 * 1. FAISS semantic search (preferred) - understands meaning, not just keywords
 * 2. Keyword fallback - used when FAISS is unavailable
 *
 * Use this in API routes only, NOT in client components.
 */

import { getVideoTranscript, getLocalVideos, TranscriptSegment } from './tcm-db';
import { VideoClipInfo, formatTimeSeconds } from './tcm-video-clips';
import { searchFAISS, searchFAISSWithBoundary, isFAISSAvailable, FAISSResult } from './tcm-faiss.server';

// Cache for discovered video clips (persists across requests in same server instance)
const videoClipCache = new Map<string, VideoClipInfo | null>();

// Stop words to filter from search queries (used for keyword fallback)
const STOP_WORDS = new Set([
  'explain', 'what', 'is', 'are', 'how', 'the', 'a', 'an', 'to', 'for', 'of', 'in',
  'on', 'with', 'about', 'can', 'you', 'me', 'tell', 'show', 'describe', 'help',
  'please', 'i', 'my', 'do', 'does', 'and', 'or', 'this', 'that', 'it', 'be'
]);

// Extract meaningful keywords from a query
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Validate that query keywords appear in video title.
 * Logs warning if there's a potential mismatch (query about topic X returns video not about X).
 */
function validateTitleMatch(query: string, videoTitle: string): boolean {
  const queryWords = extractKeywords(query);
  const titleLower = videoTitle.toLowerCase();

  // Check if any significant query word (4+ chars) appears in title
  const significantWords = queryWords.filter(w => w.length >= 4);
  const hasOverlap = significantWords.some(word => titleLower.includes(word));

  if (!hasOverlap && significantWords.length > 0) {
    console.warn(`[TCM Validation] Possible mismatch: query "${query}" returned video "${videoTitle}"`);
    console.warn(`[TCM Validation] Query keywords: [${significantWords.join(', ')}] not found in title`);
    return false;
  }

  return true;
}

// Normalize query to cache key (sorted keywords joined)
function getCacheKey(query: string): string {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return query.toLowerCase().trim();
  }
  return keywords.sort().join('_');
}

/**
 * Find video clip for a query using FAISS semantic search with keyword fallback
 *
 * @param query - User's question or search term
 * @returns VideoClipInfo with timestamp window around best matching transcript segment
 */
export async function findVideoClipForQuery(query: string): Promise<VideoClipInfo | null> {
  const cacheKey = getCacheKey(query);

  // 1. Check cache first
  if (videoClipCache.has(cacheKey)) {
    const cached = videoClipCache.get(cacheKey);
    console.log(`[VideoClip Cache HIT] key="${cacheKey}"`);
    return cached ?? null;
  }

  console.log(`[VideoClip Cache MISS] key="${cacheKey}" - searching...`);

  // 2. Try FAISS semantic search first
  const faissAvailable = await isFAISSAvailable();

  if (faissAvailable) {
    const clip = await searchWithFAISS(query);
    if (clip) {
      videoClipCache.set(cacheKey, clip);
      return clip;
    }
    // FAISS returned no results, fall through to keyword search
    console.log('[VideoClip] FAISS returned no results, trying keyword fallback');
  }

  // 3. Keyword fallback (original method)
  const clip = searchWithKeywords(query);
  videoClipCache.set(cacheKey, clip);
  return clip;
}

/**
 * Search using FAISS semantic similarity with boundary detection
 *
 * Uses semantic similarity decay to find where the concept explanation ends,
 * rather than using fixed time windows that cut off mid-explanation.
 */
async function searchWithFAISS(query: string): Promise<VideoClipInfo | null> {
  // Use boundary search for intelligent clip end detection
  // Threshold 0.4 = stop when similarity drops below 40% of peak
  // Max extension 300s = 5 minute safety cap
  const match = await searchFAISSWithBoundary(query, 0.4, 300);

  if (!match) {
    // Fall back to regular search if boundary search fails
    console.log('[VideoClip FAISS] Boundary search returned null, trying regular search');
    const results = await searchFAISS(query, 1);
    if (results.length === 0) {
      return null;
    }

    const regularMatch = results[0];
    const videos = getLocalVideos();
    const video = videos.find(v => v.id === regularMatch.videoId);
    const videoTitle = video?.title || regularMatch.videoId;

    console.log(`[VideoClip FAISS] Fallback match: ${regularMatch.videoId} @ ${regularMatch.start.toFixed(1)}s (score: ${regularMatch.score.toFixed(3)})`);
    console.log(`[VideoClip FAISS] Fallback video title: "${videoTitle}"`);

    // Validate title match
    validateTitleMatch(query, videoTitle);

    // Use fixed windows as fallback (original behavior)
    return {
      videoId: regularMatch.videoId,
      videoTitle,
      startTime: Math.max(0, regularMatch.start - 5),
      endTime: regularMatch.end + 30,
      description: `"${regularMatch.text.slice(0, 80)}..."`
    };
  }

  // Get video title from local videos database
  const videos = getLocalVideos();
  const video = videos.find(v => v.id === match.videoId);
  const videoTitle = video?.title || match.videoId;

  // Calculate clip duration for logging
  const duration = match.end - match.start;

  console.log(`[VideoClip FAISS] Boundary match: ${match.videoId}`);
  console.log(`[VideoClip FAISS] Video title: "${videoTitle}"`);
  console.log(`[VideoClip FAISS] Time: ${match.start.toFixed(1)}s - ${match.end.toFixed(1)}s (${duration.toFixed(0)}s duration)`);
  console.log(`[VideoClip FAISS] Score: ${match.score.toFixed(3)}`);

  // Validate title match and log warning if mismatch
  validateTitleMatch(query, videoTitle);

  return {
    videoId: match.videoId,
    videoTitle,
    startTime: Math.max(0, match.start - 10),  // 10 sec intro context (increased from 5)
    endTime: match.end,                         // End already extended by boundary detection
    description: `"${match.text.slice(0, 80)}..."`
  };
}

/**
 * Search using keyword matching (fallback when FAISS unavailable)
 */
function searchWithKeywords(query: string): VideoClipInfo | null {
  // Extract keywords for search
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return null;
  }

  // Search all video transcripts
  const videos = getLocalVideos();
  let bestMatch: {
    videoId: string;
    videoTitle: string;
    segment: TranscriptSegment;
    score: number;
  } | null = null;

  for (const video of videos) {
    const transcript = getVideoTranscript(video.id);
    if (!transcript) continue;

    for (const segment of transcript) {
      const lowerText = segment.text.toLowerCase();

      // Score based on keyword matches
      let score = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          score += 1;
          // Bonus for exact phrase match
          if (lowerText.includes(keywords.join(' '))) {
            score += 2;
          }
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          videoId: video.id,
          videoTitle: video.title,
          segment,
          score
        };
      }
    }
  }

  // No match found
  if (!bestMatch) {
    console.log(`[VideoClip Keyword] No match for keywords: ${keywords.join(', ')}`);
    return null;
  }

  // Create clip with context window
  const clip: VideoClipInfo = {
    videoId: bestMatch.videoId,
    videoTitle: bestMatch.videoTitle,
    startTime: Math.max(0, bestMatch.segment.start - 10),
    endTime: bestMatch.segment.end + 60,
    description: `"${bestMatch.segment.text.slice(0, 80)}..."`
  };

  console.log(`[VideoClip Keyword] Match: ${clip.videoTitle} @ ${formatTimeSeconds(clip.startTime)}-${formatTimeSeconds(clip.endTime)}`);

  return clip;
}

/**
 * Clear the video clip cache (useful for testing or when transcripts update)
 */
export function clearVideoClipCache(): void {
  videoClipCache.clear();
  console.log('[VideoClip] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getVideoClipCacheStats(): { size: number; keys: string[] } {
  return {
    size: videoClipCache.size,
    keys: Array.from(videoClipCache.keys())
  };
}
