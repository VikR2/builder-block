import { randomBytes, createHash } from 'crypto';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'fs';
import {
  createUploadSession,
  getUploadSession,
  updateUploadSession,
  incrementUploadChunk,
  deleteUploadSession,
  createVideo,
  createJob,
  getVideoByHash
} from './db';

const TEMP_UPLOADS_PATH = join(process.cwd(), '..', 'data', 'uploads-temp');
const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');

// Ensure temp uploads directory exists
export function ensureTempDir() {
  if (!existsSync(TEMP_UPLOADS_PATH)) {
    mkdirSync(TEMP_UPLOADS_PATH, { recursive: true });
  }
}

// Generate unique upload session ID
export function generateUploadId(): string {
  return randomBytes(16).toString('hex');
}

// Calculate file hash
export function calculateFileHash(filePath: string): string {
  const { readFileSync } = require('fs');
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// Slugify filename for folder name
export function slugifyFilename(filename: string): string {
  const name = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

// Initialize upload session
export function initializeUpload(params: {
  filename: string;
  fileSize: number;
  chunkSize?: number;
}): { uploadId: string; totalChunks: number } | null {
  ensureTempDir();

  const uploadId = generateUploadId();
  const chunkSize = params.chunkSize || 5 * 1024 * 1024; // 5MB default
  const totalChunks = Math.ceil(params.fileSize / chunkSize);
  const tempPath = join(TEMP_UPLOADS_PATH, uploadId);

  // Create temp directory for this upload
  mkdirSync(tempPath, { recursive: true });

  const success = createUploadSession({
    id: uploadId,
    filename: params.filename,
    file_size: params.fileSize,
    total_chunks: totalChunks,
    chunk_size: chunkSize,
    temp_path: tempPath
  });

  if (!success) {
    return null;
  }

  return { uploadId, totalChunks };
}

// Receive a chunk
export function receiveChunk(uploadId: string, chunkIndex: number, data: Buffer): {
  success: boolean;
  receivedChunks: number;
  totalChunks: number;
  complete: boolean;
  error?: string;
} {
  const session = getUploadSession(uploadId);

  if (!session) {
    return { success: false, receivedChunks: 0, totalChunks: 0, complete: false, error: 'Session not found' };
  }

  if (session.status !== 'uploading') {
    return { success: false, receivedChunks: session.received_chunks, totalChunks: session.total_chunks, complete: false, error: 'Session is not in uploading state' };
  }

  // Write chunk to temp file
  const chunkPath = join(session.temp_path!, `chunk_${chunkIndex.toString().padStart(6, '0')}`);
  try {
    writeFileSync(chunkPath, data);
  } catch (err) {
    return { success: false, receivedChunks: session.received_chunks, totalChunks: session.total_chunks, complete: false, error: 'Failed to write chunk' };
  }

  // Increment counter
  const receivedChunks = incrementUploadChunk(uploadId);
  const complete = receivedChunks >= session.total_chunks;

  return {
    success: true,
    receivedChunks,
    totalChunks: session.total_chunks,
    complete
  };
}

// Finalize upload - combine chunks and move to final location
export function finalizeUpload(uploadId: string, options?: {
  title?: string;
  sourceType?: string;
  autoProcess?: boolean;
}): {
  success: boolean;
  videoId?: number;
  jobId?: number;
  isDuplicate?: boolean;
  error?: string;
} {
  const session = getUploadSession(uploadId);

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  if (session.received_chunks < session.total_chunks) {
    return { success: false, error: `Upload incomplete: ${session.received_chunks}/${session.total_chunks} chunks` };
  }

  try {
    // Combine chunks into single file
    const tempFilePath = join(session.temp_path!, 'combined.mp4');
    const chunkFiles = readdirSync(session.temp_path!)
      .filter(f => f.startsWith('chunk_'))
      .sort();

    // Write combined file
    for (const chunkFile of chunkFiles) {
      const chunkPath = join(session.temp_path!, chunkFile);
      const chunkData = require('fs').readFileSync(chunkPath);
      appendFileSync(tempFilePath, chunkData);
    }

    // Calculate hash and check for duplicates
    const fileHash = calculateFileHash(tempFilePath);
    
    // Check if video with this hash already exists
    const existingVideo = getVideoByHash(fileHash);
    if (existingVideo) {
      // Clean up temp files since we won't be using them
      for (const chunkFile of chunkFiles) {
        try {
          unlinkSync(join(session.temp_path!, chunkFile));
        } catch { /* ignore cleanup errors */ }
      }
      try {
        unlinkSync(tempFilePath);
        require('fs').rmdirSync(session.temp_path!);
      } catch { /* ignore cleanup errors */ }
      
      updateUploadSession(uploadId, { status: 'duplicate' });
      
      return { 
        success: true, 
        videoId: existingVideo.id, 
        isDuplicate: true,
        error: `Video already exists: "${existingVideo.title || existingVideo.filename}"`
      };
    }
    
    const slug = slugifyFilename(session.filename);
    const shortHash = fileHash.substring(0, 8);
    const folderName = `${slug}_${shortHash}`;
    const finalFolder = join(LOCAL_VIDEOS_PATH, folderName);

    // Ensure local-videos directory exists
    if (!existsSync(LOCAL_VIDEOS_PATH)) {
      mkdirSync(LOCAL_VIDEOS_PATH, { recursive: true });
    }

    // Create final folder
    if (!existsSync(finalFolder)) {
      mkdirSync(finalFolder, { recursive: true });
    }

    // Move file to final location
    const finalFilePath = join(finalFolder, session.filename);
    renameSync(tempFilePath, finalFilePath);

    // Clean up temp directory
    for (const chunkFile of chunkFiles) {
      try {
        unlinkSync(join(session.temp_path!, chunkFile));
      } catch { /* ignore cleanup errors */ }
    }
    try {
      require('fs').rmdirSync(session.temp_path!);
    } catch { /* ignore cleanup errors */ }

    // Get file stats
    const stats = statSync(finalFilePath);

    // Create database record with folder_id for library resolution
    const videoId = createVideo({
      filename: session.filename,
      file_path: finalFilePath,
      file_hash: fileHash,
      file_size_bytes: stats.size,
      title: options?.title || session.filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      source_type: options?.sourceType || 'other',
      folder_id: folderName  // Store folder name for ID resolution
    });

    // Update session status
    updateUploadSession(uploadId, { status: 'complete' });

    // Auto-start processing if requested
    let jobId: number | undefined;
    if (options?.autoProcess !== false) {
      jobId = createJob({ video_id: videoId });

      // Actually start processing - fire and forget
      if (jobId) {
        // Import dynamically to avoid circular dependency
        import('./processor').then(({ startProcessing }) => {
          startProcessing(jobId!).catch(err => {
            console.error('Failed to start processing:', err);
          });
        }).catch(err => {
          console.error('Failed to import processor:', err);
        });
      }
    }

    return { success: true, videoId, jobId };
  } catch (err) {
    updateUploadSession(uploadId, { status: 'failed' });
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Cancel an upload session
export function cancelUpload(uploadId: string): boolean {
  const session = getUploadSession(uploadId);

  if (!session) {
    return false;
  }

  // Clean up temp files
  if (session.temp_path && existsSync(session.temp_path)) {
    try {
      const files = readdirSync(session.temp_path);
      for (const file of files) {
        unlinkSync(join(session.temp_path, file));
      }
      require('fs').rmdirSync(session.temp_path);
    } catch { /* ignore cleanup errors */ }
  }

  // Delete session
  return deleteUploadSession(uploadId);
}

// Clean up expired sessions
export function cleanupExpiredSessions(): number {
  const { getDb } = require('./db');
  const db = getDb();

  try {
    const now = new Date().toISOString();
    const expired = db.prepare(`
      SELECT id, temp_path FROM upload_sessions
      WHERE expires_at < ? AND status = 'uploading'
    `).all(now) as { id: string; temp_path: string }[];

    for (const session of expired) {
      cancelUpload(session.id);
    }

    return expired.length;
  } finally {
    db.close();
  }
}
