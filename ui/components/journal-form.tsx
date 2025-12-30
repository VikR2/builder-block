"use client";

import { useState, useRef } from "react";
import { createJournalEntry } from "@/app/actions";

interface JournalFormProps {
  projectId: number;
  scriptId?: number;
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function JournalForm({
  projectId,
  scriptId,
  onSuccess,
  onClose,
}: JournalFormProps) {
  const [title, setTitle] = useState("");
  const [entryType, setEntryType] = useState("note");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      setAttachments((prev) => [...prev, ...files]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((file) =>
        file.type.startsWith("image/")
      );
      setAttachments((prev) => [...prev, ...files]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !content) {
      setError("Title and content are required");
      return;
    }

    setCreating(true);
    setError("");

    const result = await createJournalEntry({
      projectId,
      scriptId,
      title,
      entryType,
      content,
      attachments,
    });

    if (result.success) {
      // Reset form
      setTitle("");
      setContent("");
      setAttachments([]);
      if (onSuccess) onSuccess();
      if (onClose) onClose();
      // Reload the page to show new entry
      window.location.reload();
    } else {
      setError(result.error || "Failed to create journal entry");
    }

    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl max-w-3xl w-full p-8 shadow-lg my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">New Journal Entry</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Title Input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Initial Setup Notes"
              className="px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Entry Type Select */}
          <div className="flex flex-col gap-2">
            <label htmlFor="entryType" className="text-sm font-medium">
              Entry Type
            </label>
            <select
              id="entryType"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              className="px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="note">Note</option>
              <option value="trade-idea">Trade Idea</option>
              <option value="analysis">Analysis</option>
              <option value="lesson">Lesson</option>
            </select>
          </div>

          {/* Content Textarea */}
          <div className="flex flex-col gap-2">
            <label htmlFor="content" className="text-sm font-medium">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your notes here... Markdown is supported."
              rows={10}
              className="px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              Tip: You can use Markdown formatting
            </p>
          </div>

          {/* Screenshot Upload Area */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Screenshots (Optional)</label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card/50 hover:border-primary/40 hover:bg-primary/5"
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <div className="text-4xl">📸</div>
                <p className="text-sm font-medium">
                  Drop screenshots here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or GIF
                </p>
              </div>
            </div>

            {/* Attachment Previews */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="relative rounded-lg border border-border overflow-hidden"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-32 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="absolute top-2 right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs hover:bg-destructive/90 transition-colors"
                    >
                      ✕
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm px-2 py-1">
                      <p className="text-xs truncate">{file.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-3 bg-destructive/15 border border-destructive/30 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Entry"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={creating}
                className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
