/**
 * Warm FAISS search worker for TCM transcript retrieval.
 *
 * Keeps a long-lived Python worker process alive so transcript indexes and the
 * embedding model are loaded once and reused across requests.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface FAISSResult {
  videoId: string;
  text: string;
  start: number;
  end: number;
  score: number;
}

type WorkerResponse<T> = {
  id: number | null;
  ok: boolean;
  result?: T;
  error?: string;
};

const PROJECT_ROOT = join(process.cwd(), '..');
const FAISS_WORKER_SCRIPT = join(PROJECT_ROOT, 'scripts', 'lib', 'faiss_search_worker.py');
const VIDEOS_PATH = join(PROJECT_ROOT, 'data', 'local-videos');
const PYTHON_EXECUTABLE = process.env.TCM_FAISS_PYTHON
  || process.env.PYTHON_BIN
  || (process.platform === 'win32' ? 'python' : 'python3');

let worker: ChildProcessWithoutNullStreams | null = null;
let workerReadyPromise: Promise<void> | null = null;
let faissAvailable: boolean | null = null;
let workerCorpusSignature: string | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
}>();

function normalizeQueryForSearch(query: string): string {
  const normalized = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || query.trim();
}

function hasEmbeddingsOnDisk(): boolean {
  if (!existsSync(VIDEOS_PATH)) {
    return false;
  }

  return readdirSync(VIDEOS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .some((entry) => {
      const basePath = join(VIDEOS_PATH, entry.name);
      return existsSync(join(basePath, 'embeddings.faiss')) && existsSync(join(basePath, 'segments.json'));
    });
}

function normalizeCorpusMetadata(metadata: Record<string, unknown>): string {
  const model = typeof metadata.model === 'string' ? metadata.model : 'all-MiniLM-L6-v2';
  const provider = typeof metadata.provider === 'string'
    ? metadata.provider
    : model.startsWith('gemini-embedding')
      ? 'google-gemini-api'
      : 'legacy-minilm';
  const modality = typeof metadata.modality === 'string' ? metadata.modality : 'text';
  const indexVersion = typeof metadata.index_version === 'string'
    ? metadata.index_version
    : provider === 'google-gemini-api'
      ? 'tcm-gemini-v3'
      : 'legacy-minilm-v1';
  const dimension = typeof metadata.dimension === 'number' ? metadata.dimension : 'na';
  const profile = typeof metadata.profile === 'string' ? metadata.profile : 'coarse';

  return `${provider}:${model}:${modality}:${indexVersion}:${dimension}:${profile}`;
}

function readProfileSignature(basePath: string, entryName: string, embeddingsFile: string, metadataFile: string): string | null {
  const segmentsPath = join(basePath, metadataFile);
  const embeddingsPath = join(basePath, embeddingsFile);

  if (!existsSync(segmentsPath) || !existsSync(embeddingsPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(readFileSync(segmentsPath, 'utf-8')) as Record<string, unknown>;
    return `${entryName}|${metadataFile}|${normalizeCorpusMetadata(metadata)}`;
  } catch (error) {
    console.warn('[FAISS] Failed to read segments metadata for signature:', entryName, error);
    return null;
  }
}

function getEmbeddingCorpusSignature(): string | null {
  if (!existsSync(VIDEOS_PATH)) {
    return null;
  }

  const signatures = readdirSync(VIDEOS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const basePath = join(VIDEOS_PATH, entry.name);
      const profileSignatures = [
        readProfileSignature(basePath, entry.name, 'embeddings.faiss', 'segments.json'),
        readProfileSignature(basePath, entry.name, 'embeddings.fine.faiss', 'segments.fine.json'),
      ].filter((value): value is string => Boolean(value));

      if (profileSignatures.length === 0) {
        return null;
      }

      return profileSignatures.join('&&');
    })
    .filter((value): value is string => Boolean(value))
    .sort();

  if (signatures.length === 0) {
    return null;
  }

  return signatures.join('||');
}

function cleanupWorker(reason?: string) {
  if (reason) {
    console.warn('[FAISS] Worker reset:', reason);
  }

  if (worker) {
    try {
      worker.kill();
    } catch {
      // Ignore worker teardown errors.
    }
  }

  worker = null;
  workerReadyPromise = null;
  workerCorpusSignature = null;

  for (const pending of pendingRequests.values()) {
    pending.reject(new Error('FAISS worker stopped before the request completed'));
  }
  pendingRequests.clear();
}

function attachWorkerListeners(proc: ChildProcessWithoutNullStreams, markReady: () => void, markFailed: (error: Error) => void) {
  let stdoutBuffer = '';

  proc.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const payload = JSON.parse(line) as WorkerResponse<unknown> & { type?: string };

        if (payload.type === 'ready') {
          markReady();
          continue;
        }

        if (payload.id === null || payload.id === undefined) {
          continue;
        }

        const pending = pendingRequests.get(payload.id);
        if (!pending) {
          continue;
        }

        pendingRequests.delete(payload.id);
        if (payload.ok) {
          pending.resolve(payload.result);
        } else {
          pending.reject(new Error(payload.error || 'FAISS worker request failed'));
        }
      } catch (error) {
        console.error('[FAISS] Failed to parse worker output:', error, line);
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      console.log('[FAISS Worker]', message);
    }
  });

  proc.on('error', (error) => {
    markFailed(error instanceof Error ? error : new Error(String(error)));
    cleanupWorker(error instanceof Error ? error.message : 'Unknown FAISS worker error');
  });

  proc.on('close', (code) => {
    cleanupWorker(`FAISS worker exited with code ${code}`);
  });
}

async function ensureWorker(): Promise<void> {
  const currentCorpusSignature = getEmbeddingCorpusSignature();

  if (workerReadyPromise) {
    if (workerCorpusSignature && currentCorpusSignature && workerCorpusSignature !== currentCorpusSignature) {
      cleanupWorker('Detected embedding corpus metadata change');
    } else {
      return workerReadyPromise;
    }
  }

  if (!currentCorpusSignature) {
    faissAvailable = false;
    return Promise.reject(new Error('No FAISS embeddings are available on disk'));
  }

  if (workerReadyPromise) {
    return workerReadyPromise;
  }

  workerReadyPromise = new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXECUTABLE, [FAISS_WORKER_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    worker = proc;
    workerCorpusSignature = currentCorpusSignature;

    attachWorkerListeners(
      proc,
      () => {
        faissAvailable = true;
        resolve();
      },
      (error) => {
        faissAvailable = false;
        reject(error);
      }
    );
  });

  return workerReadyPromise;
}

async function sendWorkerRequest<T>(payload: Record<string, unknown>): Promise<T> {
  await ensureWorker();

  if (!worker) {
    throw new Error('FAISS worker is unavailable');
  }

  const id = nextRequestId++;
  const requestPayload = JSON.stringify({ id, ...payload });

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker!.stdin.write(`${requestPayload}\n`, (error) => {
      if (error) {
        pendingRequests.delete(id);
        reject(error);
      }
    });
  });
}

export async function isFAISSAvailable(): Promise<boolean> {
  if (faissAvailable === true) {
    return true;
  }

  if (!hasEmbeddingsOnDisk()) {
    faissAvailable = false;
    return false;
  }

  try {
    await ensureWorker();
    faissAvailable = true;
    return true;
  } catch {
    faissAvailable = false;
    return false;
  }
}

export async function searchFAISS(query: string, topK: number = 5): Promise<FAISSResult[]> {
  const available = await isFAISSAvailable();
  if (!available) {
    return [];
  }

  try {
    const normalizedQuery = normalizeQueryForSearch(query);
    const result = await sendWorkerRequest<FAISSResult[]>({
      command: 'search',
      query: normalizedQuery,
      topK
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('[FAISS] Search error:', error);
    cleanupWorker(error instanceof Error ? error.message : 'Unknown search error');
    faissAvailable = false;
    return [];
  }
}

export async function searchFAISSWithBoundary(
  query: string,
  similarityThreshold: number = 0.4,
  maxExtensionSeconds: number = 300,
  minDurationSeconds: number = 60
): Promise<FAISSResult | null> {
  const available = await isFAISSAvailable();
  if (!available) {
    return null;
  }

  try {
    const normalizedQuery = normalizeQueryForSearch(query);
    const result = await sendWorkerRequest<FAISSResult | null>({
      command: 'search_with_boundary',
      query: normalizedQuery,
      similarityThreshold,
      maxExtensionSeconds,
      minDurationSeconds
    });
    return result ?? null;
  } catch (error) {
    console.error('[FAISS] Boundary search error:', error);
    cleanupWorker(error instanceof Error ? error.message : 'Unknown boundary search error');
    faissAvailable = false;
    return null;
  }
}

export function resetFAISSCache(): void {
  faissAvailable = null;
  cleanupWorker('Manual cache reset');
}
