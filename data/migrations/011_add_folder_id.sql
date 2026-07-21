-- Migration: Add folder_id to processed_local_videos
-- Created: 2026-01-17
-- Purpose: Bridge database IDs with filesystem folder IDs

-- Add folder_id column to track the folder name on disk
ALTER TABLE processed_local_videos ADD COLUMN folder_id TEXT;

-- Backfill existing records by extracting folder name from file_path
-- File paths look like: C:\...\data\local-videos\slug_hash\filename.mp4
-- We need to extract the "slug_hash" part

-- For Windows paths (using backslash)
UPDATE processed_local_videos
SET folder_id = (
    SELECT
        CASE
            WHEN INSTR(file_path, '\local-videos\') > 0 THEN
                SUBSTR(
                    SUBSTR(file_path, INSTR(file_path, '\local-videos\') + 14),
                    1,
                    INSTR(SUBSTR(file_path, INSTR(file_path, '\local-videos\') + 14), '\') - 1
                )
            WHEN INSTR(file_path, '/local-videos/') > 0 THEN
                SUBSTR(
                    SUBSTR(file_path, INSTR(file_path, '/local-videos/') + 14),
                    1,
                    INSTR(SUBSTR(file_path, INSTR(file_path, '/local-videos/') + 14), '/') - 1
                )
            ELSE NULL
        END
)
WHERE file_path LIKE '%local-videos%' AND folder_id IS NULL;

-- Create index for efficient folder_id lookups
CREATE INDEX IF NOT EXISTS idx_local_videos_folder_id ON processed_local_videos(folder_id);
