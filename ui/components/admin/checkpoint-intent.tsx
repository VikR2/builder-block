'use client';

import { useState } from 'react';
import { Sparkles, X, Check, Clock } from 'lucide-react';

interface CheckpointIntentProps {
  videoTitle: string;
  onRespond: (response: { extractSkills: boolean | 'later' }) => void;
  onClose?: () => void;
}

export function CheckpointIntent({ videoTitle, onRespond, onClose }: CheckpointIntentProps) {
  const [isResponding, setIsResponding] = useState(false);

  const handleRespond = async (extractSkills: boolean | 'later') => {
    setIsResponding(true);
    await onRespond({ extractSkills });
    setIsResponding(false);
  };

  return (
    <div className="rounded-xl border border-amber-500/50 bg-card overflow-hidden">
      <div className="p-4 bg-amber-500/10 border-b border-amber-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold">Extract Skills?</h3>
              <p className="text-sm text-muted-foreground">{videoTitle}</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Transcription and frame extraction complete. Would you like to analyze this video
          for trading skills and concepts?
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => handleRespond(true)}
            disabled={isResponding}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Yes, Extract
          </button>
          <button
            onClick={() => handleRespond(false)}
            disabled={isResponding}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-border bg-card text-foreground font-medium rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            No, Skip
          </button>
          <button
            onClick={() => handleRespond('later')}
            disabled={isResponding}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border bg-card text-muted-foreground font-medium rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Clock className="h-4 w-4" />
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
