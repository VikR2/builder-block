'use client';

import { useState } from 'react';

interface CodeViewerProps {
  code: string;
  html: string;
}

export function CodeViewer({ code, html }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden border">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div
        className="overflow-x-auto text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
