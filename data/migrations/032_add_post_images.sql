-- Migration: Add image_urls to admin_posts
-- Allows posts to have up to 4 image attachments
-- Stored as JSON array of URLs

ALTER TABLE admin_posts ADD COLUMN image_urls TEXT;
