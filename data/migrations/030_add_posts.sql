-- TCM Home Page: Admin Posts and Notification Tables
-- Migration: 030_add_posts.sql
-- Created: 2026-01-18

-- Admin posts table for creator updates
CREATE TABLE IF NOT EXISTS admin_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'post',     -- 'post' | 'tip' | 'announcement' | 'video'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    link_url TEXT,
    link_label TEXT,
    pinned INTEGER DEFAULT 0,
    notify_email INTEGER DEFAULT 1,        -- Email subscribers by default
    notify_discord INTEGER DEFAULT 0,      -- Optional Discord push
    notified_at TEXT,                      -- When notifications were sent
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Discord webhook configuration for notifications
CREATE TABLE IF NOT EXISTS discord_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_posts_type ON admin_posts(type);
CREATE INDEX IF NOT EXISTS idx_admin_posts_pinned ON admin_posts(pinned);
CREATE INDEX IF NOT EXISTS idx_admin_posts_created ON admin_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_discord_webhooks_enabled ON discord_webhooks(enabled);

-- Seed with sample posts for initial content
INSERT INTO admin_posts (type, title, content, pinned, created_at) VALUES
    ('announcement', 'Welcome to The Currency Merchant', 'Your journey to mastering price action begins here. Explore the video library, study the skills, and build your edge in the markets.', 1, datetime('now', '-1 day')),
    ('tip', 'Daily Bias Check', 'Always check the daily candle close before your trading session. The higher timeframe sets direction, the lower timeframe gives entry.', 0, datetime('now', '-2 hours')),
    ('video', 'New: CISD Pattern Deep Dive', 'Learn how to identify and trade the Change in State of Delivery pattern with live examples from recent sessions.', 0, datetime('now', '-4 hours'));
