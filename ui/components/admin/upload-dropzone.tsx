'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';
import { Upload, File, X, Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface UploadProgress {
  filename: string;
  progress: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  error?: string;
  videoId?: number;
  jobId?: number;
  reusedExisting?: boolean;
}

interface UploadDropzoneProps {
  onUploadComplete?: (videoId: number) => void;
  maxFiles?: number;
}

export function UploadDropzone({ onUploadComplete, maxFiles = 5 }: UploadDropzoneProps) {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file: File) => {
    const uploadKey = `${file.name}-${Date.now()}`;

    setUploads(prev => new Map(prev).set(uploadKey, {
      filename: file.name,
      progress: 0,
      status: 'uploading'
    }));

    try {
      // Initialize upload
      const initRes = await fetch('/api/tcm/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size
        })
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.error || 'Failed to initialize upload');
      }

      const { uploadId, totalChunks, chunkSize } = await initRes.json();

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const chunkRes = await fetch(
          `/api/tcm/admin/upload/${uploadId}/chunk?index=${i}`,
          {
            method: 'POST',
            body: chunk
          }
        );

        if (!chunkRes.ok) {
          throw new Error('Failed to upload chunk');
        }

        const progress = Math.round(((i + 1) / totalChunks) * 90); // 90% for upload
        setUploads(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(uploadKey);
          if (current) {
            newMap.set(uploadKey, { ...current, progress });
          }
          return newMap;
        });
      }

      // Finalize upload
      setUploads(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(uploadKey);
        if (current) {
          newMap.set(uploadKey, { ...current, progress: 95, status: 'processing' });
        }
        return newMap;
      });

      const finalRes = await fetch(`/api/tcm/admin/upload/${uploadId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoProcess: true
        })
      });

      if (!finalRes.ok) {
        const err = await finalRes.json();
        throw new Error(err.error || 'Failed to finalize upload');
      }

      const { videoId, jobId, isDuplicate, reusedExisting, message } = await finalRes.json();

      setUploads(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(uploadKey);
        if (current) {
          if (isDuplicate) {
            newMap.set(uploadKey, {
              ...current,
              progress: 100,
              status: 'ready',
              videoId,
              reusedExisting: true,
              error: message || 'Video already exists in library'
            });
          } else {
            newMap.set(uploadKey, {
              ...current,
              progress: 100,
              status: jobId ? 'processing' : 'ready',
              videoId,
              jobId,
              reusedExisting: Boolean(reusedExisting),
              error: reusedExisting ? message || 'Reused the existing lesson pipeline' : undefined
            });
          }
        }
        return newMap;
      });

      if (onUploadComplete && videoId) {
        onUploadComplete(videoId);
      }
    } catch (error) {
      setUploads(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(uploadKey);
        if (current) {
          newMap.set(uploadKey, {
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          });
        }
        return newMap;
      });
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (isUploading) return;

    setIsUploading(true);

    // Process files sequentially
    for (const file of acceptedFiles.slice(0, maxFiles)) {
      await uploadFile(file);
    }

    setIsUploading(false);
  }, [isUploading, maxFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/x-matroska': ['.mkv'],
      'video/webm': ['.webm']
    },
    maxFiles,
    disabled: isUploading
  });

  const removeUpload = (key: string) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
  };

  const activeUploads = Array.from(uploads.entries()).filter(
    ([_, u]) => u.status === 'uploading'
  );
  const completedUploads = Array.from(uploads.entries()).filter(
    ([_, u]) => u.status === 'processing' || u.status === 'ready' || u.status === 'error'
  );

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          isDragActive
            ? 'border-amber-500 bg-amber-500/10'
            : isUploading
            ? 'border-muted-foreground/30 bg-muted/20 cursor-not-allowed'
            : 'border-border hover:border-amber-500/50 hover:bg-accent/5'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
            isDragActive ? 'bg-amber-500/20' : 'bg-muted'
          }`}>
            <Upload className={`h-8 w-8 ${isDragActive ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </div>
          {isDragActive ? (
            <div>
              <p className="text-lg font-medium text-amber-500">Drop your videos here</p>
            </div>
          ) : isUploading ? (
            <div>
              <p className="text-lg font-medium">Uploading...</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait</p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium">Drag & drop video files here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse • MP4, MOV, MKV, WebM up to 10GB
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Active Uploads */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Uploading</h4>
          {activeUploads.map(([key, upload]) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
              <div className="h-10 w-10 rounded-lg bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                <File className="h-5 w-5 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{upload.filename}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {upload.progress}%
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {upload.status === 'uploading' ? 'Uploading...' : 'Processing...'}
                </div>
              </div>
              <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />
            </div>
          ))}
        </div>
      )}

      {/* Completed Uploads */}
      {completedUploads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Recent</h4>
          {completedUploads.map(([key, upload]) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                upload.status === 'error'
                  ? 'bg-rose-500/20'
                  : upload.status === 'ready'
                    ? 'bg-emerald-500/20'
                    : 'bg-sky-500/20'
              }`}>
                {upload.status === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-rose-500" />
                ) : upload.status === 'ready' ? (
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{upload.filename}</div>
                <div className={`text-xs mt-0.5 ${
                  upload.status === 'error'
                    ? 'text-rose-500'
                    : upload.status === 'ready'
                      ? 'text-emerald-500'
                      : 'text-sky-500'
                }`}>
                  {upload.status === 'error'
                    ? upload.error
                    : upload.status === 'ready'
                      ? upload.reusedExisting
                        ? upload.error || 'Reused the existing lesson-ready video'
                        : 'Lesson-ready upload complete'
                      : upload.reusedExisting
                        ? upload.error || 'Reused the existing video and resumed lesson processing.'
                        : 'Lesson pipeline started. This video stays hidden until ready.'}
                </div>
              </div>
              {upload.jobId && upload.status === 'processing' && (
                <Link
                  href="/tcm/admin/queue"
                  className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-400"
                >
                  Queue
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
              <button
                onClick={() => removeUpload(key)}
                className="p-1 hover:bg-accent rounded"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
