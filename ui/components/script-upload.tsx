"use client";

import { useState, useRef } from "react";
import { uploadScript } from "@/app/actions";

interface ScriptUploadProps {
  projectId: number;
  projectSlug: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function ScriptUpload({
  projectId,
  projectSlug,
  onSuccess,
  onClose,
}: ScriptUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith(".cs")) {
        setFile(droppedFile);
        if (!name) {
          setName(droppedFile.name.replace(".cs", ""));
        }
        setError("");
      } else {
        setError("Only .cs files are allowed");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith(".cs")) {
        setFile(selectedFile);
        if (!name) {
          setName(selectedFile.name.replace(".cs", ""));
        }
        setError("");
      } else {
        setError("Only .cs files are allowed");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId.toString());
    formData.append("name", name);
    formData.append("description", description);

    const result = await uploadScript(formData);

    if (result.success) {
      // Reset form
      setFile(null);
      setName("");
      setDescription("");
      if (onSuccess) onSuccess();
      // Redirect to the new script page
      window.location.href = `/projects/${projectSlug}/scripts/${result.scriptId}`;
    } else {
      setError(result.error || "Failed to upload script");
    }

    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-8 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Upload Script</h2>
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
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              dragActive
                ? "border-primary bg-primary/5"
                : file
                ? "border-primary/40 bg-card"
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
              accept=".cs"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="text-5xl">📄</div>
                <p className="text-lg font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="text-5xl">📁</div>
                <p className="text-lg font-medium">
                  Drop your .cs file here or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  C# NinjaTrader scripts only
                </p>
              </div>
            )}
          </div>

          {/* Name Input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              Script Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SevenFortyBiasV6"
              className="px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Description Input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description (Optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this script does..."
              rows={4}
              className="px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
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
              disabled={!file || uploading}
              className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload Script"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
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
