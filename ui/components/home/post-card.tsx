'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/lib/auth/context';
import type { AdminPost, PostType } from '@/lib/posts-db';
import { ImageLightbox } from './image-lightbox';

// Parse image_urls JSON string to array
function parseImageUrls(imageUrls: string | null): string[] {
  if (!imageUrls) return [];
  try {
    const parsed = JSON.parse(imageUrls);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface PostCardProps {
  post: AdminPost;
}

const postTypes: { value: PostType; label: string; icon: string }[] = [
  { value: 'announcement', label: 'Announcement', icon: '📢' },
  { value: 'tip', label: 'Tip', icon: '💡' },
  { value: 'video', label: 'Video', icon: '🎬' },
  { value: 'post', label: 'Post', icon: '📝' },
];

function getPostTypeIcon(type: string): string {
  switch (type) {
    case 'announcement': return '📢';
    case 'tip': return '💡';
    case 'video': return '🎬';
    default: return '📝';
  }
}

function getPostTypeLabel(type: string): string {
  switch (type) {
    case 'announcement': return 'Announcement';
    case 'tip': return 'Trading Tip';
    case 'video': return 'New Video';
    default: return 'Post';
  }
}

function getPostTypeColor(type: string): string {
  switch (type) {
    case 'announcement': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'tip': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'video': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  }
}

function formatDate(dateStr: string): string {
  // Handle SQLite date format (UTC) by appending Z if no timezone indicator
  const normalizedStr = dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)
    ? dateStr
    : dateStr + 'Z';
  const date = new Date(normalizedStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates (timezone edge cases) gracefully
  if (diffMs < 0) {
    return 'Just now';
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit form state
  const [editType, setEditType] = useState<PostType>(post.type as PostType);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editLinkUrl, setEditLinkUrl] = useState(post.link_url || '');
  const [editLinkLabel, setEditLinkLabel] = useState(post.link_label || '');
  const [editPinned, setEditPinned] = useState(post.pinned === 1);

  // Image edit state
  const [editImages, setEditImages] = useState<string[]>(parseImageUrls(post.image_urls));
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPinned = post.pinned === 1;
  const typeColor = getPostTypeColor(post.type);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/posts?id=${post.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete post');
      }

      // Refresh the page to show updated posts
      router.refresh();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete post');
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  const handleStartEdit = () => {
    // Reset form to current post values
    setEditType(post.type as PostType);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditLinkUrl(post.link_url || '');
    setEditLinkLabel(post.link_label || '');
    setEditPinned(post.pinned === 1);
    setEditImages(parseImageUrls(post.image_urls));
    setNewImagePreviews([]);
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // Clean up any preview URLs
    newImagePreviews.forEach(url => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    setNewImagePreviews([]);
    setIsEditing(false);
    setEditError(null);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const totalImages = editImages.length + newImagePreviews.length;
    const remainingSlots = 4 - totalImages;
    if (remainingSlots <= 0) {
      setEditError('Maximum 4 images allowed');
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploadingImages(true);
    setEditError(null);

    // Create previews
    const newPreviews: string[] = [];
    for (const file of filesToUpload) {
      newPreviews.push(URL.createObjectURL(file));
    }
    setNewImagePreviews(prev => [...prev, ...newPreviews]);

    try {
      const formData = new FormData();
      filesToUpload.forEach(file => formData.append('files', file));

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setNewImagePreviews(prev => prev.slice(0, prev.length - newPreviews.length));
        setEditError(data.error || 'Upload failed');
        return;
      }

      // Replace previews with actual URLs
      setNewImagePreviews(prev => prev.slice(0, prev.length - newPreviews.length));
      setEditImages(prev => [...prev, ...data.urls]);

      // Clean up blob URLs
      newPreviews.forEach(url => URL.revokeObjectURL(url));
    } catch {
      setNewImagePreviews(prev => prev.slice(0, prev.length - newPreviews.length));
      setEditError('Upload failed');
    } finally {
      setUploadingImages(false);
    }
  };

  const removeEditImage = (index: number, isPreview: boolean) => {
    if (isPreview) {
      const url = newImagePreviews[index];
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      setNewImagePreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      setEditImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setEditError('Title and content are required');
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const response = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: post.id,
          type: editType,
          title: editTitle.trim(),
          content: editContent.trim(),
          link_url: editLinkUrl.trim() || null,
          link_label: editLinkLabel.trim() || null,
          pinned: editPinned,
          image_urls: editImages.length > 0 ? editImages : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update post');
      }

      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  // Edit mode UI
  if (isEditing) {
    const allImages = [...editImages, ...newImagePreviews];

    return (
      <article className="relative rounded-xl border border-amber-500/50 bg-card/80 p-6">
        <div className="space-y-4">
          {/* Edit header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="text-amber-500">✏️</span>
              Edit Post
            </h3>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-amber-500/10 text-amber-500 rounded">
              Editing
            </span>
          </div>

          {/* Post type selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {postTypes.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setEditType(pt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                    editType === pt.value
                      ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
                      : 'border-border/50 bg-card/30 text-muted-foreground hover:border-border hover:bg-card/50'
                  }`}
                >
                  <span>{pt.icon}</span>
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Content</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Images</label>
            <div className="space-y-3">
              {/* Existing and new images */}
              {allImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {editImages.map((url, index) => (
                    <div key={`existing-${index}`} className="relative group aspect-square">
                      <Image src={url} alt={`Image ${index + 1}`} fill className="object-cover rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index, false)}
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {newImagePreviews.map((url, index) => (
                    <div key={`preview-${index}`} className="relative group aspect-square">
                      <Image src={url} alt={`New image ${index + 1}`} fill className="object-cover rounded-lg" />
                      {uploadingImages && (
                        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                          <span className="animate-spin text-white">⟳</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeEditImage(index, true)}
                        disabled={uploadingImages}
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add image button */}
              {allImages.length < 4 && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    onChange={(e) => handleImageUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-card/50 hover:bg-card/80 border border-dashed border-border/50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploadingImages ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <span>📷</span>
                        Add Images ({4 - allImages.length} remaining)
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Link fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Link URL (optional)</label>
              <input
                type="url"
                value={editLinkUrl}
                onChange={(e) => setEditLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Link Label (optional)</label>
              <input
                type="text"
                value={editLinkLabel}
                onChange={(e) => setEditLinkLabel(e.target.value)}
                placeholder="Read more"
                className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* Pin checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editPinned}
              onChange={(e) => setEditPinned(e.target.checked)}
              className="h-4 w-4 rounded border-border/50 bg-card/50 text-amber-500 focus:ring-amber-500/50"
            />
            <span className="text-sm text-muted-foreground">
              <span className="text-amber-500 mr-1">📌</span>
              Pin this post
            </span>
          </label>

          {/* Error message */}
          {editError && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {editError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving || !editTitle.trim() || !editContent.trim()}
              className="px-4 py-2 text-sm font-medium bg-amber-500 text-background rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`
        relative rounded-xl border bg-card/50 p-6 transition-all duration-300
        hover:bg-card/80 hover:shadow-lg hover:shadow-amber-500/5
        ${isPinned ? 'border-amber-500/30 bg-amber-950/20' : 'border-border/50'}
      `}
    >
      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute -top-2 -right-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs shadow-lg shadow-amber-500/30">
            📌
          </span>
        </div>
      )}

      {/* Admin actions */}
      {isAdmin && (
        <div className="absolute top-4 right-4 flex items-center gap-1">
          {showConfirm ? (
            <div className="flex items-center gap-2 bg-card/90 border border-border/50 rounded-lg px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
              >
                {deleting ? '...' : 'Yes'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                No
              </button>
            </div>
          ) : (
            <>
              {/* Edit button */}
              <button
                onClick={handleStartEdit}
                className="p-1.5 text-muted-foreground/50 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                title="Edit post"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              {/* Delete button */}
              <button
                onClick={() => setShowConfirm(true)}
                className="p-1.5 text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Delete post"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Post type badge */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${typeColor}`}>
          <span>{getPostTypeIcon(post.type)}</span>
          <span>{getPostTypeLabel(post.type)}</span>
        </span>
        <span className="text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-foreground mb-3 leading-tight">
        {post.title}
      </h3>

      {/* Content */}
      <p className="text-muted-foreground leading-relaxed mb-4">
        {post.content}
      </p>

      {/* Image Gallery */}
      {(() => {
        const images = parseImageUrls(post.image_urls);
        if (images.length === 0) return null;

        // Determine grid layout based on image count
        const gridClass =
          images.length === 1
            ? 'grid-cols-1'
            : images.length === 2
            ? 'grid-cols-2'
            : images.length === 3
            ? 'grid-cols-2'
            : 'grid-cols-2';

        return (
          <>
            <div className={`grid ${gridClass} gap-2 mb-4 rounded-lg overflow-hidden`}>
              {images.map((url, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  className={`relative aspect-video bg-card/50 cursor-zoom-in group ${
                    images.length === 3 && index === 0 ? 'row-span-2 aspect-square' : ''
                  }`}
                >
                  <Image
                    src={url}
                    alt={`Post image ${index + 1}`}
                    fill
                    className="object-cover rounded-lg transition-transform group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                  {/* Hover overlay with zoom hint */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white bg-black/50 p-2 rounded-full">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Lightbox */}
            {lightboxOpen && (
              <ImageLightbox
                images={images}
                currentIndex={lightboxIndex}
                onClose={() => setLightboxOpen(false)}
                onNavigate={setLightboxIndex}
              />
            )}
          </>
        );
      })()}

      {/* Link button */}
      {post.link_url && (
        <div className="pt-2">
          <Link
            href={post.link_url}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 text-sm font-medium transition-all"
          >
            {post.link_label || 'Learn More'}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* Warm glow effect for pinned posts */}
      {isPinned && (
        <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-amber-500/5 via-transparent to-transparent"></div>
      )}
    </article>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-6 w-24 rounded-full bg-muted"></div>
        <div className="h-4 w-16 rounded bg-muted"></div>
      </div>
      <div className="h-6 w-3/4 rounded bg-muted mb-3"></div>
      <div className="space-y-2 mb-4">
        <div className="h-4 w-full rounded bg-muted"></div>
        <div className="h-4 w-5/6 rounded bg-muted"></div>
      </div>
      <div className="h-10 w-28 rounded-lg bg-muted"></div>
    </div>
  );
}
