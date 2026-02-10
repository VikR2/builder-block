'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { VideoGrid } from './video-grid';
import { Folder, Tag, ListVideo, Play, ChevronDown, Loader2 } from 'lucide-react';

interface VideoDetails {
  id: string;
  title: string;
  duration: number;
  frameCount: number;
  thumbnailUrl: string;
  frameInterval: number;
  categoryId?: number | null;
  tags?: number[];
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

interface Playlist {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  video_count?: number;
  total_duration?: number;
}

interface PlaylistVideo {
  id: string;
  title: string;
  position: number;
  duration?: number;
}

interface LibraryContentProps {
  initialVideos: VideoDetails[];
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function LibraryContent({ initialVideos }: LibraryContentProps) {
  const [videos] = useState<VideoDetails[]>(initialVideos);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPlaylist, setExpandedPlaylist] = useState<number | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<Record<number, PlaylistVideo[]>>({});
  const [loadingPlaylist, setLoadingPlaylist] = useState<number | null>(null);
  const [isVideosExpanded, setIsVideosExpanded] = useState(false);

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const [categoriesRes, tagsRes, playlistsRes] = await Promise.all([
          fetch('/api/tcm/library/categories'),
          fetch('/api/tcm/library/tags'),
          fetch('/api/tcm/library/playlists'),
        ]);

        if (categoriesRes.ok) {
          const data = await categoriesRes.json();
          setCategories(data.categories || []);
        }

        if (tagsRes.ok) {
          const data = await tagsRes.json();
          setTags(data.tags || []);
        }

        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.playlists || []);
        }
      } catch (error) {
        console.error('Error fetching organization data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganization();
  }, []);

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const togglePlaylistExpand = async (playlist: Playlist) => {
    // If clicking the same playlist, collapse it
    if (expandedPlaylist === playlist.id) {
      setExpandedPlaylist(null);
      return;
    }

    // If we already have the videos cached, just expand
    if (playlistVideos[playlist.id]) {
      setExpandedPlaylist(playlist.id);
      return;
    }

    // Fetch the playlist videos
    setLoadingPlaylist(playlist.id);
    setExpandedPlaylist(playlist.id);

    try {
      const res = await fetch(`/api/tcm/library/playlists/${playlist.slug}`);
      if (res.ok) {
        const data = await res.json();
        setPlaylistVideos((prev) => ({
          ...prev,
          [playlist.id]: data.videos || [],
        }));
      }
    } catch (error) {
      console.error('Error fetching playlist videos:', error);
    } finally {
      setLoadingPlaylist(null);
    }
  };

  // Filter videos based on selected category and tags
  // Note: For now, we show all videos since video->category/tag assignment
  // would require fetching video organization data. This can be enhanced later.
  const filteredVideos = videos;

  return (
    <div className="flex flex-col gap-8">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-xl bg-card border border-border/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <ListVideo className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{playlists.length}</h3>
              <p className="text-sm text-muted-foreground">{playlists.length === 1 ? 'Course' : 'Courses'} Available</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
              <Play className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{filteredVideos.length}</h3>
              <p className="text-sm text-muted-foreground">{filteredVideos.length === 1 ? 'Video' : 'Videos'} Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Playlists / Courses Section */}
      {!isLoading && playlists.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ListVideo className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold">Courses</h2>
            <span className="text-sm text-muted-foreground">({playlists.length})</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((playlist) => {
              const isExpanded = expandedPlaylist === playlist.id;
              const isLoadingThis = loadingPlaylist === playlist.id;
              const videos = playlistVideos[playlist.id] || [];
              const previewVideos = videos.slice(0, 5);
              const remainingCount = Math.max(0, (playlist.video_count || 0) - 5);

              return (
                <div
                  key={playlist.id}
                  className={`rounded-xl border bg-card overflow-hidden transition-all ${
                    isExpanded ? 'border-amber-500/50' : 'border-border/50 hover:border-amber-500/30'
                  }`}
                >
                  {/* Header - clickable to expand/collapse */}
                  <button
                    onClick={() => togglePlaylistExpand(playlist)}
                    className="w-full p-5 text-left group hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex items-center justify-center shrink-0 group-hover:from-amber-500/30 group-hover:to-rose-500/30 transition-colors">
                        <ListVideo className="w-6 h-6 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground group-hover:text-amber-500 transition-colors truncate">
                          {playlist.name}
                        </h3>
                        {playlist.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {playlist.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{playlist.video_count || 0} videos</span>
                          {playlist.total_duration && (
                            <>
                              <span>•</span>
                              <span>{formatDuration(playlist.total_duration)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 self-center">
                        {isLoadingThis ? (
                          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                        ) : (
                          <ChevronDown
                            className={`w-5 h-5 text-muted-foreground transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && !isLoadingThis && (
                    <div className="border-t border-border/50">
                      {previewVideos.length > 0 ? (
                        <>
                          <div className="divide-y divide-border/30">
                            {previewVideos.map((video) => (
                              <Link
                                key={video.id}
                                href={`/tcm/library/${video.id}`}
                                className="flex items-center gap-3 px-5 py-3 hover:bg-accent/5 transition-colors group/video"
                              >
                                <span className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center text-xs font-medium text-amber-500 shrink-0">
                                  {video.position}
                                </span>
                                <span className="flex-1 text-sm truncate group-hover/video:text-amber-500 transition-colors">
                                  {video.title}
                                </span>
                                {video.duration && (
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {formatDuration(video.duration)}
                                  </span>
                                )}
                                <Play className="w-4 h-4 text-muted-foreground group-hover/video:text-amber-500 shrink-0 opacity-0 group-hover/video:opacity-100 transition-opacity" />
                              </Link>
                            ))}
                          </div>
                          <div className="flex items-center justify-between px-5 py-3 bg-accent/5 border-t border-border/30">
                            {remainingCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                +{remainingCount} more video{remainingCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {remainingCount === 0 && <span />}
                            <Link
                              href={`/tcm/library/playlists/${playlist.slug}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-black text-sm font-medium rounded-lg hover:bg-amber-400 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Start Course
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                          No videos in this playlist yet
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All Videos - Collapsible Section */}
      <section className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        {/* Clickable Header */}
        <button
          onClick={() => setIsVideosExpanded(!isVideosExpanded)}
          className="w-full p-5 flex items-center justify-between hover:bg-accent/5 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold">All Videos</h2>
              <p className="text-sm text-muted-foreground">
                {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''} • Click to browse
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {isVideosExpanded ? 'Hide' : 'Show'} Videos
            </span>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
              isVideosExpanded ? 'rotate-180' : ''
            }`} />
          </div>
        </button>

        {/* Expanded Content */}
        {isVideosExpanded && (
          <div className="border-t border-border/50 p-5 space-y-6">
            {/* Filters (category/tags) - inside expanded area */}
            {!isLoading && (categories.length > 0 || tags.length > 0) && (
              <div className="space-y-3">
                {/* Category Tabs */}
                {categories.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        selectedCategory === 'all'
                          ? 'bg-amber-500 text-black font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card'
                      }`}
                    >
                      All
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          selectedCategory === category.id
                            ? 'font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        style={{
                          backgroundColor: selectedCategory === category.id ? `${category.color}30` : undefined,
                          color: selectedCategory === category.id ? category.color : undefined,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                        {category.video_count !== undefined && (
                          <span className="text-xs opacity-70">({category.video_count})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Tag Filter Chips */}
                {tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                          selectedTags.includes(tag.id)
                            ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: `${tag.color}20`,
                          borderColor: `${tag.color}40`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    ))}
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="text-xs text-muted-foreground hover:text-foreground ml-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Video Grid */}
            <VideoGrid videos={filteredVideos} />
          </div>
        )}
      </section>
    </div>
  );
}
