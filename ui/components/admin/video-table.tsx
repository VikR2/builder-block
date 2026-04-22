'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Film,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  MoreVertical,
  Play,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface ProcessedVideo {
  id: number;
  filename: string;
  folder_id?: string | null;
  title: string | null;
  processing_status: string;
  skills_extracted: number;
  duration_sec: number | null;
  file_size_bytes: number | null;
  created_at: string;
  processed_at: string | null;
  category_id?: number | null;
  is_published?: number | null;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  color: string;
  video_count?: number;
}

interface VideoTableProps {
  videos: ProcessedVideo[];
  categories?: Category[];
  onReprocess?: (id: number) => void;
  onDelete?: (id: number) => void;
  onCategoryChange?: (videoId: number, categoryId: number | null) => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  uploaded: <Clock className="h-4 w-4 text-muted-foreground" />,
  extracting: <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />,
  embedding: <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />,
  lesson_building: <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />,
  ready: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  processing: <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  failed: <AlertCircle className="h-4 w-4 text-rose-500" />
};

const statusLabels: Record<string, string> = {
  uploaded: 'Uploaded',
  extracting: 'Extracting',
  embedding: 'Embedding',
  lesson_building: 'Lesson Building',
  ready: 'Ready',
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed'
};

const ACTIVE_STATUSES = new Set(['uploaded', 'extracting', 'embedding', 'lesson_building', 'pending', 'processing']);

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface CategoryDropdownProps {
  videoId: number;
  currentCategoryId: number | null | undefined;
  categories: Category[];
  onCategoryChange: (videoId: number, categoryId: number | null) => void;
}

function CategoryDropdown({ videoId, currentCategoryId, categories, onCategoryChange }: CategoryDropdownProps) {
  const selectedCategory = categories.find(c => c.id === currentCategoryId);

  return (
    <select
      value={currentCategoryId ?? ''}
      onChange={(e) => {
        const newValue = e.target.value === '' ? null : parseInt(e.target.value);
        onCategoryChange(videoId, newValue);
      }}
      className="px-2 py-1 text-sm rounded-md border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer min-w-[120px]"
      style={{
        backgroundColor: selectedCategory ? `${selectedCategory.color}15` : undefined,
        borderColor: selectedCategory ? `${selectedCategory.color}40` : undefined,
      }}
    >
      <option value="" className="text-muted-foreground">Uncategorized</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

export function VideoTable({ videos, categories, onReprocess, onDelete, onCategoryChange }: VideoTableProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Film className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No videos yet</p>
        <Link href="/tcm/admin/upload" className="text-amber-500 hover:underline text-sm mt-1 inline-block">
          Upload your first video
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Video</th>
            {categories && categories.length > 0 && (
              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
            )}
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Duration</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Size</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Skills</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Added</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b border-border/30 hover:bg-accent/5 transition-colors">
              <td className="py-3 px-4">
                <Link
                  href={`/tcm/admin/videos/${video.id}`}
                  className="flex items-center gap-3 hover:text-amber-500 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <Film className="h-5 w-5 text-rose-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[300px]">
                      {video.title || video.filename}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                      {video.filename}
                    </div>
                  </div>
                </Link>
              </td>
              {categories && categories.length > 0 && (
                <td className="py-3 px-4">
                  {onCategoryChange ? (
                    <CategoryDropdown
                      videoId={video.id}
                      currentCategoryId={video.category_id}
                      categories={categories}
                      onCategoryChange={onCategoryChange}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {categories.find(c => c.id === video.category_id)?.name || 'Uncategorized'}
                    </span>
                  )}
                </td>
              )}
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {statusIcons[video.processing_status] || statusIcons.pending}
                  <span className="text-sm">{statusLabels[video.processing_status] || 'Unknown'}</span>
                  {video.processing_status === 'ready' && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      video.is_published
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {video.is_published ? 'Published' : 'Hidden'}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {formatDuration(video.duration_sec)}
              </td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {formatFileSize(video.file_size_bytes)}
              </td>
              <td className="py-3 px-4">
                {video.skills_extracted > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-sm rounded-full">
                    {video.skills_extracted}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </td>
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {formatDate(video.created_at)}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === video.id ? null : video.id)}
                    className="p-1 hover:bg-accent rounded"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {openMenu === video.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenu(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-popover border border-border rounded-lg shadow-lg z-20">
                        <Link
                          href={`/tcm/admin/videos/${video.id}`}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          onClick={() => setOpenMenu(null)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          View Details
                        </Link>
                        {onReprocess && !ACTIVE_STATUSES.has(video.processing_status) && (
                          <button
                            onClick={() => {
                              onReprocess(video.id);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          >
                            <Play className="h-4 w-4" />
                            Retry / Reindex
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => {
                              onDelete(video.id);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-rose-500 hover:bg-accent transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
