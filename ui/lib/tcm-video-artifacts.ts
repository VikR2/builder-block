import fs from 'fs';
import path from 'path';

const LOCAL_VIDEOS_DIR = path.join(process.cwd(), '..', 'data', 'local-videos');

export interface VideoArtifactStatus {
  videoDir: string | null;
  videoFile: boolean;
  transcript: boolean;
  frames: boolean;
  manifest: boolean;
  embeddings: boolean;
  lesson: boolean;
  shortsBrief: boolean;
  ready: boolean;
}

interface VideoLocator {
  file_path: string;
  folder_id?: string | null;
}

export function resolveVideoDirectory(video: VideoLocator): string | null {
  if (video.folder_id) {
    return path.join(LOCAL_VIDEOS_DIR, video.folder_id);
  }

  const parentDir = path.dirname(video.file_path);
  if (parentDir.startsWith(LOCAL_VIDEOS_DIR)) {
    return parentDir;
  }

  return null;
}

function hasFrameArtifacts(videoDir: string, manifestExists: boolean): boolean {
  if (manifestExists) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(videoDir, 'manifest.json'), 'utf-8')) as {
        frame_count?: number;
        frames?: unknown[];
      };
      return (manifest.frame_count ?? 0) > 0 || (manifest.frames?.length ?? 0) > 0;
    } catch {
      // Fall back to directory scan below.
    }
  }

  const framesDir = path.join(videoDir, 'frames');
  if (!fs.existsSync(framesDir)) {
    return false;
  }

  return fs.readdirSync(framesDir).some(file => file.toLowerCase().endsWith('.jpg'));
}

export function getVideoArtifactStatus(video: VideoLocator): VideoArtifactStatus {
  const videoDir = resolveVideoDirectory(video);
  if (!videoDir || !fs.existsSync(videoDir)) {
    return {
      videoDir: null,
      videoFile: false,
      transcript: false,
      frames: false,
      manifest: false,
      embeddings: false,
      lesson: false,
      shortsBrief: false,
      ready: false,
    };
  }

  const videoFile = fs.existsSync(video.file_path);
  const transcript = fs.existsSync(path.join(videoDir, 'transcript_timed.json'));
  const manifest = fs.existsSync(path.join(videoDir, 'manifest.json'));
  const embeddings = fs.existsSync(path.join(videoDir, 'embeddings.faiss')) && fs.existsSync(path.join(videoDir, 'segments.json'));
  const lesson = fs.existsSync(path.join(videoDir, 'lesson.json'));
  const shortsBrief = fs.existsSync(path.join(videoDir, 'shorts_brief.json'));
  const frames = hasFrameArtifacts(videoDir, manifest);
  const ready = videoFile && transcript && frames && manifest && embeddings && lesson;

  return {
    videoDir,
    videoFile,
    transcript,
    frames,
    manifest,
    embeddings,
    lesson,
    shortsBrief,
    ready,
  };
}
