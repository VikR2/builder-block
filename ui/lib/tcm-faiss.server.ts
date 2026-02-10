/**
 * TCM FAISS Search - Server-Side Semantic Search
 *
 * Provides semantic search across video transcripts using FAISS embeddings.
 * Calls Python subprocess for vector similarity search.
 *
 * Use this in API routes only, NOT in client components.
 */

import { spawn } from 'child_process';
import { join } from 'path';

export interface FAISSResult {
  videoId: string;
  text: string;
  start: number;
  end: number;
  score: number;
}

// Paths relative to the ui directory (process.cwd() in Next.js)
const PROJECT_ROOT = join(process.cwd(), '..');
const FAISS_SEARCH_SCRIPT = join(PROJECT_ROOT, 'scripts', 'lib', 'faiss_search.py');
const VIDEOS_PATH = join(PROJECT_ROOT, 'data', 'local-videos');

// Cache for checking if FAISS is available
let faissAvailable: boolean | null = null;

/**
 * Check if FAISS search is available (indexes exist and Python deps installed)
 */
export async function isFAISSAvailable(): Promise<boolean> {
  if (faissAvailable !== null) {
    return faissAvailable;
  }

  return new Promise((resolve) => {
    const proc = spawn('python', [
      '-c',
      `
import sys
from pathlib import Path
try:
    import faiss
    import numpy
    from sentence_transformers import SentenceTransformer
except ImportError as e:
    print(f"Missing: {e}", file=sys.stderr)
    sys.exit(1)

# Check for embeddings
videos_path = Path(r'${VIDEOS_PATH.replace(/\\/g, '\\\\')}')
has_embeddings = any((d / 'embeddings.faiss').exists() for d in videos_path.iterdir() if d.is_dir())
if not has_embeddings:
    print("No embeddings found", file=sys.stderr)
    sys.exit(1)
print("OK")
`
    ]);

    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { console.log('[FAISS Check]', data.toString().trim()); });

    proc.on('close', (code) => {
      faissAvailable = code === 0;
      console.log(`[FAISS] Available: ${faissAvailable}`);
      resolve(faissAvailable);
    });

    proc.on('error', () => {
      faissAvailable = false;
      resolve(false);
    });
  });
}

/**
 * Search video transcripts using FAISS semantic similarity
 *
 * @param query - Natural language search query
 * @param topK - Maximum number of results to return
 * @returns Array of search results sorted by similarity score
 */
export async function searchFAISS(query: string, topK: number = 5): Promise<FAISSResult[]> {
  // Check availability first
  const available = await isFAISSAvailable();
  if (!available) {
    console.log('[FAISS] Not available, returning empty results');
    return [];
  }

  return new Promise((resolve) => {
    // Escape single quotes in query for Python string
    const escapedQuery = query.replace(/'/g, "\\'").replace(/"/g, '\\"');

    const pythonCode = `
import sys
import json
from pathlib import Path

# Add scripts/lib to path
sys.path.insert(0, r'${join(PROJECT_ROOT, 'scripts', 'lib').replace(/\\/g, '\\\\')}')

from faiss_search import VideoSearcher

videos_path = Path(r'${VIDEOS_PATH.replace(/\\/g, '\\\\')}')
searcher = VideoSearcher(videos_path)
results = searcher.search_json('${escapedQuery}', ${topK})
print(results)
`;

    const proc = spawn('python', ['-c', pythonCode]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[FAISS] Search error:', stderr);
        resolve([]);
        return;
      }

      try {
        // Get the last line that looks like JSON
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.startsWith('[')) || '[]';
        const results: FAISSResult[] = JSON.parse(jsonLine);
        resolve(results);
      } catch (e) {
        console.error('[FAISS] Failed to parse results:', e, '\nStdout:', stdout);
        resolve([]);
      }
    });

    proc.on('error', (err) => {
      console.error('[FAISS] Process error:', err);
      resolve([]);
    });
  });
}

/**
 * Reset the FAISS availability cache (useful after generating new embeddings)
 */
export function resetFAISSCache(): void {
  faissAvailable = null;
  console.log('[FAISS] Availability cache reset');
}

/**
 * Search video transcripts using FAISS with semantic boundary detection
 *
 * Unlike regular searchFAISS which returns fixed-window clips, this method
 * extends the clip end time by scanning forward through subsequent segments
 * until the semantic similarity drops below a threshold.
 *
 * Features:
 * - Backward extension: includes high-similarity segments before the peak match
 * - Minimum duration: enforces a floor to capture explanations that shift terminology
 *
 * @param query - Natural language search query
 * @param similarityThreshold - Stop when similarity drops below peak * threshold (default 0.4 = 40%)
 * @param maxExtensionSeconds - Safety cap for max clip length (default 300s = 5 minutes)
 * @param minDurationSeconds - Minimum clip duration to enforce (default 60s = 1 minute)
 * @returns Single best match with extended end time, or null if no match
 */
export async function searchFAISSWithBoundary(
  query: string,
  similarityThreshold: number = 0.4,
  maxExtensionSeconds: number = 300,
  minDurationSeconds: number = 60
): Promise<FAISSResult | null> {
  // Check availability first
  const available = await isFAISSAvailable();
  if (!available) {
    console.log('[FAISS] Not available, returning null');
    return null;
  }

  return new Promise((resolve) => {
    // Escape single quotes in query for Python string
    const escapedQuery = query.replace(/'/g, "\\'").replace(/"/g, '\\"');

    const pythonCode = `
import sys
import json
from pathlib import Path

# Add scripts/lib to path
sys.path.insert(0, r'${join(PROJECT_ROOT, 'scripts', 'lib').replace(/\\/g, '\\\\')}')

from faiss_search import VideoSearcher

videos_path = Path(r'${VIDEOS_PATH.replace(/\\/g, '\\\\')}')
searcher = VideoSearcher(videos_path)
result = searcher.search_with_boundary_json('${escapedQuery}', ${similarityThreshold}, ${maxExtensionSeconds}, ${minDurationSeconds})
print(result)
`;

    const proc = spawn('python', ['-c', pythonCode]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => {
      stderr += data;
      // Log boundary search progress (useful for debugging)
      console.log('[FAISS Boundary]', data.toString().trim());
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[FAISS Boundary] Search error:', stderr);
        resolve(null);
        return;
      }

      try {
        // Get the last line that looks like JSON
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.startsWith('{') || line === 'null') || 'null';

        if (jsonLine === 'null') {
          resolve(null);
          return;
        }

        const result: FAISSResult = JSON.parse(jsonLine);
        resolve(result);
      } catch (e) {
        console.error('[FAISS Boundary] Failed to parse result:', e, '\nStdout:', stdout);
        resolve(null);
      }
    });

    proc.on('error', (err) => {
      console.error('[FAISS Boundary] Process error:', err);
      resolve(null);
    });
  });
}
