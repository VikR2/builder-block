'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface User {
  id: number;
  email: string;
  role: string;
  isPremium: boolean;
}

interface DeleteUserDialogProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (userId: number) => void;
}

export function DeleteUserDialog({ user, isOpen, onClose, onDeleted }: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setConfirmText('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!user || confirmText !== 'DELETE') return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to delete user');
        return;
      }

      onDeleted(user.id);
      onClose();
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !user) return null;

  const isAdmin = user.role === 'admin';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md mx-4 bg-card border border-rose-500/20 rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10">
              <Trash2 className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-rose-500">Delete User</h2>
              <p className="text-sm text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-rose-500">Warning: Permanent Deletion</p>
              <p className="text-muted-foreground mt-1">
                This will permanently delete the user and all associated data including:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
                <li>User account and profile</li>
                <li>Active sessions</li>
                <li>Subscription records</li>
                <li>Authentication tokens</li>
              </ul>
            </div>
          </div>

          {/* User info */}
          <div className="p-4 rounded-xl border bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">User to delete:</p>
            <p className="font-medium">{user.email}</p>
            <div className="flex items-center gap-2 mt-2">
              {user.isPremium && (
                <span className="px-2 py-0.5 text-xs rounded bg-amber-500/20 text-amber-500 font-medium">
                  Premium
                </span>
              )}
              {isAdmin && (
                <span className="px-2 py-0.5 text-xs rounded bg-rose-500/20 text-rose-500 font-medium">
                  Admin (Protected)
                </span>
              )}
            </div>
          </div>

          {isAdmin ? (
            <div className="p-4 rounded-xl bg-muted/50 text-center">
              <p className="text-muted-foreground text-sm">
                Admin accounts cannot be deleted for security reasons.
              </p>
            </div>
          ) : (
            <>
              {/* Confirmation Input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Type <span className="font-mono text-rose-500">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="Type DELETE"
                  disabled={isDeleting}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-rose-500/50 disabled:opacity-50 font-mono"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-500 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-lg border font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {!isAdmin && (
            <button
              onClick={handleDelete}
              disabled={isDeleting || confirmText !== 'DELETE'}
              className="flex-1 px-4 py-2.5 rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete User
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
