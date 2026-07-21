import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const LOCAL_VIDEOS_DIR = path.join(process.cwd(), '..', 'data', 'local-videos');

export interface VideoArtifactStatus {
  videoDir: string | null;
  videoFile: boolean;
  transcript: boolean;
  frames: boolean;
  manifest: boolean;
  embeddingsCoarse: boolean;
  embeddingsFine: boolean;
  embeddingMetadataValid: boolean;
  embeddings: boolean;
  lesson: boolean;
  lessonReady: boolean;
  shortsBrief: boolean;
  ready: boolean;
}

interface VideoLocator {
  file_path: string;
  folder_id?: string | null;
}

interface EmbeddingDescriptor {
  signature: string;
  sourceFingerprint: string;
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

function getTranscriptFingerprint(videoDir: string): string | null {
  const transcriptPath = path.join(videoDir, 'transcript_timed.json');
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  return createHash('sha256').update(fs.readFileSync(transcriptPath)).digest('hex');
}

function readEmbeddingDescriptor(
  metadataPath: string,
  expectedProfile: 'coarse' | 'fine',
  transcriptFingerprint: string | null
): EmbeddingDescriptor | null {
  if (!transcriptFingerprint || !fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Record<string, unknown>;
    const model = typeof metadata.model === 'string' ? metadata.model : '';
    const provider = typeof metadata.provider === 'string' ? metadata.provider : '';
    const modality = typeof metadata.modality === 'string' ? metadata.modality : '';
    const indexVersion = typeof metadata.index_version === 'string' ? metadata.index_version : '';
    const dimension = typeof metadata.dimension === 'number' ? metadata.dimension : null;
    const profile = typeof metadata.profile === 'string' ? metadata.profile : '';
    const sourceFingerprint = typeof metadata.source_fingerprint === 'string'
      ? metadata.source_fingerprint
      : '';

    if (
      !model
      || !provider
      || !modality
      || !indexVersion
      || !dimension
      || profile !== expectedProfile
      || sourceFingerprint !== transcriptFingerprint
    ) {
      return null;
    }

    const expectedProvider = process.env.TCM_EMBEDDING_PROVIDER;
    const expectedModel = process.env.TCM_EMBEDDING_MODEL;
    if (
      (expectedProvider && provider !== expectedProvider)
      || (expectedModel && model !== expectedModel)
    ) {
      return null;
    }

    return {
      signature: `${provider}:${model}:${modality}:${indexVersion}:${dimension}`,
      sourceFingerprint,
    };
  } catch {
    return null;
  }
}

function isLessonReady(videoDir: string): boolean {
  const lessonPath = path.join(videoDir, 'lesson.json');
  if (!fs.existsSync(lessonPath)) {
    return false;
  }

  try {
    const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf-8')) as {
      status?: string;
      quality?: { score?: number };
    };
    return lesson.status === 'ready'
      && typeof lesson.quality?.score === 'number'
      && lesson.quality.score >= 0.7;
  } catch {
    return false;
  }
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
      embeddingsCoarse: false,
      embeddingsFine: false,
      embeddingMetadataValid: false,
      embeddings: false,
      lesson: false,
      lessonReady: false,
      shortsBrief: false,
      ready: false,
    };
  }

  const videoFile = fs.existsSync(video.file_path);
  const transcript = fs.existsSync(path.join(videoDir, 'transcript_timed.json'));
  const manifest = fs.existsSync(path.join(videoDir, 'manifest.json'));
  const transcriptFingerprint = getTranscriptFingerprint(videoDir);
  const embeddingsCoarse = fs.existsSync(path.join(videoDir, 'embeddings.faiss'))
    && fs.existsSync(path.join(videoDir, 'segments.json'));
  const embeddingsFine = fs.existsSync(path.join(videoDir, 'embeddings.fine.faiss'))
    && fs.existsSync(path.join(videoDir, 'segments.fine.json'));
  const coarseDescriptor = embeddingsCoarse
    ? readEmbeddingDescriptor(path.join(videoDir, 'segments.json'), 'coarse', transcriptFingerprint)
    : null;
  const fineDescriptor = embeddingsFine
    ? readEmbeddingDescriptor(path.join(videoDir, 'segments.fine.json'), 'fine', transcriptFingerprint)
    : null;
  const embeddingMetadataValid = Boolean(
    coarseDescriptor
    && fineDescriptor
    && coarseDescriptor.signature === fineDescriptor.signature
    && coarseDescriptor.sourceFingerprint === fineDescriptor.sourceFingerprint
  );
  const embeddings = embeddingsCoarse && embeddingsFine && embeddingMetadataValid;
  const lesson = fs.existsSync(path.join(videoDir, 'lesson.json'));
  const lessonReady = lesson && isLessonReady(videoDir);
  const shortsBrief = fs.existsSync(path.join(videoDir, 'shorts_brief.json'));
  const frames = hasFrameArtifacts(videoDir, manifest);
  const ready = videoFile && transcript && frames && manifest && embeddings && lessonReady;

  return {
    videoDir,
    videoFile,
    transcript,
    frames,
    manifest,
    embeddingsCoarse,
    embeddingsFine,
    embeddingMetadataValid,
    embeddings,
    lesson,
    lessonReady,
    shortsBrief,
    ready,
  };
}
