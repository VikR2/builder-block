'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Folder, Tag, ListVideo, Plus, RefreshCw, Settings, ArrowLeft } from 'lucide-react';
import { CategoryManager } from '@/components/admin/category-manager';
import { TagManager } from '@/components/admin/tag-manager';
import { PlaylistEditor } from '@/components/admin/playlist-editor';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
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
  is_published: boolean;
  video_count?: number;
  total_duration?: number;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m ${secs}s`;
}

export default function OrganizePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(null);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [categoriesRes, tagsRes, playlistsRes] = await Promise.all([
        fetch('/api/tcm/admin/categories'),
        fetch('/api/tcm/admin/tags'),
        fetch('/api/tcm/admin/playlists?all=true'),
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    setCreatingPlaylist(true);
    try {
      const res = await fetch('/api/tcm/admin/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewPlaylistName('');
        setShowNewPlaylist(false);
        fetchData();
        // Open the editor for the new playlist
        setEditingPlaylistId(data.id);
      }
    } catch (error) {
      console.error('Error creating playlist:', error);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleDeletePlaylist = async (id: number) => {
    if (!confirm('Delete this playlist? Videos will not be deleted.')) return;

    try {
      const res = await fetch(`/api/tcm/admin/playlists/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/tcm/admin"
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold">Organize Videos</h1>
                <p className="text-sm text-muted-foreground">Manage categories, tags, and playlists</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Categories Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Categories</h2>
              <span className="text-sm text-muted-foreground">({categories.length})</span>
            </div>
            <button
              onClick={() => setShowCategoryManager(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="border border-dashed border-border/50 rounded-xl p-8 text-center">
              <Folder className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No categories yet</p>
              <button
                onClick={() => setShowCategoryManager(true)}
                className="mt-3 text-sm text-amber-500 hover:text-amber-400"
              >
                Create your first category
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-xl border border-border/50 bg-card p-4 hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20`, color: category.color }}
                    >
                      <Folder className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{category.name}</p>
                      <p className="text-sm text-muted-foreground">{category.video_count || 0} videos</p>
                    </div>
                  </div>
                  {category.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{category.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tags Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Tags</h2>
              <span className="text-sm text-muted-foreground">({tags.length})</span>
            </div>
            <button
              onClick={() => setShowTagManager(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage
            </button>
          </div>

          {tags.length === 0 ? (
            <div className="border border-dashed border-border/50 rounded-xl p-8 text-center">
              <Tag className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No tags yet</p>
              <button
                onClick={() => setShowTagManager(true)}
                className="mt-3 text-sm text-amber-500 hover:text-amber-400"
              >
                Create your first tag
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: `${tag.color}30`,
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm text-foreground">{tag.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{tag.video_count || 0}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Playlists Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListVideo className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Playlists / Courses</h2>
              <span className="text-sm text-muted-foreground">({playlists.length})</span>
            </div>
            <button
              onClick={() => setShowNewPlaylist(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-400 rounded transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Playlist
            </button>
          </div>

          {showNewPlaylist && (
            <form onSubmit={handleCreatePlaylist} className="mb-4 p-4 border border-border/50 rounded-xl bg-card">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Playlist name..."
                  className="flex-1 px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={creatingPlaylist || !newPlaylistName.trim()}
                  className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingPlaylist ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewPlaylist(false);
                    setNewPlaylistName('');
                  }}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {playlists.length === 0 && !showNewPlaylist ? (
            <div className="border border-dashed border-border/50 rounded-xl p-8 text-center">
              <ListVideo className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No playlists yet</p>
              <button
                onClick={() => setShowNewPlaylist(true)}
                className="mt-3 text-sm text-amber-500 hover:text-amber-400"
              >
                Create your first playlist
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="h-12 w-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <ListVideo className="h-6 w-6 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{playlist.name}</p>
                      {!playlist.is_published && (
                        <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {playlist.video_count || 0} videos
                      {playlist.total_duration ? ` • ${formatDuration(playlist.total_duration)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingPlaylistId(playlist.id)}
                      className="px-3 py-1.5 text-sm text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeletePlaylist(playlist.id)}
                      className="px-3 py-1.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      {showCategoryManager && (
        <CategoryManager onClose={() => setShowCategoryManager(false)} onUpdate={fetchData} />
      )}

      {showTagManager && (
        <TagManager onClose={() => setShowTagManager(false)} onUpdate={fetchData} />
      )}

      {editingPlaylistId && (
        <PlaylistEditor
          playlistId={editingPlaylistId}
          onClose={() => setEditingPlaylistId(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
