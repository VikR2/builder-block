'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, ArrowRight, Info } from 'lucide-react';
import { UploadDropzone } from '@/components/admin/upload-dropzone';

export default function UploadPage() {
  const router = useRouter();
  const [recentUploads, setRecentUploads] = useState<number[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Upload Videos</h1>
        <p className="text-muted-foreground">
          Add video files for transcription and skill extraction
        </p>
      </div>

      {/* Upload Area */}
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <UploadDropzone onUploadComplete={handleUploadComplete} maxFiles={5} />
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
              <li>Audio is extracted and transcribed using Whisper AI</li>
              <li>Key frames are extracted at regular intervals</li>
              <li>Semantic embeddings are generated for search</li>
              <li>You'll be asked if you want to extract trading skills</li>
              <li>Extracted skills are added to the knowledge base</li>
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
              Processing has started automatically
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
