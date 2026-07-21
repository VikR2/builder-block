import { randomBytes, createHash } from 'crypto';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync, readdirSync, statSync, copyFileSync, readFileSync, rmSync } from 'fs';
import {
  createUploadSession,
  getUploadSession,
  updateUploadSession,
  incrementUploadChunk,
  deleteUploadSession,
  createVideo,
  createJob,
  getVideoByHash,
  getVideoByFolderId,
  getJobByVideoId,
  updateVideo
} from './db';
import { getVideoArtifactStatus } from '../tcm-video-artifacts';

const TEMP_UPLOADS_PATH = join(process.cwd(), '..', 'data', 'uploads-temp');
const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');

// Ensure temp uploads directory exists
export function ensureTempDir() {
  if (!existsSync(TEMP_UPLOADS_PATH)) {
    mkdirSync(TEMP_UPLOADS_PATH, { recursive: true });
  }
}

function ensureLocalVideosDir() {
  if (!existsSync(LOCAL_VIDEOS_PATH)) {
    mkdirSync(LOCAL_VIDEOS_PATH, { recursive: true });
  }
}

// Generate unique upload session ID
export function generateUploadId(): string {
  return randomBytes(16).toString('hex');
}

// Calculate file hash
export function calculateFileHash(filePath: string): string {
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

function isSupportedVideoFile(filePath: string): boolean {
  return /\.(mp4|mov|mkv|webm)$/i.test(filePath);
}

function getManagedFolderName(filename: string, fileHash: string): string {
  const shortHash = fileHash.substring(0, 8);
  ensureLocalVideosDir();

  const existingByHash = readdirSync(LOCAL_VIDEOS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.endsWith(`_${shortHash}`));

  if (existingByHash) {
    return existingByHash;
  }

  return `${slugifyFilename(filename)}_${shortHash}`;
}

function getManagedVideoPath(folderName: string, filename: string): string {
  return join(LOCAL_VIDEOS_PATH, folderName, filename);
}

function ensureManagedVideoCopy(sourcePath: string, folderName: string, filename: string): string {
  ensureLocalVideosDir();
  const targetFolder = join(LOCAL_VIDEOS_PATH, folderName);
  if (!existsSync(targetFolder)) {
    mkdirSync(targetFolder, { recursive: true });
  }

  const targetPath = getManagedVideoPath(folderName, filename);
  if (sourcePath !== targetPath) {
    copyFileSync(sourcePath, targetPath);
  }

  return targetPath;
}

function getOrCreateProcessingJob(videoId: number): number {
  const existingJob = getJobByVideoId(videoId);
  if (existingJob && ['queued', 'running', 'paused'].includes(existingJob.status)) {
    return existingJob.id;
  }

  return createJob({ video_id: videoId });
}

async function autoStartProcessing(jobId: number): Promise<void> {
  const { startProcessing } = await import('./processor');
  await startProcessing(jobId);
}

function reconcileExistingVideo(args: {
  existingVideo: ReturnType<typeof getVideoByHash>;
  filename: string;
  title?: string;
  sourceType?: string;
  fileHash: string;
  sourceFilePath: string;
  fileSizeBytes: number;
  autoProcess?: boolean;
}): {
  success: boolean;
  videoId?: number;
  jobId?: number;
  isDuplicate?: boolean;
  reusedExisting?: boolean;
  error?: string;
} {
  const {
    existingVideo,
    filename,
    title,
    sourceType,
    fileHash,
    sourceFilePath,
    fileSizeBytes,
    autoProcess,
  } = args;

  if (!existingVideo) {
    return { success: false, error: 'Existing video not found' };
  }

  const folderName = existingVideo.folder_id || getManagedFolderName(filename, fileHash);
  const managedVideoPath = ensureManagedVideoCopy(sourceFilePath, folderName, filename);

  updateVideo(existingVideo.id, {
    filename,
    file_path: managedVideoPath,
    file_hash: fileHash,
    file_size_bytes: fileSizeBytes,
    folder_id: folderName,
    title: title || existingVideo.title || filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    source_type: sourceType || existingVideo.source_type || 'other',
    error_message: null
  });

  const refreshedVideo = getVideoByFolderId(folderName) || existingVideo;
  const artifactStatus = getVideoArtifactStatus({
    file_path: managedVideoPath,
    folder_id: folderName
  });

  if (artifactStatus.ready) {
    updateVideo(existingVideo.id, {
      processing_status: 'ready',
      is_published: 1,
      processed_at: new Date().toISOString(),
      error_message: null
    });

    return {
      success: true,
      videoId: existingVideo.id,
      isDuplicate: refreshedVideo.processing_status === 'ready' && (refreshedVideo.is_published ?? 0) === 1,
      reusedExisting: true,
      error: refreshedVideo.processing_status === 'ready' && (refreshedVideo.is_published ?? 0) === 1
        ? `Video already exists: "${refreshedVideo.title || refreshedVideo.filename}"`
        : 'Reused existing video and published the recovered lesson-ready assets'
    };
  }

  let jobId: number | undefined;
  if (autoProcess !== false) {
    jobId = getOrCreateProcessingJob(existingVideo.id);
    autoStartProcessing(jobId).catch((err) => {
      console.error('Failed to start processing:', err);
    });
  }

  return {
    success: true,
    videoId: existingVideo.id,
    jobId,
    reusedExisting: true,
    error: 'Reused existing video and resumed lesson pipeline'
  };
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
  reusedExisting?: boolean;
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
    
    const combinedStats = statSync(tempFilePath);

    // Check if video with this hash already exists
    const existingVideo = getVideoByHash(fileHash);
    if (existingVideo) {
      const reusedResult = reconcileExistingVideo({
        existingVideo,
        filename: session.filename,
        title: options?.title,
        sourceType: options?.sourceType,
        fileHash,
        sourceFilePath: tempFilePath,
        fileSizeBytes: combinedStats.size,
        autoProcess: options?.autoProcess
      });

      for (const chunkFile of chunkFiles) {
        try {
          unlinkSync(join(session.temp_path!, chunkFile));
        } catch { /* ignore cleanup errors */ }
      }
      try {
        unlinkSync(tempFilePath);
      } catch { /* ignore cleanup errors */ }
      try {
        rmSync(session.temp_path!, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }

      updateUploadSession(uploadId, { status: 'duplicate' });

      return reusedResult;
    }

    const folderName = getManagedFolderName(session.filename, fileHash);
    const finalFolder = join(LOCAL_VIDEOS_PATH, folderName);

    ensureLocalVideosDir();

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

    // Create database record with folder_id for library resolution
    const videoId = createVideo({
      filename: session.filename,
      file_path: finalFilePath,
      file_hash: fileHash,
      file_size_bytes: combinedStats.size,
      title: options?.title || session.filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      source_type: options?.sourceType || 'other',
      folder_id: folderName,  // Store folder name for ID resolution
      processing_status: 'uploaded',
      is_published: false
    });

    // Update session status
    updateUploadSession(uploadId, { status: 'complete' });

    // Auto-start processing if requested
    let jobId: number | undefined;
    if (options?.autoProcess !== false) {
      jobId = createJob({ video_id: videoId });

      // Actually start processing - fire and forget
      if (jobId) {
        autoStartProcessing(jobId).catch(err => {
          console.error('Failed to start processing:', err);
        });
      }
    }

    return { success: true, videoId, jobId };
  } catch (err) {
    updateUploadSession(uploadId, { status: 'failed' });
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function importLocalVideo(params: {
  filePath: string;
  title?: string;
  sourceType?: string;
  autoProcess?: boolean;
}): {
  success: boolean;
  videoId?: number;
  jobId?: number;
  isDuplicate?: boolean;
  reusedExisting?: boolean;
  error?: string;
} {
  ensureAdminTablesIfNeeded();

  const sourcePath = params.filePath.trim();
  if (!sourcePath) {
    return { success: false, error: 'filePath is required' };
  }

  if (!existsSync(sourcePath)) {
    return { success: false, error: 'Source file does not exist' };
  }

  if (!isSupportedVideoFile(sourcePath)) {
    return { success: false, error: 'Only video files (mp4, mov, mkv, webm) are supported' };
  }

  const sourceStats = statSync(sourcePath);
  if (!sourceStats.isFile()) {
    return { success: false, error: 'Source path must be a file' };
  }

  const filename = sourcePath.split(/[\\/]/).pop() || 'video.mp4';
  const fileHash = calculateFileHash(sourcePath);
  const existingVideo = getVideoByHash(fileHash);

  if (existingVideo) {
    return reconcileExistingVideo({
      existingVideo,
      filename,
      title: params.title,
      sourceType: params.sourceType,
      fileHash,
      sourceFilePath: sourcePath,
      fileSizeBytes: sourceStats.size,
      autoProcess: params.autoProcess
    });
  }

  const folderName = getManagedFolderName(filename, fileHash);
  const managedVideoPath = ensureManagedVideoCopy(sourcePath, folderName, filename);
  const videoId = createVideo({
    filename,
    file_path: managedVideoPath,
    file_hash: fileHash,
    file_size_bytes: sourceStats.size,
    title: params.title || filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
    source_type: params.sourceType || 'admin_local',
    folder_id: folderName,
    processing_status: 'uploaded',
    is_published: false
  });

  let jobId: number | undefined;
  if (params.autoProcess !== false) {
    jobId = getOrCreateProcessingJob(videoId);
    autoStartProcessing(jobId).catch((err) => {
      console.error('Failed to start processing:', err);
    });
  }

  return { success: true, videoId, jobId };
}

function ensureAdminTablesIfNeeded() {
  const { ensureAdminTables } = require('./db');
  ensureAdminTables();
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
