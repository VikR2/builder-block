import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import {
  getJobById,
  updateJob,
  addProcessingEvent,
  getVideoById,
  updateVideo,
  ProcessingJob
} from './db';
import { resetFAISSCache } from '../tcm-faiss.server';
import { getVideoArtifactStatus } from '../tcm-video-artifacts';

const SCRIPTS_PATH = join(process.cwd(), '..', 'scripts');

async function runPythonJsonScript(args: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', args, {
      cwd: join(process.cwd(), '..'),
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        const jsonLine = stdout
          .split('\n')
          .map(line => line.trim())
          .reverse()
          .find(line => line.startsWith('{'));

        if (!jsonLine) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(jsonLine) as Record<string, unknown>);
        } catch (error) {
          reject(new Error(`Failed to parse JSON output: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      } else {
        reject(new Error(`Embedding process exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

// Helper function to generate FAISS embeddings with proper error handling
async function generateEmbeddings(videoDir: string): Promise<Record<string, unknown>> {
  return runPythonJsonScript([
    join(SCRIPTS_PATH, 'embed_transcripts.py'),
    '--video-dir', videoDir,
    '--json'
  ]);
}

async function generateLesson(videoDir: string): Promise<Record<string, unknown>> {
  return runPythonJsonScript([
    join(SCRIPTS_PATH, 'generate_video_lesson.py'),
    '--video-dir', videoDir,
    '--json'
  ]);
}

async function generateShortsBrief(videoDir: string): Promise<Record<string, unknown>> {
  return runPythonJsonScript([
    join(SCRIPTS_PATH, 'generate_shorts_brief.py'),
    '--video-dir', videoDir,
    '--json'
  ]);
}

// Global process registry for active jobs
const activeProcesses: Map<number, ChildProcess> = new Map();

// Event emitter for broadcasting progress updates
export const processingEvents = new EventEmitter();
processingEvents.setMaxListeners(100); // Allow many SSE connections

export interface ProgressUpdate {
  jobId: number;
  videoId: number | null;
  status: string;
  currentStep: string;
  progressPercent: number;
  message?: string;
  checkpointType?: string;
  checkpointData?: object;
  error?: string;
}

// Broadcast progress update to all listeners
function broadcastProgress(update: ProgressUpdate) {
  processingEvents.emit('progress', update);
  addProcessingEvent(update.jobId, 'progress', update);
}

interface ExtractionResult {
  status?: string;
  output_dir?: string;
  duration_sec?: number;
  frame_count?: number;
  transcript_method?: string;
  whisper_model?: string;
  transcript_path?: string;
  file_hash?: string;
  file_size?: number;
  error?: string;
}

function setStage(jobId: number, videoId: number, stage: string, progressPercent: number, message: string) {
  updateJob(jobId, {
    current_step: stage,
    progress_percent: progressPercent
  });
  updateVideo(videoId, {
    processing_status: stage,
    error_message: null
  });
  broadcastProgress({
    jobId,
    videoId,
    status: 'running',
    currentStep: stage,
    progressPercent,
    message
  });
}

function failProcessing(jobId: number, videoId: number, error: string) {
  updateJob(jobId, {
    status: 'failed',
    error_message: error
  });
  updateVideo(videoId, {
    processing_status: 'failed',
    error_message: error,
    is_published: 0
  });
  broadcastProgress({
    jobId,
    videoId,
    status: 'failed',
    currentStep: 'failed',
    progressPercent: 0,
    error
  });
}

// Start processing a job
export async function startProcessing(jobId: number): Promise<{ success: boolean; error?: string }> {
  const job = getJobById(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.status === 'running') {
    return { success: false, error: 'Job is already running' };
  }

  const video = job.video_id ? getVideoById(job.video_id) : null;
  if (!video) {
    return { success: false, error: 'Video not found' };
  }

  // Update job status to running
  updateJob(jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
    current_step: 'extracting',
    progress_percent: 0
  });

  // Spawn Python processing script
  // Use system Python directly (faster-whisper is installed there)
  // Don't use 'uv run' as it tries to install openai-whisper which has numba compatibility issues
  try {
    const artifacts = getVideoArtifactStatus(video);
    const videoDir = artifacts.videoDir || dirname(video.file_path);
    let extractionResult: ExtractionResult | null = null;
    const finalizeLessonReadyVideo = async () => {
      if (extractionResult?.status === 'error') {
        failProcessing(jobId, video.id, extractionResult.error || 'Extraction failed');
        return;
      }

      updateVideo(video.id, {
        file_hash: extractionResult?.file_hash ?? video.file_hash,
        file_size_bytes: typeof extractionResult?.file_size === 'number' ? extractionResult.file_size : video.file_size_bytes,
        duration_sec: typeof extractionResult?.duration_sec === 'number' ? extractionResult.duration_sec : video.duration_sec,
        frame_count: typeof extractionResult?.frame_count === 'number' ? extractionResult.frame_count : video.frame_count,
        transcript_method: typeof extractionResult?.transcript_method === 'string' ? extractionResult.transcript_method : video.transcript_method,
        whisper_model: typeof extractionResult?.whisper_model === 'string' ? extractionResult.whisper_model : video.whisper_model,
        transcript_path: typeof extractionResult?.transcript_path === 'string' ? extractionResult.transcript_path : video.transcript_path,
        is_published: 0
      });

      const extractionArtifacts = getVideoArtifactStatus({ file_path: video.file_path, folder_id: video.folder_id });
      if (!extractionArtifacts.manifest || !extractionArtifacts.transcript || !extractionArtifacts.frames) {
        failProcessing(jobId, video.id, 'Processing requires transcript, manifest, and frame artifacts before publishing');
        return;
      }

      try {
        if (!extractionArtifacts.embeddings) {
          setStage(jobId, video.id, 'embedding', 92, 'Generating transcript embeddings...');
          await generateEmbeddings(videoDir);
          resetFAISSCache();
        }
      } catch (embedError) {
        failProcessing(jobId, video.id, `Embedding failed: ${embedError instanceof Error ? embedError.message : 'Unknown error'}`);
        return;
      }

      try {
        const lessonArtifacts = getVideoArtifactStatus({ file_path: video.file_path, folder_id: video.folder_id });
        if (!lessonArtifacts.lesson) {
          setStage(jobId, video.id, 'lesson_building', 97, 'Building lesson guide...');
          await generateLesson(videoDir);
        }
      } catch (lessonError) {
        failProcessing(jobId, video.id, `Lesson generation failed: ${lessonError instanceof Error ? lessonError.message : 'Unknown error'}`);
        return;
      }

      try {
        const shortsArtifacts = getVideoArtifactStatus({ file_path: video.file_path, folder_id: video.folder_id });
        if (!shortsArtifacts.shortsBrief) {
          setStage(jobId, video.id, 'shorts_packaging', 99, 'Packaging educational shorts brief...');
          await generateShortsBrief(videoDir);
        }
      } catch (shortsError) {
        failProcessing(jobId, video.id, `Shorts brief generation failed: ${shortsError instanceof Error ? shortsError.message : 'Unknown error'}`);
        return;
      }

      const readyArtifacts = getVideoArtifactStatus({ file_path: video.file_path, folder_id: video.folder_id });
      if (!readyArtifacts.ready) {
        failProcessing(jobId, video.id, 'Processing finished but one or more lesson-ready artifacts are missing');
        return;
      }

      if (!readyArtifacts.shortsBrief) {
        failProcessing(jobId, video.id, 'Processing finished but shorts_brief.json is missing');
        return;
      }

      if (!existsSync(video.file_path)) {
        failProcessing(jobId, video.id, 'Lesson artifacts are ready but the managed video file is missing');
        return;
      }

      updateJob(jobId, {
        status: 'completed',
        current_step: 'ready',
        completed_at: new Date().toISOString(),
        progress_percent: 100
      });
      updateVideo(video.id, {
        processing_status: 'ready',
        processed_at: new Date().toISOString(),
        error_message: null,
        is_published: 1
      });
      broadcastProgress({
        jobId,
        videoId: video.id,
        status: 'completed',
        currentStep: 'ready',
        progressPercent: 100,
        message: 'Lesson-ready video is now published to the library'
      });
    };

    if (!existsSync(video.file_path)) {
      failProcessing(jobId, video.id, 'Managed video file is missing');
      return { success: false, error: 'Managed video file is missing' };
    }

    if (artifacts.ready) {
      setStage(jobId, video.id, 'lesson_building', 97, 'Recovered lesson-ready artifacts found. Publishing...');
      void finalizeLessonReadyVideo();
      return { success: true };
    }

    if (artifacts.transcript && artifacts.manifest && artifacts.frames) {
      setStage(jobId, video.id, 'extracting', 70, 'Transcript, manifest, and frames already exist. Reusing artifacts...');
      void finalizeLessonReadyVideo();
      return { success: true };
    }

    setStage(jobId, video.id, 'extracting', 0, 'Starting extraction...');

    const pythonProcess = spawn('python', [
      join(SCRIPTS_PATH, 'process_local_mp4.py'),
      video.file_path,
      '--output-dir', videoDir,
      '--whisper-model', job.whisper_model,
      '--frame-interval', job.frame_interval.toString(),
      '--existing-video-id', video.id.toString(),
      '--skip-duplicate-check',
      '--skip-db-insert',
      '--emit-progress-json'
    ], {
      cwd: join(process.cwd(), '..'),
      env: { ...process.env }
    });

    activeProcesses.set(jobId, pythonProcess);

    let buffer = '';
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const update = JSON.parse(line.trim()) as Record<string, unknown>;
            if (update.event === 'result') {
              extractionResult = update as ExtractionResult;
            } else {
              handleProgressUpdate(jobId, video.id, update as {
                step?: string;
                progress?: number;
                message?: string;
                checkpoint?: { type: string; data: object };
                skills_extracted?: number;
                error?: string;
              });
            }
          } catch {
            addProcessingEvent(jobId, 'log', { message: line.trim() });
          }
        }
      }
    });

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      console.error(`[Job ${jobId}] stderr:`, message);
      addProcessingEvent(jobId, 'log', { message, level: 'error' });
    });

    pythonProcess.on('close', async (code: number | null) => {
      activeProcesses.delete(jobId);

      if (code === 0) {
        const currentJob = getJobById(jobId);
        if (currentJob?.status !== 'paused') {
          await finalizeLessonReadyVideo();
        }
      } else {
        const currentJob = getJobById(jobId);
        if (currentJob?.status !== 'paused') {
          failProcessing(jobId, video.id, `Process exited with code ${code}`);
        }
      }
    });

    pythonProcess.on('error', (err: Error) => {
      activeProcesses.delete(jobId);
      failProcessing(jobId, video.id, err.message);
    });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to start process';
    failProcessing(jobId, video.id, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Handle progress update from Python script
function handleProgressUpdate(jobId: number, videoId: number, update: {
  step?: string;
  progress?: number;
  message?: string;
  checkpoint?: {
    type: string;
    data: object;
  };
  skills_extracted?: number;
  error?: string;
}) {
  if (update.checkpoint) {
    // Pause job for checkpoint
    updateJob(jobId, {
      status: 'paused',
      checkpoint_type: update.checkpoint.type,
      checkpoint_data: JSON.stringify(update.checkpoint.data)
    });

    broadcastProgress({
      jobId,
      videoId,
      status: 'paused',
      currentStep: update.step || 'checkpoint',
      progressPercent: update.progress || 0,
      message: update.message || 'Waiting for user input',
      checkpointType: update.checkpoint.type,
      checkpointData: update.checkpoint.data
    });
  } else if (update.error) {
    failProcessing(jobId, videoId, update.error);
  } else {
    // Normal progress update
    const jobUpdate: Partial<ProcessingJob> = {};
    if (update.step) jobUpdate.current_step = update.step;
    if (update.progress !== undefined) jobUpdate.progress_percent = update.progress;
    if (update.skills_extracted !== undefined) jobUpdate.skills_extracted = update.skills_extracted;

    if (Object.keys(jobUpdate).length > 0) {
      updateJob(jobId, jobUpdate);
    }

    if (update.step === 'extracting') {
      updateVideo(videoId, {
        processing_status: 'extracting',
        error_message: null
      });
    }

    broadcastProgress({
      jobId,
      videoId,
      status: 'running',
      currentStep: update.step || 'processing',
      progressPercent: update.progress || 0,
      message: update.message
    });
  }
}

// Stop a running job
export function stopProcessing(jobId: number): boolean {
  const process = activeProcesses.get(jobId);
  if (process) {
    process.kill('SIGTERM');
    activeProcesses.delete(jobId);
    updateJob(jobId, { status: 'failed', error_message: 'Cancelled by user' });
    return true;
  }
  return false;
}

// Resume a paused job after checkpoint response
export async function resumeProcessing(jobId: number, checkpointResponse: object): Promise<{ success: boolean; error?: string }> {
  const job = getJobById(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.status !== 'paused') {
    return { success: false, error: 'Job is not paused' };
  }

  // Store checkpoint response
  updateJob(jobId, {
    checkpoint_response: JSON.stringify(checkpointResponse),
    checkpoint_type: null,
    checkpoint_data: null,
    status: 'queued' // Re-queue for continuation
  });

  // Re-start processing with checkpoint response
  return startProcessing(jobId);
}

// Get currently running jobs
export function getRunningJobs(): number[] {
  return Array.from(activeProcesses.keys());
}

// Check if a job is running
export function isJobRunning(jobId: number): boolean {
  return activeProcesses.has(jobId);
}

// Process next job in queue
export async function processNextJob(): Promise<{ started: boolean; jobId?: number }> {
  const { getActiveJobs } = require('./db');
  const jobs = getActiveJobs();

  // Find first queued job
  const queuedJob = jobs.find((j: ProcessingJob) => j.status === 'queued');
  if (!queuedJob) {
    return { started: false };
  }

  const result = await startProcessing(queuedJob.id);
  if (result.success) {
    return { started: true, jobId: queuedJob.id };
  }

  return { started: false };
}

// API endpoint handler for progress updates from Python script
export function handleProgressCallback(body: {
  jobId: number;
  step?: string;
  progress?: number;
  message?: string;
  checkpoint?: { type: string; data: object };
  skills_extracted?: number;
  error?: string;
}): void {
  const job = getJobById(body.jobId);
  if (!job || !job.video_id) return;

  handleProgressUpdate(body.jobId, job.video_id, body);
}
