/**
 * TCM Video Clips - Concept to Timestamp Mapping
 * Maps trading concepts to specific video segments for playback
 *
 * NOTE: This file is used by both client and server code.
 * Dynamic transcript search (server-side) is in tcm-video-clips.server.ts
 */

export interface VideoClipInfo {
  videoId: string;
  videoTitle: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  description?: string;
  relevanceScore?: number;
  source?: string;
  watchLink?: string;
  lessonLink?: string;
}

export interface ConceptVideoMap {
  [concept: string]: VideoClipInfo[];
}

// Known local video files (stored in data/local-videos/)
// These need to be processed and their timestamps mapped
const LOCAL_VIDEOS = {
  'order-fulfillment': {
    id: 'Order-Fufilment-Tips_a89df5aa',
    title: 'Order Fulfillment Tips',
    file: 'Order Fulfillment Tips.mp4'
  },
  'akatsuki-indicator': {
    id: 'TCM_Akatsuki_Bootcamp_indicator_2026_b07e4527',
    title: 'TCM Akatsuki Bootcamp Indicator 2026',
    file: 'TCM Akatsuki Bootcamp indicator 2026.mp4'
  },
  'volume-insights-p2': {
    id: 'volume_insighst_p2_04321b27',
    title: 'Volume Insights P2',
    file: 'Volume Insighst P2.mp4'
  }
};

// Concept to video timestamp mapping
// These timestamps need to be verified/updated based on actual video content
const CONCEPT_CLIPS: ConceptVideoMap = {
  // Submission Range concepts
  'submission_range': [
    {
      videoId: 'Order-Fufilment-Tips_a89df5aa',
      videoTitle: 'Order Fulfillment Tips',
      startTime: 0,
      endTime: 180,
      description: 'Understanding the Submission Range window (12:40 PM - 3:20 PM ET)'
    }
  ],

  // SR Levels
  'sr_levels': [
    {
      videoId: 'Order-Fufilment-Tips_a89df5aa',
      videoTitle: 'Order Fulfillment Tips',
      startTime: 180,
      endTime: 360,
      description: 'SR High, SR Low, and SR Equilibrium levels'
    }
  ],

  // Book Building / Matching
  'book_overlap': [
    {
      videoId: 'Order-Fufilment-Tips_a89df5aa',
      videoTitle: 'Order Fulfillment Tips',
      startTime: 360,
      endTime: 540,
      description: 'How book building and matching works'
    }
  ],

  // STD Targets
  'std_targets': [
    {
      videoId: 'TCM_Akatsuki_Bootcamp_indicator_2026_b07e4527',
      videoTitle: 'TCM Akatsuki Bootcamp Indicator',
      startTime: 600,
      endTime: 900,
      description: 'Standard deviation targets and projections'
    }
  ],

  // Order Fulfillment general
  'order_fulfillment': [
    {
      videoId: 'Order-Fufilment-Tips_a89df5aa',
      videoTitle: 'Order Fulfillment Tips',
      startTime: 0,
      endTime: 120,
      description: 'Introduction to order fulfillment concepts'
    }
  ],

  // Matching Window
  'matching_window': [
    {
      videoId: 'Order-Fufilment-Tips_a89df5aa',
      videoTitle: 'Order Fulfillment Tips',
      startTime: 420,
      endTime: 600,
      description: 'The matching window and order absorption'
    }
  ]
};

// Keywords for detecting which video clip to show
const CLIP_KEYWORDS: Record<string, string[]> = {
  'submission_range': [
    'submission range', 'sr session', 'sr window', '12:40', '3:20',
    'afternoon session'
  ],
  'sr_levels': [
    'sr high', 'sr low', 'sr eq', 'sr equilibrium', 'submission levels'
  ],
  'book_overlap': [
    'book', 'book building', 'order matching', 'matching', 'overlap',
    'buy book', 'sell book'
  ],
  'std_targets': [
    'std', 'standard deviation', 'target', '1.0x', '1.5x', '2.0x',
    'extension', 'projected'
  ],
  'order_fulfillment': [
    'order fulfillment', 'fulfillment', 'order flow', 'orders'
  ],
  'matching_window': [
    'matching window', 'absorption', 'match zone'
  ]
};

/**
 * Detect which video concept a query relates to
 */
export function detectVideoClipConcept(query: string): string | null {
  const lowerQuery = query.toLowerCase();

  for (const [concept, keywords] of Object.entries(CLIP_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      return concept;
    }
  }

  return null;
}

/**
 * Get video clip info for a concept
 */
export function getVideoClipForConcept(concept: string): VideoClipInfo | null {
  const clips = CONCEPT_CLIPS[concept];
  if (!clips || clips.length === 0) {
    return null;
  }
  // Return the first (primary) clip for the concept
  return clips[0];
}

/**
 * Get video clip for a query (keyword-based matching)
 * For dynamic transcript search, use findVideoClipForQuery from tcm-video-clips.server.ts
 */
export function getVideoClipForQuery(query: string): VideoClipInfo | null {
  const concept = detectVideoClipConcept(query);
  if (!concept) {
    return null;
  }
  return getVideoClipForConcept(concept);
}

/**
 * Get all clips for a concept (for showing multiple explanations)
 */
export function getAllClipsForConcept(concept: string): VideoClipInfo[] {
  return CONCEPT_CLIPS[concept] || [];
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTimeSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get the video file path for a given video ID
 * Returns the API route for serving the video
 */
export function getVideoFilePath(videoId: string): string {
  // Videos are served through the API route
  return `/api/tcm/video/${encodeURIComponent(videoId)}`;
}

/**
 * Get available video IDs
 */
export function getAvailableVideoIds(): string[] {
  return Object.values(LOCAL_VIDEOS).map(v => v.id);
}

/**
 * Check if a video ID has a local file
 */
export function hasLocalVideo(videoId: string): boolean {
  return Object.values(LOCAL_VIDEOS).some(v => v.id === videoId);
}
