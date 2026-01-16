"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export function StudyGuideGenerator() {
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/tcm/guides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          title: title.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError(`A guide for this topic already exists.`);
        } else {
          setError(data.error || "Failed to generate study guide");
        }
        return;
      }

      // Navigate to the new guide
      router.push(`/tcm/guides/${data.slug}`);
      router.refresh();
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsGenerating(false);
    }
  };

  const quickTopics = [
    "Submission Range",
    "Book Building",
    "Order Matching",
    "Liquidity",
    "Bias Formula",
    "EQ Level",
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-secondary/50">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Generate Study Guide
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Topic Input */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Topic *
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Submission Range"
            className="w-full px-3 py-2 rounded-lg border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            disabled={isGenerating}
          />
        </div>

        {/* Quick Topics */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">Quick topics:</div>
          <div className="flex flex-wrap gap-1.5">
            {quickTopics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                disabled={isGenerating}
                className="px-2 py-1 text-xs rounded-full bg-secondary hover:bg-secondary/80 border border-border/50 transition-colors disabled:opacity-50"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Title (optional) */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Custom Title <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-generated from topic"
            className="w-full px-3 py-2 rounded-lg border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            disabled={isGenerating}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!topic.trim() || isGenerating}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Generate Guide
            </>
          )}
        </button>
      </form>

      {/* Info */}
      <div className="px-4 pb-4">
        <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <p>
            Guides are generated from TCM skills and study materials. They include:
          </p>
          <ul className="mt-1 ml-3 list-disc">
            <li>Related concepts and definitions</li>
            <li>Code patterns when available</li>
            <li>Excerpts from study documents</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
