'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Search, Folder, Tag, Settings } from 'lucide-react';
import { VideoTable } from '@/components/admin/video-table';

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
  error_message?: string | null;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  color: string;
  video_count?: number;
}

interface VideoTag {
  id: number;
  name: string;
  slug: string;
  color: string;
  video_count?: number;
}

const STATUS_FILTERS = ['all', 'uploaded', 'extracting', 'embedding', 'lesson_building', 'ready', 'failed'] as const;

export default function VideosPage() {
  const [videos, setVideos] = useState<ProcessedVideo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [videoTags, setVideoTags] = useState<Record<number, number[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [tagFilters, setTagFilters] = useState<number[]>([]);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/tcm/admin/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOrganizationData = useCallback(async () => {
    try {
      const [categoriesRes, tagsRes] = await Promise.all([
        fetch('/api/tcm/admin/categories'),
        fetch('/api/tcm/admin/tags'),
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }

      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setTags(data.tags || []);
      }
    } catch (error) {
      console.error('Error fetching organization data:', error);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchOrganizationData();
  }, [fetchVideos, fetchOrganizationData]);

  const handleReprocess = async (videoId: number) => {
    if (!confirm('Start processing this video again?')) return;

    try {
      const res = await fetch(`/api/tcm/admin/videos/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error('Error reprocessing video:', error);
    }
  };

  const handleDelete = async (videoId: number) => {
    if (!confirm('Delete this video and all associated data?')) return;

    try {
      const res = await fetch(`/api/tcm/admin/videos/${videoId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error('Error deleting video:', error);
    }
  };

  const handleCategoryChange = async (videoId: number, categoryId: number | null) => {
    // Optimistic update
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId ? { ...video, category_id: categoryId } : video
      )
    );

    try {
      const res = await fetch(`/api/tcm/admin/videos/${videoId}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      });

      if (!res.ok) {
        // Revert on failure
        fetchVideos();
        console.error('Failed to update category');
      } else {
        // Refresh organization data to update category counts
        fetchOrganizationData();
      }
    } catch (error) {
      console.error('Error updating category:', error);
      fetchVideos();
    }
  };

  const toggleTagFilter = (tagId: number) => {
    setTagFilters((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // Filter videos
  const filteredVideos = videos.filter((video) => {
    const matchesSearch =
      !searchQuery ||
      video.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.title?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || video.processing_status === statusFilter;

    const matchesCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 0 ? !video.category_id : video.category_id === categoryFilter);

    // Tag filtering would require fetching video tags - for now just pass through
    // In a full implementation, we'd fetch video tags on page load
    const matchesTags = tagFilters.length === 0 || true; // TODO: Implement tag filtering

    return matchesSearch && matchesStatus && matchesCategory && matchesTags;
  });

  // Count by status
  const statusCounts = {
    all: videos.length,
    uploaded: videos.filter(v => v.processing_status === 'uploaded').length,
    extracting: videos.filter(v => v.processing_status === 'extracting').length,
    embedding: videos.filter(v => v.processing_status === 'embedding').length,
    lesson_building: videos.filter(v => v.processing_status === 'lesson_building').length,
    ready: videos.filter(v => v.processing_status === 'ready').length,
    failed: videos.filter(v => v.processing_status === 'failed').length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Videos</h1>
          <p className="text-muted-foreground">
            {videos.length} tracked video{videos.length !== 1 ? 's' : ''} across upload and lesson-ready stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tcm/admin/organize"
            className="flex items-center gap-2 px-4 py-2 border border-border/50 text-muted-foreground hover:text-foreground font-medium rounded-lg hover:bg-card transition-colors"
          >
            <Settings className="h-4 w-4" />
            Organize
          </Link>
          <Link
            href="/tcm/admin/upload"
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Upload
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <select
                value={categoryFilter === 'all' ? 'all' : categoryFilter.toString()}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="px-3 py-2 bg-card border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="all">All Categories</option>
                <option value="0">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.video_count || 0})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex gap-1 p-1 bg-card border border-border/50 rounded-lg">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  statusFilter === status
                    ? 'bg-amber-500 text-black font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {status === 'lesson_building'
                  ? 'Lesson'
                  : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                {statusCounts[status] > 0 && (
                  <span className="ml-1 text-xs opacity-70">({statusCounts[status]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Filter Chips */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors ${
                  tagFilters.includes(tag.id)
                    ? 'ring-2 ring-amber-500'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: `${tag.color}20`,
                  borderColor: `${tag.color}40`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            {tagFilters.length > 0 && (
              <button
                onClick={() => setTagFilters([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <VideoTable
          videos={filteredVideos}
          categories={categories}
          onReprocess={handleReprocess}
          onDelete={handleDelete}
          onCategoryChange={handleCategoryChange}
        />
      </div>
    </div>
  );
}
