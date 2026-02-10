'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, Pencil, Trash2, Plus, X } from 'lucide-react';

interface VideoTag {
  id: number;
  name: string;
  slug: string;
  color: string;
  video_count?: number;
}

interface TagManagerProps {
  onClose: () => void;
  onUpdate?: () => void;
}

const PRESET_COLORS = [
  '#6b7280', // gray
  '#f59e0b', // amber
  '#ef4444', // red
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
];

export function TagManager({ onClose, onUpdate }: TagManagerProps) {
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/tcm/admin/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      setTags(data.tags || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setAddError('Name is required');
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const response = await fetch('/api/tcm/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add tag');
      }

      setNewName('');
      setNewColor('#6b7280');
      setShowAddForm(false);
      fetchTags();
      onUpdate?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add tag');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this tag? It will be removed from all videos.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tcm/admin/tags/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete tag');
      }

      setTags(tags.filter((t) => t.id !== id));
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  };

  const startEdit = (tag: VideoTag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleEditSave = async (tag: VideoTag) => {
    if (!editName.trim()) return;

    try {
      const response = await fetch(`/api/tcm/admin/tags/${tag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update tag');
      }

      setTags(tags.map((t) => (t.id === tag.id ? { ...t, name: editName.trim(), color: editColor } : t)));
      setEditingId(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-foreground">Manage Tags</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card/50 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
              <p className="mt-2">Loading tags...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={fetchTags} className="mt-2 text-sm text-amber-500 hover:text-amber-400">
                Retry
              </button>
            </div>
          ) : tags.length === 0 && !showAddForm ? (
            <div className="p-8 text-center text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No tags yet</p>
              <p className="text-xs mt-1">Create tags to label and filter videos</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) =>
                  editingId === tag.id ? (
                    <div
                      key={tag.id}
                      className="w-full p-3 border border-border/50 rounded-lg space-y-3"
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500/50"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Color:</span>
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditColor(color)}
                            className={`w-5 h-5 rounded-full transition-transform ${
                              editColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-card scale-110' : ''
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleEditSave(tag)}
                          className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-400"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={tag.id}
                      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        borderColor: `${tag.color}30`,
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-foreground">{tag.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {tag.video_count || 0}
                      </span>
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                        <button
                          onClick={() => startEdit(tag)}
                          className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(tag.id)}
                          className="p-0.5 text-red-400/70 hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAdd} className="p-4 border-t border-border/50 space-y-3">
              <div>
                <label htmlFor="tag-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Name
                </label>
                <input
                  id="tag-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., beginner, volume, order-flow"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Color</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-card scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewName('');
                    setNewColor('#6b7280');
                    setAddError(null);
                  }}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !newName.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {adding ? 'Creating...' : 'Create Tag'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Tag
            </button>
          )}
          <div className="ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
