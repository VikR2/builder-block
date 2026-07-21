'use client';

import { useState, useEffect, useCallback } from 'react';
import { ListVideo, GripVertical, Plus, X, Search, Trash2, Clock, Play, Eye, EyeOff } from 'lucide-react';

interface PlaylistItem {
  id: number;
  playlist_id: number;
  video_id: number;
  position: number;
  video_title?: string;
  video_duration?: number;
  video_folder_id?: string;
}

interface Playlist {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
  video_count?: number;
  total_duration?: number;
}

interface Video {
  id: number;
  title: string;
  folder_id: string | null;
  duration_sec: number | null;
}

interface PlaylistEditorProps {
  playlistId: number;
  onClose: () => void;
  onUpdate?: () => void;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlaylistEditor({ playlistId, onClose, onUpdate }: PlaylistEditorProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add video state
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [availableVideos, setAvailableVideos] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const fetchPlaylist = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch playlist');
      }
      const data = await response.json();
      setPlaylist(data.playlist);
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  const fetchAvailableVideos = useCallback(async () => {
    try {
      setLoadingVideos(true);
      const response = await fetch('/api/tcm/admin/videos');
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }
      const data = await response.json();
      setAvailableVideos(data.videos || []);
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaylist();
    fetchAvailableVideos();
  }, [fetchPlaylist, fetchAvailableVideos]);

  const handleTogglePublish = async () => {
    if (!playlist) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !playlist.is_published }),
      });

      if (!response.ok) throw new Error('Failed to update playlist');

      setPlaylist({ ...playlist, is_published: !playlist.is_published });
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!playlist || !editName.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update playlist');
      }

      setPlaylist({ ...playlist, name: editName.trim(), description: editDescription.trim() || null });
      setEditingName(false);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleAddVideo = async (videoId: number) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add video');
      }

      const data = await response.json();
      setItems(data.items || []);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveVideo = async (videoId: number) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}/items?video_id=${videoId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove video');

      const data = await response.json();
      setItems(data.items || []);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove video');
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, removed);

    // Update positions
    const reorderedItems = newItems.map((item, idx) => ({ ...item, position: idx }));
    setItems(reorderedItems);
    setDraggedIndex(null);

    // Save new order
    setSaving(true);
    try {
      const response = await fetch(`/api/tcm/admin/playlists/${playlistId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: reorderedItems.map((item) => item.video_id) }),
      });

      if (!response.ok) throw new Error('Failed to reorder');
      onUpdate?.();
    } catch (err) {
      console.error('Failed to save order:', err);
      fetchPlaylist(); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  const filteredVideos = availableVideos.filter((video) => {
    // Exclude videos already in playlist
    if (items.some((item) => item.video_id === video.id)) return false;
    // Filter by search query
    if (searchQuery && !video.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const startEditName = () => {
    if (playlist) {
      setEditName(playlist.name);
      setEditDescription(playlist.description || '');
      setEditingName(true);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative bg-card border border-border/50 rounded-xl p-8">
          <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card border border-border/50 rounded-xl p-8">
          <p className="text-red-400">Playlist not found</p>
          <button onClick={onClose} className="mt-4 text-sm text-amber-500">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal - Full width on mobile, max-w-3xl on desktop */}
      <div className="relative w-full max-w-3xl bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <ListVideo className="h-5 w-5 text-amber-500 shrink-0" />
            {editingName ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-2 py-1 bg-card/50 border border-border/50 rounded text-foreground focus:outline-none focus:border-amber-500/50"
                  autoFocus
                />
                <button
                  onClick={handleSaveDetails}
                  disabled={saving || !editName.trim()}
                  className="px-2 py-1 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-400 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={startEditName}
                className="flex-1 min-w-0 text-left group"
              >
                <h2 className="font-semibold text-foreground truncate group-hover:text-amber-500 transition-colors">
                  {playlist.name}
                </h2>
                {playlist.description && (
                  <p className="text-xs text-muted-foreground truncate">{playlist.description}</p>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              onClick={handleTogglePublish}
              disabled={saving}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                playlist.is_published
                  ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {playlist.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {playlist.is_published ? 'Published' : 'Draft'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card/50 rounded transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border/30 bg-card/50 shrink-0">
          <span className="flex items-center gap-1">
            <Play className="h-3 w-3" />
            {items.length} videos
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(items.reduce((sum, item) => sum + (item.video_duration || 0), 0))} total
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {error && (
            <div className="px-4 py-2 bg-red-500/10 text-red-400 text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline">
                Dismiss
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ListVideo className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No videos in this playlist</p>
              <p className="text-sm mt-1">Add videos to build your course sequence</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-card/50 transition-colors ${
                    draggedIndex === index ? 'opacity-50 bg-amber-500/10' : ''
                  }`}
                >
                  <div className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <span className="w-6 h-6 flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted rounded">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{item.video_title || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(item.video_duration)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveVideo(item.video_id)}
                    disabled={saving}
                    className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Videos Section */}
        {showAddVideo ? (
          <div className="border-t border-border/50 shrink-0">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search videos..."
                    className="w-full pl-9 pr-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => {
                    setShowAddVideo(false);
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-border/30 border border-border/50 rounded-lg">
                {loadingVideos ? (
                  <div className="p-4 text-center text-muted-foreground">Loading videos...</div>
                ) : filteredVideos.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {searchQuery ? 'No matching videos' : 'All videos are already in this playlist'}
                  </div>
                ) : (
                  filteredVideos.slice(0, 10).map((video) => (
                    <button
                      key={video.id}
                      onClick={() => handleAddVideo(video.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-card/50 transition-colors text-left disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="flex-1 truncate text-sm text-foreground">{video.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(video.duration_sec)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 shrink-0">
            <button
              onClick={() => setShowAddVideo(true)}
              className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Videos
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
