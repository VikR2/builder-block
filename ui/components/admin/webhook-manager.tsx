'use client';

import { useState, useEffect, useCallback } from 'react';

interface Webhook {
  id: number;
  name: string;
  webhook_url: string; // Masked URL from API
  enabled: boolean;
  server_name: string | null;
  description: string | null;
  created_at: string;
}

interface WebhookManagerProps {
  onClose: () => void;
}

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

export function WebhookManager({ onClose }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Collapsed server groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Add form state
  const [newServerName, setNewServerName] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit modal state
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [editServerName, setEditServerName] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/discord-webhooks');
      if (!response.ok) {
        throw new Error('Failed to fetch webhooks');
      }
      const data = await response.json();
      setWebhooks(data.webhooks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const toggleGroup = (serverName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) {
      setAddError('Channel name and URL are required');
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const response = await fetch('/api/admin/discord-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          webhook_url: newUrl.trim(),
          server_name: newServerName.trim() || null,
          description: newDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add webhook');
      }

      setNewServerName('');
      setNewName('');
      setNewDescription('');
      setNewUrl('');
      setShowAddForm(false);
      fetchWebhooks();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add webhook');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (webhook: Webhook) => {
    try {
      const response = await fetch('/api/admin/discord-webhooks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: webhook.id, enabled: !webhook.enabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to update webhook');
      }

      setWebhooks(webhooks.map((w) => (w.id === webhook.id ? { ...w, enabled: !w.enabled } : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update webhook');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this webhook?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/discord-webhooks?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete webhook');
      }

      setWebhooks(webhooks.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const startEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setEditServerName(webhook.server_name || '');
    setEditName(webhook.name);
    setEditDescription(webhook.description || '');
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingWebhook(null);
    setEditServerName('');
    setEditName('');
    setEditDescription('');
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editingWebhook || !editName.trim()) {
      setEditError('Channel name is required');
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const response = await fetch('/api/admin/discord-webhooks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingWebhook.id,
          name: editName.trim(),
          server_name: editServerName.trim() || null,
          description: editDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update webhook');
      }

      setWebhooks(webhooks.map((w) =>
        w.id === editingWebhook.id
          ? {
              ...w,
              name: editName.trim(),
              server_name: editServerName.trim() || null,
              description: editDescription.trim() || null,
            }
          : w
      ));
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update webhook');
    } finally {
      setSaving(false);
    }
  };

  // Get unique server names for autocomplete
  const existingServerNames = [...new Set(webhooks.map(w => w.server_name).filter(Boolean))] as string[];

  const groupedWebhooks = groupWebhooksByServer(webhooks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-violet-500">&#9679;</span>
            <h2 className="font-semibold text-foreground">Discord Webhooks</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card/50 rounded transition-colors"
          >
            &#10005;
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <span className="animate-spin inline-block">&#9696;</span>
              <p className="mt-2">Loading webhooks...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={fetchWebhooks}
                className="mt-2 text-sm text-amber-500 hover:text-amber-400"
              >
                Retry
              </button>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <span className="text-4xl mb-2 block">&#128268;</span>
              <p>No webhooks configured</p>
              <p className="text-xs mt-1">Add a Discord webhook to enable notifications</p>
            </div>
          ) : (
            <div className="p-2">
              {Array.from(groupedWebhooks.entries()).map(([serverName, serverWebhooks]) => (
                <div key={serverName} className="mb-3">
                  {/* Server group header */}
                  <button
                    onClick={() => toggleGroup(serverName)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/50 rounded-lg transition-colors"
                  >
                    <span className={`transition-transform ${collapsedGroups.has(serverName) ? '' : 'rotate-90'}`}>
                      &#9654;
                    </span>
                    <span className="text-violet-500">&#9679;</span>
                    <span>{serverName}</span>
                    <span className="text-xs text-muted-foreground/70">({serverWebhooks.length})</span>
                  </button>

                  {/* Server webhooks */}
                  {!collapsedGroups.has(serverName) && (
                    <div className="ml-4 mt-1 space-y-2">
                      {serverWebhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className="p-3 bg-card/30 border border-border/30 rounded-lg hover:border-border/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            {/* Toggle */}
                            <button
                              onClick={() => handleToggle(webhook)}
                              className={`mt-0.5 w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                                webhook.enabled ? 'bg-emerald-500' : 'bg-muted'
                              }`}
                            >
                              <div
                                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                                  webhook.enabled ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{webhook.name}</p>
                              {webhook.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {webhook.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground/70 mt-1">{webhook.webhook_url}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => startEdit(webhook)}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded transition-colors"
                                title="Edit"
                              >
                                &#9881;
                              </button>
                              <button
                                onClick={() => handleDelete(webhook.id)}
                                className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                title="Delete"
                              >
                                &#128465;
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAdd} className="p-4 border-t border-border/50 space-y-3">
              <h3 className="text-sm font-medium text-foreground mb-3">Add Webhook</h3>

              <div>
                <label htmlFor="webhook-server-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Server Name
                </label>
                <input
                  id="webhook-server-name"
                  type="text"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="e.g., TCM Server"
                  list="server-names"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
                <datalist id="server-names">
                  {existingServerNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="webhook-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Channel Name
                </label>
                <input
                  id="webhook-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="#channel-name"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label htmlFor="webhook-description" className="block text-xs font-medium text-muted-foreground mb-1">
                  Description (optional)
                </label>
                <input
                  id="webhook-description"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What this webhook is used for"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label htmlFor="webhook-url" className="block text-xs font-medium text-muted-foreground mb-1">
                  Webhook URL
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {addError && <p className="text-xs text-red-400">{addError}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewServerName('');
                    setNewName('');
                    setNewDescription('');
                    setNewUrl('');
                    setAddError(null);
                  }}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !newName.trim() || !newUrl.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-violet-500 text-white rounded hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {adding ? 'Adding...' : 'Add Webhook'}
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
              <span>+</span>
              Add Webhook
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

      {/* Edit Modal */}
      {editingWebhook && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={cancelEdit} />
          <div className="relative w-full max-w-md mx-4 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50">
              <h3 className="font-semibold text-foreground">Edit Webhook</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label htmlFor="edit-server-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Server Name
                </label>
                <input
                  id="edit-server-name"
                  type="text"
                  value={editServerName}
                  onChange={(e) => setEditServerName(e.target.value)}
                  placeholder="e.g., TCM Server"
                  list="edit-server-names"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
                <datalist id="edit-server-names">
                  {existingServerNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="edit-name" className="block text-xs font-medium text-muted-foreground mb-1">
                  Channel Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="#channel-name"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label htmlFor="edit-description" className="block text-xs font-medium text-muted-foreground mb-1">
                  Description (optional)
                </label>
                <input
                  id="edit-description"
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What this webhook is used for"
                  className="w-full px-3 py-2 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Webhook URL
                </label>
                <p className="text-sm text-muted-foreground/70 px-3 py-2 bg-card/30 rounded-lg">
                  {editingWebhook.webhook_url}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">URL cannot be changed. Delete and recreate if needed.</p>
              </div>

              {editError && <p className="text-xs text-red-400">{editError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/50">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving || !editName.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-background rounded hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
