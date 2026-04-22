import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, readdirSync, statSync, mkdirSync, readFileSync } from 'fs';

const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');
const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');
const MIGRATIONS_PATH = join(process.cwd(), '..', 'data', 'migrations');

// Get writable database connection
export function getDb() {
  return new Database(DB_PATH);
}

// Ensure admin tables exist
export function ensureAdminTables() {
  const db = getDb();

  // Run base admin tables migration
  const migration010Path = join(MIGRATIONS_PATH, '010_add_admin_tables.sql');
  if (existsSync(migration010Path)) {
    const sql = readFileSync(migration010Path, 'utf-8');
    db.exec(sql);
  }

  // Run folder_id migration (idempotent - uses IF NOT EXISTS pattern)
  const migration011Path = join(MIGRATIONS_PATH, '011_add_folder_id.sql');
  if (existsSync(migration011Path)) {
    try {
      // Check if folder_id column already exists
      const columns = db.prepare("PRAGMA table_info(processed_local_videos)").all() as { name: string }[];
      const hasFolderId = columns.some(col => col.name === 'folder_id');

      if (!hasFolderId) {
        const sql = readFileSync(migration011Path, 'utf-8');
        db.exec(sql);
      }
    } catch {
      // Table might not exist yet, skip this migration
    }
  }

  // Run lesson readiness migration
  const migration041Path = join(MIGRATIONS_PATH, '041_add_video_lesson_readiness.sql');
  if (existsSync(migration041Path)) {
    try {
      const columns = db.prepare("PRAGMA table_info(processed_local_videos)").all() as { name: string }[];
      const hasIsPublished = columns.some(col => col.name === 'is_published');

      if (!hasIsPublished) {
        const sql = readFileSync(migration041Path, 'utf-8');
        db.exec(sql);
      }
    } catch {
      // Table might not exist yet, skip this migration
    }
  }

  db.close();
}

// Video processing job type
export interface ProcessingJob {
  id: number;
  video_id: number | null;
  job_type: string;
  whisper_model: string;
  frame_interval: number;
  extraction_mode: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  current_step: string | null;
  progress_percent: number;
  checkpoint_type: string | null;
  checkpoint_data: string | null;
  checkpoint_response: string | null;
  skills_extracted: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Processed video type
export interface ProcessedVideo {
  id: number;
  filename: string;
  file_path: string;
  file_hash: string | null;
  file_size_bytes: number | null;
  folder_id: string | null;  // Folder name on disk (e.g., "slug_hash")
  duration_sec: number | null;
  frame_count: number | null;
  resolution: string | null;
  transcript_method: string | null;
  whisper_model: string | null;
  transcript_path: string | null;
  skills_extracted: number;
  sad_path: string | null;
  pine_path: string | null;
  processing_status: string;
  error_message: string | null;
  title: string | null;
  description: string | null;
  source_type: string | null;
  is_published: number | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
}

// Upload session type
export interface UploadSession {
  id: string;
  filename: string;
  file_size: number;
  total_chunks: number;
  received_chunks: number;
  chunk_size: number;
  status: 'uploading' | 'complete' | 'failed' | 'expired' | 'duplicate';
  temp_path: string | null;
  created_at: string;
  expires_at: string | null;
}

// Processing event type
export interface ProcessingEvent {
  id: number;
  job_id: number;
  event_type: 'progress' | 'status' | 'checkpoint' | 'error' | 'log';
  event_data: string | null;
  created_at: string;
}

// ============ Video Operations ============

export function getAllVideos(): ProcessedVideo[] {
  const db = getDb();
  try {
    const videos = db.prepare(`
      SELECT * FROM processed_local_videos
      ORDER BY created_at DESC
    `).all() as ProcessedVideo[];
    return videos;
  } finally {
    db.close();
  }
}

export function getVideoById(id: number): ProcessedVideo | null {
  const db = getDb();
  try {
    const video = db.prepare(`
      SELECT * FROM processed_local_videos WHERE id = ?
    `).get(id) as ProcessedVideo | undefined;
    return video || null;
  } finally {
    db.close();
  }
}

export function getPublishedReadyVideoById(id: number): ProcessedVideo | null {
  const db = getDb();
  try {
    const video = db.prepare(`
      SELECT * FROM processed_local_videos
      WHERE id = ?
        AND processing_status = 'ready'
        AND COALESCE(is_published, 0) = 1
    `).get(id) as ProcessedVideo | undefined;
    return video && existsSync(video.file_path) ? video : null;
  } finally {
    db.close();
  }
}

export function getVideoByHash(hash: string): ProcessedVideo | null {
  const db = getDb();
  try {
    const video = db.prepare(`
      SELECT * FROM processed_local_videos WHERE file_hash = ?
    `).get(hash) as ProcessedVideo | undefined;
    return video || null;
  } finally {
    db.close();
  }
}

export function getVideoByFolderId(folderId: string): ProcessedVideo | null {
  const db = getDb();
  try {
    const video = db.prepare(`
      SELECT * FROM processed_local_videos WHERE folder_id = ?
    `).get(folderId) as ProcessedVideo | undefined;
    return video || null;
  } finally {
    db.close();
  }
}

export function getPublishedReadyVideoByFolderId(folderId: string): ProcessedVideo | null {
  const db = getDb();
  try {
    const video = db.prepare(`
      SELECT * FROM processed_local_videos
      WHERE folder_id = ?
        AND processing_status = 'ready'
        AND COALESCE(is_published, 0) = 1
    `).get(folderId) as ProcessedVideo | undefined;
    return video && existsSync(video.file_path) ? video : null;
  } finally {
    db.close();
  }
}

export function getFolderIdByDbId(id: number): string | null {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT folder_id FROM processed_local_videos WHERE id = ?
    `).get(id) as { folder_id: string | null } | undefined;
    return row?.folder_id || null;
  } finally {
    db.close();
  }
}

export function getPublishedReadyVideos(): ProcessedVideo[] {
  const db = getDb();
  try {
    return (db.prepare(`
      SELECT * FROM processed_local_videos
      WHERE processing_status = 'ready'
        AND COALESCE(is_published, 0) = 1
        AND folder_id IS NOT NULL
      ORDER BY COALESCE(title, filename) ASC
    `).all() as ProcessedVideo[]).filter((video) => existsSync(video.file_path));
  } finally {
    db.close();
  }
}

export function createVideo(data: {
  filename: string;
  file_path: string;
  file_hash?: string;
  file_size_bytes?: number;
  title?: string;
  source_type?: string;
  folder_id?: string;
  processing_status?: string;
  is_published?: boolean;
}): number {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO processed_local_videos (
        filename,
        file_path,
        file_hash,
        file_size_bytes,
        title,
        source_type,
        folder_id,
        processing_status,
        is_published
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.filename,
      data.file_path,
      data.file_hash || null,
      data.file_size_bytes || null,
      data.title || data.filename.replace(/\.[^/.]+$/, ''),
      data.source_type || 'other',
      data.folder_id || null,
      data.processing_status || 'pending',
      data.is_published ? 1 : 0
    );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateVideo(id: number, data: Partial<ProcessedVideo>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db.prepare(`
      UPDATE processed_local_videos
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function deleteVideo(id: number): boolean {
  const db = getDb();
  try {
    // Delete associated jobs first
    db.prepare('DELETE FROM video_processing_jobs WHERE video_id = ?').run(id);
    const result = db.prepare('DELETE FROM processed_local_videos WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============ Job Operations ============

export function getAllJobs(): ProcessingJob[] {
  const db = getDb();
  try {
    const jobs = db.prepare(`
      SELECT * FROM video_processing_jobs
      ORDER BY created_at DESC
    `).all() as ProcessingJob[];
    return jobs;
  } finally {
    db.close();
  }
}

export function getActiveJobs(): ProcessingJob[] {
  const db = getDb();
  try {
    const jobs = db.prepare(`
      SELECT * FROM video_processing_jobs
      WHERE status IN ('queued', 'running', 'paused')
      ORDER BY created_at ASC
    `).all() as ProcessingJob[];
    return jobs;
  } finally {
    db.close();
  }
}

export function getPendingCheckpoints(): ProcessingJob[] {
  const db = getDb();
  try {
    const jobs = db.prepare(`
      SELECT * FROM video_processing_jobs
      WHERE status = 'paused' AND checkpoint_type IS NOT NULL
      ORDER BY created_at ASC
    `).all() as ProcessingJob[];
    return jobs;
  } finally {
    db.close();
  }
}

export function getJobById(id: number): ProcessingJob | null {
  const db = getDb();
  try {
    const job = db.prepare(`
      SELECT * FROM video_processing_jobs WHERE id = ?
    `).get(id) as ProcessingJob | undefined;
    return job || null;
  } finally {
    db.close();
  }
}

export function getJobByVideoId(videoId: number): ProcessingJob | null {
  const db = getDb();
  try {
    const job = db.prepare(`
      SELECT * FROM video_processing_jobs
      WHERE video_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(videoId) as ProcessingJob | undefined;
    return job || null;
  } finally {
    db.close();
  }
}

export function createJob(data: {
  video_id: number;
  job_type?: string;
  whisper_model?: string;
  frame_interval?: number;
  extraction_mode?: string;
}): number {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO video_processing_jobs (video_id, job_type, whisper_model, frame_interval, extraction_mode, status)
      VALUES (?, ?, ?, ?, ?, 'queued')
    `).run(
      data.video_id,
      data.job_type || 'initial',
      data.whisper_model || 'base',
      data.frame_interval || 45,
      data.extraction_mode || 'reflective'
    );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateJob(id: number, data: Partial<ProcessingJob>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`
      UPDATE video_processing_jobs
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function setJobCheckpoint(id: number, checkpointType: string, checkpointData: object): boolean {
  return updateJob(id, {
    status: 'paused',
    checkpoint_type: checkpointType,
    checkpoint_data: JSON.stringify(checkpointData)
  });
}

export function respondToCheckpoint(id: number, response: object): boolean {
  return updateJob(id, {
    status: 'running',
    checkpoint_response: JSON.stringify(response),
    checkpoint_type: null,
    checkpoint_data: null
  });
}

// ============ Upload Session Operations ============

export function createUploadSession(data: {
  id: string;
  filename: string;
  file_size: number;
  total_chunks: number;
  chunk_size?: number;
  temp_path: string;
}): boolean {
  const db = getDb();
  try {
    // Expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO upload_sessions (id, filename, file_size, total_chunks, chunk_size, temp_path, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.filename,
      data.file_size,
      data.total_chunks,
      data.chunk_size || 5242880,
      data.temp_path,
      expiresAt
    );
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export function getUploadSession(id: string): UploadSession | null {
  const db = getDb();
  try {
    const session = db.prepare(`
      SELECT * FROM upload_sessions WHERE id = ?
    `).get(id) as UploadSession | undefined;
    return session || null;
  } finally {
    db.close();
  }
}

export function updateUploadSession(id: string, data: Partial<UploadSession>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`
      UPDATE upload_sessions
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function incrementUploadChunk(id: string): number {
  const db = getDb();
  try {
    db.prepare(`
      UPDATE upload_sessions
      SET received_chunks = received_chunks + 1
      WHERE id = ?
    `).run(id);

    const session = db.prepare(`SELECT received_chunks FROM upload_sessions WHERE id = ?`).get(id) as { received_chunks: number } | undefined;
    return session?.received_chunks || 0;
  } finally {
    db.close();
  }
}

export function deleteUploadSession(id: string): boolean {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM upload_sessions WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============ Event Operations ============

export function addProcessingEvent(jobId: number, eventType: string, eventData: object | null): number {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO processing_events (job_id, event_type, event_data)
      VALUES (?, ?, ?)
    `).run(jobId, eventType, eventData ? JSON.stringify(eventData) : null);
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function getRecentEvents(jobId: number, limit: number = 50): ProcessingEvent[] {
  const db = getDb();
  try {
    const events = db.prepare(`
      SELECT * FROM processing_events
      WHERE job_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(jobId, limit) as ProcessingEvent[];
    return events;
  } finally {
    db.close();
  }
}

export function getEventsSince(since: string): ProcessingEvent[] {
  const db = getDb();
  try {
    const events = db.prepare(`
      SELECT * FROM processing_events
      WHERE created_at > ?
      ORDER BY created_at ASC
    `).all(since) as ProcessingEvent[];
    return events;
  } finally {
    db.close();
  }
}

// ============ Stats ============

export interface AdminStats {
  totalVideos: number;
  queuedJobs: number;
  runningJobs: number;
  pendingCheckpoints: number;
  totalSkills: number;
  completedToday: number;
}

export function getAdminStats(): AdminStats {
  const db = getDb();
  try {
    const totalVideos = (db.prepare('SELECT COUNT(*) as count FROM processed_local_videos').get() as { count: number }).count;
    const queuedJobs = (db.prepare("SELECT COUNT(*) as count FROM video_processing_jobs WHERE status = 'queued'").get() as { count: number }).count;
    const runningJobs = (db.prepare("SELECT COUNT(*) as count FROM video_processing_jobs WHERE status = 'running'").get() as { count: number }).count;
    const pendingCheckpoints = (db.prepare("SELECT COUNT(*) as count FROM video_processing_jobs WHERE status = 'paused' AND checkpoint_type IS NOT NULL").get() as { count: number }).count;
    const totalSkills = (db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number }).count;

    const today = new Date().toISOString().split('T')[0];
    const completedToday = (db.prepare(`
      SELECT COUNT(*) as count FROM video_processing_jobs
      WHERE status = 'completed' AND completed_at >= ?
    `).get(today) as { count: number }).count;

    return {
      totalVideos,
      queuedJobs,
      runningJobs,
      pendingCheckpoints,
      totalSkills,
      completedToday
    };
  } finally {
    db.close();
  }
}

// ============ Local Video Folder Utilities ============

export function getLocalVideoFolders(): { id: string; name: string; hasFrames: boolean; hasTranscript: boolean; fileCount: number }[] {
  if (!existsSync(LOCAL_VIDEOS_PATH)) {
    return [];
  }

  const folders = readdirSync(LOCAL_VIDEOS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory());

  return folders.map(folder => {
    const folderPath = join(LOCAL_VIDEOS_PATH, folder.name);
    const framesPath = join(folderPath, 'frames');
    const transcriptPath = join(folderPath, 'transcript.txt');

    let fileCount = 0;
    if (existsSync(framesPath)) {
      fileCount = readdirSync(framesPath).length;
    }

    return {
      id: folder.name,
      name: folder.name.replace(/_[a-f0-9]+$/, '').replace(/_/g, ' '),
      hasFrames: existsSync(framesPath),
      hasTranscript: existsSync(transcriptPath),
      fileCount
    };
  });
}
