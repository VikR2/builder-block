'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, GripVertical, Pencil, Trash2, Plus, X, Check } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  icon: string | null;
  color: string;
  video_count?: number;
}

interface CategoryManagerProps {
  onClose: () => void;
  onUpdate?: () => void;
}

const PRESET_COLORS = [
  '#f59e0b', // amber
  '#ef4444', // red
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function CategoryManager({ onClose, onUpdate }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState('#f59e0b');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');

  // Drag state
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/tcm/admin/categories');
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setAddError('Name is required');
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const response = await fetch('/api/tcm/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          color: newColor,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add category');
      }

      setNewName('');
      setNewDescription('');
      setNewColor('#f59e0b');
      setShowAddForm(false);
      fetchCategories();
      onUpdate?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? Videos will be uncategorized.')) {
      return;
    }

    try {
      const response = await fetch(`/api/tcm/admin/categories/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete category');
      }

      setCategories(categories.filter((c) => c.id !== id));
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description || '');
    setEditColor(category.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditColor('');
  };

  const handleEditSave = async (category: Category) => {
    if (!editName.trim()) return;

    try {
      const response = await fetch(`/api/tcm/admin/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          color: editColor,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update category');
      }

      setCategories(
        categories.map((c) =>
          c.id === category.id
            ? { ...c, name: editName.trim(), description: editDescription.trim() || null, color: editColor }
            : c
        )
      );
      setEditingId(null);
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = categories.findIndex((c) => c.id === draggedId);
    const targetIndex = categories.findIndex((c) => c.id === targetId);

    const newCategories = [...categories];
    const [removed] = newCategories.splice(draggedIndex, 1);
    newCategories.splice(targetIndex, 0, removed);

    setCategories(newCategories);
    setDraggedId(null);

    // Save new order
    try {
      await fetch(`/api/tcm/admin/categories/${categories[0].id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: newCategories.map((c) => c.id) }),
      });
      onUpdate?.();
    } catch (err) {
      console.error('Failed to save order:', err);
      fetchCategories(); // Revert on error
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
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
            <Folder className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-foreground">Manage Categories</h2>
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
              <p className="mt-2">Loading categories...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={fetchCategories} className="mt-2 text-sm text-amber-500 hover:text-amber-400">
                Retry
              </button>
            </div>
          ) : categories.length === 0 && !showAddForm ? (
            <div className="p-8 text-center text-muted-foreground">
              <Folder className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No categories yet</p>
              <p className="text-xs mt-1">Create categories to organize your videos</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {categories.map((category) => (
                <div
                  key={category.id}
                  draggable={editingId !== category.id}
                  onDragStart={(e) => handleDragStart(e, category.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, category.id)}
                  onDragEnd={handleDragEnd}
                  className={`p-4 hover:bg-card/50 transition-colors ${
                    draggedId === category.id ? 'opacity-50' : ''
                  }`}
                >
                  {editingId === category.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500/50"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Color:</span>
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditColor(color)}
                            className={`w-6 h-6 rounded-full transition-transform ${
                              editColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-card scale-110' : ''
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
                          onClick={() => handleEditSave(category)}
                          className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-400"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                      >
                        <Folder className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{category.name}</p>
                        {category.description && (
                          <p className="text-xs text-muted-foreground truncate">{category.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {category.video_count || 0} videos
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(category)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAdd} className="p-4 border-t border-border/50 space-y-3">
              <div>
                <label htmlFor="category-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Name
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Bootcamp, Webinars"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="category-description" className="block text-xs font-medium text-muted-foreground mb-1">
                  Description
                </label>
                <input
                  id="category-description"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
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
                    setNewDescription('');
                    setNewColor('#f59e0b');
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
                  {adding ? 'Creating...' : 'Create Category'}
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
              Add Category
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
