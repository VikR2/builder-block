'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, ArrowRight, Info, FolderOpen, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { UploadDropzone } from '@/components/admin/upload-dropzone';

export default function UploadPage() {
  const router = useRouter();
  const [recentUploads, setRecentUploads] = useState<number[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [localFilePath, setLocalFilePath] = useState('C:\\Users\\satvi\\Videos\\Trading\\Order-Fufilment-Tips.mp4');
  const [localTitle, setLocalTitle] = useState('');
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [localImportMessage, setLocalImportMessage] = useState<string | null>(null);
  const [localImportError, setLocalImportError] = useState<string | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleUploadComplete = (videoId: number) => {
    setRecentUploads(prev => [...prev, videoId]);
  };

  // Auto-redirect to queue page after first upload completes
  useEffect(() => {
    if (recentUploads.length === 1) {
      // Start countdown
      setCountdown(5);

      // Countdown interval
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      }, 1000);

      // Redirect after 5 seconds
      redirectTimeoutRef.current = setTimeout(() => {
        router.push('/tcm/admin/queue');
      }, 5000);
    }

    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [recentUploads.length, router]);

  const cancelRedirect = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  };

  const handleLocalImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!localFilePath.trim()) {
      setLocalImportError('Enter a local video path to import.');
      return;
    }

    setIsImportingLocal(true);
    setLocalImportError(null);
    setLocalImportMessage(null);

    try {
      const response = await fetch('/api/tcm/admin/videos/import-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: localFilePath.trim(),
          title: localTitle.trim() || undefined,
          sourceType: 'admin_local',
          autoProcess: true
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import local video');
      }

      if (data.videoId) {
        handleUploadComplete(data.videoId);
      }

      setLocalImportMessage(
        data.reusedExisting
          ? data.message || 'Reused the existing lesson assets and resumed publishing.'
          : 'Local video imported into managed storage and queued for lesson-ready processing.'
      );
    } catch (error) {
      setLocalImportError(error instanceof Error ? error.message : 'Failed to import local video');
    } finally {
      setIsImportingLocal(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Upload Videos</h1>
        <p className="text-muted-foreground">
          Add video files for transcript, embeddings, and lesson-guide processing
        </p>
      </div>

      {/* Upload Area */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <UploadDropzone onUploadComplete={handleUploadComplete} maxFiles={5} />
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Import From Local Path</h2>
            <p className="text-sm text-muted-foreground">
              Use this when the admin already has the source file on disk and wants it copied into managed video storage.
            </p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleLocalImport}>
          <div className="space-y-2">
            <label htmlFor="localFilePath" className="text-sm font-medium">
              Windows file path
            </label>
            <input
              id="localFilePath"
              value={localFilePath}
              onChange={(event) => setLocalFilePath(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="C:\\Users\\satvi\\Videos\\Trading\\Order-Fufilment-Tips.mp4"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="localTitle" className="text-sm font-medium">
              Optional lesson title
            </label>
            <input
              id="localTitle"
              value={localTitle}
              onChange={(event) => setLocalTitle(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Order Fulfilment Tips"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isImportingLocal}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImportingLocal ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4" />
                  Import Local Video
                </>
              )}
            </button>
            <p className="text-xs text-muted-foreground">
              The source file is copied into <code>data/local-videos/...</code> and then processed from managed storage.
            </p>
          </div>
        </form>

        {localImportMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{localImportMessage}</span>
          </div>
        )}

        {localImportError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{localImportError}</span>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="h-5 w-5 text-sky-500" />
          </div>
          <div className="text-sm">
            <h3 className="font-medium mb-1">What happens after upload?</h3>
            <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
              <li>The video row is created immediately so progress can be tracked.</li>
              <li>Transcript and chapter frames are extracted from the uploaded file.</li>
              <li>FAISS embeddings are generated for tutor retrieval.</li>
              <li>A per-video lesson guide is built next to the video artifacts.</li>
              <li>The video is only published to members once every artifact is ready.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Recent Uploads Link */}
      {recentUploads.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10">
          <div>
            <div className="font-medium text-emerald-500">
              {recentUploads.length} video{recentUploads.length > 1 ? 's' : ''} uploaded
            </div>
            <div className="text-sm text-muted-foreground">
              Lesson-ready processing has started automatically
              {countdown !== null && (
                <span className="ml-1">
                  • Redirecting to queue in {countdown}s...{' '}
                  <button
                    onClick={cancelRedirect}
                    className="text-amber-500 hover:text-amber-400 underline"
                  >
                    cancel
                  </button>
                </span>
              )}
            </div>
          </div>
          <Link
            href="/tcm/admin/queue"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black font-medium rounded-lg hover:bg-emerald-400 transition-colors"
          >
            View Queue
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Supported Formats */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Supported formats: MP4, MOV, MKV, WebM • Max file size: 10GB</p>
      </div>
    </div>
  );
}
