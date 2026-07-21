'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth, useAdmin } from '@/lib/auth/context';
import { WebhookManager } from '@/components/admin/webhook-manager';

type PostType = 'post' | 'tip' | 'announcement' | 'video';

interface PostTypeOption {
  value: PostType;
  label: string;
  icon: string;
  color: string;
}

interface Webhook {
  id: number;
  name: string;
  webhook_url: string;
  enabled: boolean;
  server_name: string | null;
  description: string | null;
}

const postTypes: PostTypeOption[] = [
  { value: 'announcement', label: 'Announcement', icon: '\u{1F4E2}', color: 'text-amber-500' },
  { value: 'tip', label: 'Tip', icon: '\u{1F4A1}', color: 'text-violet-500' },
  { value: 'video', label: 'Video', icon: '\u{1F3AC}', color: 'text-rose-500' },
  { value: 'post', label: 'Post', icon: '\u{1F4DD}', color: 'text-sky-500' },
];

// Group webhooks by server name
function groupWebhooksByServer(webhooks: Webhook[]): Map<string, Webhook[]> {
  const groups = new Map<string, Webhook[]>();

  for (const webhook of webhooks) {
    const serverName = webhook.server_name || 'Uncategorized';
    if (!groups.has(serverName)) {
      groups.set(serverName, []);
    }
    groups.get(serverName)!.push(webhook);
  }

  return groups;
}

interface PostComposerProps {
  onPostCreated?: () => void;
}

export function PostComposer({ onPostCreated }: PostComposerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showWebhookManager, setShowWebhookManager] = useState(false);

  // Form state
  const [type, setType] = useState<PostType>('post');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pinned, setPinned] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyDiscord, setNotifyDiscord] = useState(false);

  // Image upload state
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Webhook selection state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [selectedWebhookIds, setSelectedWebhookIds] = useState<Set<number>>(new Set());
  const [showWebhookDropdown, setShowWebhookDropdown] = useState(false);

  // Fetch webhooks on mount
  useEffect(() => {
    async function fetchWebhooks() {
      setLoadingWebhooks(true);
      try {
        const response = await fetch('/api/admin/discord-webhooks');
        if (response.ok) {
          const data = await response.json();
          setWebhooks(data.webhooks || []);
          // Auto-select all enabled webhooks by default
          const enabledIds = (data.webhooks || [])
            .filter((w: Webhook) => w.enabled)
            .map((w: Webhook) => w.id);
          setSelectedWebhookIds(new Set(enabledIds));
        }
      } catch {
        // Silently fail - webhooks are optional
      } finally {
        setLoadingWebhooks(false);
      }
    }

    if (isAdmin) {
      fetchWebhooks();
    }
  }, [isAdmin]);

  // Refresh webhooks when manager closes
  const handleWebhookManagerClose = async () => {
    setShowWebhookManager(false);
    // Refresh webhooks
    try {
      const response = await fetch('/api/admin/discord-webhooks');
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data.webhooks || []);
        // Update selected webhooks - remove any that no longer exist
        const currentIds = new Set((data.webhooks || []).map((w: Webhook) => w.id));
        setSelectedWebhookIds(prev => {
          const next = new Set<number>();
          prev.forEach(id => {
            if (currentIds.has(id)) next.add(id);
          });
          return next;
        });
      }
    } catch {
      // Silently fail
    }
  };

  const enabledWebhooks = webhooks.filter(w => w.enabled);
  const allEnabledSelected = enabledWebhooks.length > 0 && 
    enabledWebhooks.every(w => selectedWebhookIds.has(w.id));

  const toggleAllEnabled = () => {
    if (allEnabledSelected) {
      // Deselect all
      setSelectedWebhookIds(new Set());
    } else {
      // Select all enabled
      setSelectedWebhookIds(new Set(enabledWebhooks.map(w => w.id)));
    }
  };

  const toggleWebhook = (webhookId: number) => {
    setSelectedWebhookIds(prev => {
      const next = new Set(prev);
      if (next.has(webhookId)) {
        next.delete(webhookId);
      } else {
        next.add(webhookId);
      }
      return next;
    });
  };

  // Handle image upload
  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Check max images
    const remainingSlots = 4 - uploadedUrls.length;
    if (remainingSlots <= 0) {
      setUploadError('Maximum 4 images allowed');
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploading(true);
    setUploadError(null);

    // Create previews immediately
    const newPreviews: string[] = [];
    for (const file of filesToUpload) {
      const preview = URL.createObjectURL(file);
      newPreviews.push(preview);
    }
    setImagePreviews(prev => [...prev, ...newPreviews]);

    // Upload to server
    try {
      const formData = new FormData();
      filesToUpload.forEach(file => formData.append('files', file));

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // Remove previews on error
        setImagePreviews(prev => prev.slice(0, prev.length - newPreviews.length));
        setUploadError(data.error || 'Upload failed');
        return;
      }

      // Update uploaded URLs
      setUploadedUrls(prev => [...prev, ...data.urls]);

      if (data.errors && data.errors.length > 0) {
        setUploadError(data.errors.join(', '));
      }
    } catch {
      // Remove previews on error
      setImagePreviews(prev => prev.slice(0, prev.length - newPreviews.length));
      setUploadError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Remove an image
  const removeImage = (index: number) => {
    // Revoke object URL to prevent memory leaks
    if (imagePreviews[index]?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviews[index]);
    }
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setUploadedUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    handleImageUpload(files);
  };

  const resetForm = useCallback(() => {
    setType('post');
    setTitle('');
    setContent('');
    setLinkUrl('');
    setLinkLabel('');
    setPinned(false);
    setNotifyEmail(true);
    setNotifyDiscord(false);
    setShowWebhookDropdown(false);
    // Reset images
    imagePreviews.forEach(url => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    setImagePreviews([]);
    setUploadedUrls([]);
    setUploadError(null);
    // Reset to all enabled webhooks
    setSelectedWebhookIds(new Set(enabledWebhooks.map(w => w.id)));
    setError(null);
  }, [enabledWebhooks, imagePreviews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim(),
          content: content.trim(),
          link_url: linkUrl.trim() || null,
          link_label: linkLabel.trim() || null,
          pinned,
          notify_email: notifyEmail,
          notify_discord: notifyDiscord,
          // Include selected webhook IDs when Discord is enabled
          webhook_ids: notifyDiscord ? Array.from(selectedWebhookIds) : undefined,
          // Include uploaded image URLs
          image_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create post');
      }

      setSuccess(true);
      resetForm();
      setExpanded(false);
      onPostCreated?.();
      router.refresh(); // Refresh to show new post

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setExpanded(false);
  };

  // Only show for admins
  if (!isAdmin) {
    return null;
  }

  const selectedType = postTypes.find((t) => t.value === type) || postTypes[0];
  const groupedWebhooks = groupWebhooksByServer(webhooks);
  const selectedCount = selectedWebhookIds.size;
  const enabledCount = enabledWebhooks.length;

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
        {/* Success banner */}
        {success && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
            <span>&#10003;</span>
            <span>Post created successfully!</span>
          </div>
        )}

        {/* Collapsed state */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full p-4 text-left flex items-center gap-3 hover:bg-card/50 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <span className="text-amber-500 font-bold text-sm">
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <span className="text-muted-foreground flex-1">What's on your mind?</span>
            <span className="text-xs text-muted-foreground/50 px-2 py-1 bg-card/50 rounded">
              &#9660; Expand
            </span>
          </button>
        )}

        {/* Expanded form */}
        {expanded && (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <span className="text-amber-500">&#9998;</span>
                Create Post
              </h3>
              <span className="text-xs text-muted-foreground px-2 py-1 bg-amber-500/10 text-amber-500 rounded">
                Admin
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
                    onClick={() => setType(pt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                      type === pt.value
                        ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
                        : 'border-border/50 bg-card/30 text-muted-foreground hover:border-border hover:bg-card/50'
                    }`}
                  >
                    <span className={pt.color}>{pt.icon}</span>
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="post-title" className="block text-sm font-medium text-muted-foreground mb-2">
                Title
              </label>
              <input
                id="post-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title..."
                className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Content */}
            <div>
              <label htmlFor="post-content" className="block text-sm font-medium text-muted-foreground mb-2">
                Content
              </label>
              <textarea
                id="post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post..."
                rows={4}
                className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Images (optional)
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                  uploading
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-border/50 hover:border-amber-500/30 hover:bg-card/30'
                }`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {/* Image previews */}
                {imagePreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative group aspect-square">
                        <Image
                          src={preview}
                          alt={`Upload ${index + 1}`}
                          fill
                          className="object-cover rounded-lg"
                        />
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          disabled={uploading}
                          className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400 disabled:opacity-50"
                        >
                          ✕
                        </button>
                        {/* Upload indicator for this image */}
                        {uploading && index >= uploadedUrls.length && (
                          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                            <span className="animate-spin text-white">⟳</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                {uploadedUrls.length < 4 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-2">
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
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground bg-card/50 hover:bg-card/80 border border-border/50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {uploading ? (
                        <>
                          <span className="animate-spin">⟳</span>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <span>📷</span>
                          {imagePreviews.length > 0 ? 'Add More' : 'Add Images'}
                        </>
                      )}
                    </button>
                    <span className="text-xs text-muted-foreground/50">
                      Drag & drop or click • Max 4 images, 5MB each
                    </span>
                  </div>
                )}

                {/* Upload error */}
                {uploadError && (
                  <p className="text-xs text-red-400 mt-2 text-center">{uploadError}</p>
                )}
              </div>
            </div>

            {/* Link fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="post-link-url" className="block text-sm font-medium text-muted-foreground mb-2">
                  Link URL (optional)
                </label>
                <input
                  id="post-link-url"
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label htmlFor="post-link-label" className="block text-sm font-medium text-muted-foreground mb-2">
                  Link Label (optional)
                </label>
                <input
                  id="post-link-label"
                  type="text"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Read more"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Pin option */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-border/50 bg-card/50 text-amber-500 focus:ring-amber-500/50"
                />
                <span className="text-sm text-muted-foreground">
                  <span className="text-amber-500 mr-1">&#128204;</span>
                  Pin this post
                </span>
              </label>
            </div>

            {/* Notification options */}
            <div className="pt-2 border-t border-border/30">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Notifications</label>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-border/50 bg-card/50 text-amber-500 focus:ring-amber-500/50"
                    />
                    <span className="text-sm text-muted-foreground">
                      <span className="mr-1">&#9993;</span>
                      Email
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyDiscord}
                      onChange={(e) => {
                        setNotifyDiscord(e.target.checked);
                        if (e.target.checked) {
                          setShowWebhookDropdown(true);
                        }
                      }}
                      className="h-4 w-4 rounded border-border/50 bg-card/50 text-violet-500 focus:ring-violet-500/50"
                    />
                    <span className="text-sm text-muted-foreground">
                      <span className="text-violet-500 mr-1">&#9679;</span>
                      Discord
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowWebhookManager(true)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-card/50 transition-colors"
                  >
                    <span>&#9881;</span>
                    Configure Webhooks
                  </button>
                </div>

                {/* Discord webhook selector */}
                {notifyDiscord && (
                  <div className="ml-6 space-y-2">
                    {/* Dropdown toggle */}
                    <button
                      type="button"
                      onClick={() => setShowWebhookDropdown(!showWebhookDropdown)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className={`transition-transform ${showWebhookDropdown ? 'rotate-90' : ''}`}>
                        &#9654;
                      </span>
                      <span>
                        {loadingWebhooks ? (
                          'Loading channels...'
                        ) : selectedCount === 0 ? (
                          <span className="text-amber-500">No channels selected</span>
                        ) : selectedCount === enabledCount ? (
                          `All channels (${enabledCount})`
                        ) : (
                          `${selectedCount} of ${enabledCount} channels`
                        )}
                      </span>
                    </button>

                    {/* Webhook selection dropdown */}
                    {showWebhookDropdown && !loadingWebhooks && (
                      <div className="bg-card/50 border border-border/50 rounded-lg overflow-hidden">
                        {/* All Enabled option */}
                        {enabledWebhooks.length > 0 && (
                          <label className="flex items-center gap-3 px-3 py-2 hover:bg-card/30 cursor-pointer border-b border-border/30">
                            <input
                              type="checkbox"
                              checked={allEnabledSelected}
                              onChange={toggleAllEnabled}
                              className="h-4 w-4 rounded border-border/50 bg-card/50 text-violet-500 focus:ring-violet-500/50"
                            />
                            <span className="text-sm font-medium text-foreground">
                              All Enabled ({enabledCount})
                            </span>
                          </label>
                        )}

                        {/* Grouped webhooks */}
                        {webhooks.length === 0 ? (
                          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                            No webhooks configured.{' '}
                            <button
                              type="button"
                              onClick={() => setShowWebhookManager(true)}
                              className="text-amber-500 hover:text-amber-400"
                            >
                              Add one
                            </button>
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto">
                            {Array.from(groupedWebhooks.entries()).map(([serverName, serverWebhooks]) => (
                              <div key={serverName}>
                                {/* Server header */}
                                <div className="px-3 py-1.5 bg-card/30 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                  <span className="text-violet-500">&#9679;</span>
                                  {serverName}
                                </div>
                                {/* Server webhooks */}
                                {serverWebhooks.map((webhook) => (
                                  <label
                                    key={webhook.id}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                      webhook.enabled
                                        ? 'hover:bg-card/30'
                                        : 'opacity-50 cursor-not-allowed'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedWebhookIds.has(webhook.id)}
                                      onChange={() => toggleWebhook(webhook.id)}
                                      disabled={!webhook.enabled}
                                      className="h-4 w-4 rounded border-border/50 bg-card/50 text-violet-500 focus:ring-violet-500/50 disabled:opacity-50"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm text-foreground">{webhook.name}</span>
                                      {!webhook.enabled && (
                                        <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>
                                      )}
                                    </div>
                                  </label>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim() || !content.trim()}
                className="px-4 py-2 text-sm font-medium bg-amber-500 text-background rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">&#9696;</span>
                    Posting...
                  </>
                ) : (
                  <>
                    <span>{selectedType.icon}</span>
                    Post {selectedType.label}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Webhook Manager Modal */}
      {showWebhookManager && <WebhookManager onClose={handleWebhookManagerClose} />}
    </>
  );
}
