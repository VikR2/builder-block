-- Migration: Add server_name and description to discord_webhooks
-- This allows grouping webhooks by Discord server and adding descriptions

ALTER TABLE discord_webhooks ADD COLUMN server_name TEXT;
ALTER TABLE discord_webhooks ADD COLUMN description TEXT;
