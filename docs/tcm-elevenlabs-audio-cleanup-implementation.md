# TCM ElevenLabs Audio Cleanup Implementation

Concrete implementation plan for improving noisy uploaded coaching videos by running ElevenLabs Voice Isolator before transcription with Scribe v2.

## Goal

Reduce Discord sounds, background noise, and other non-primary audio in uploaded lesson videos while preserving the mentor's speech well enough to improve transcript quality and downstream lesson extraction.

This phase is focused on extraction quality, not on changing the member-facing MP4.

## Current Pipeline

The current admin upload and extraction flow is:

1. `ui/lib/tcm-admin/uploads.ts`
   - finalizes the uploaded video into `data/local-videos/<folder>/`
   - creates a `processed_local_videos` row
   - creates a processing job
2. `ui/lib/tcm-admin/processor.ts`
   - launches `scripts/process_local_mp4.py`
   - streams progress updates back into the admin UI
3. `scripts/process_local_mp4.py`
   - transcribes audio
   - extracts frames
   - writes transcript artifacts and manifest
4. `scripts/lib/media_extraction.py`
   - extracts WAV audio for Whisper
   - or uploads the MP4 directly to ElevenLabs Scribe v2

Current limitation:

- There is no audio cleanup stage before transcription.
- The ElevenLabs path skips local audio extraction, which prevents running Voice Isolator first.
- The admin job model does not currently carry backend or cleanup settings.

## V1 Decision

V1 should ship:

- extracted raw WAV audio
- optional ElevenLabs Voice Isolator cleanup
- transcription from cleaned audio with ElevenLabs Scribe v2
- fallback to raw audio if cleanup fails
- no cleaned MP4 remux

Why this version first:

- Improves transcript quality where the pain is highest.
- Avoids changing playback behavior for members.
- Preserves a low-risk fallback path.
- Keeps the existing synchronous worker architecture.

## Target Pipeline

For `transcription_backend = elevenlabs` and `audio_cleanup_mode = voice_isolator`:

1. Extract `audio.raw.wav` from the uploaded MP4.
2. Send `audio.raw.wav` to ElevenLabs Voice Isolator.
3. Save `audio.cleaned.wav` if cleanup succeeds.
4. Transcribe the cleaned audio with Scribe v2.
5. Save transcript artifacts exactly as the current pipeline expects.
6. Continue with frames, embeddings, lesson generation, and shorts generation.

Fallback behavior:

- If Voice Isolator fails, continue with `audio.raw.wav`.
- If cleanup is skipped due to file limits, continue with `audio.raw.wav`.
- The job should only fail when transcription itself fails or required artifacts are missing.

## Data Model Changes

### `video_processing_jobs`

Add:

- `transcription_backend TEXT NOT NULL DEFAULT 'whisper'`
- `audio_cleanup_mode TEXT NOT NULL DEFAULT 'none'`
- `transcript_model TEXT NULL`
- `keyterms_json TEXT NULL`

### `processed_local_videos`

Add:

- `audio_cleanup_mode TEXT NULL`
- `transcript_model TEXT NULL`
- `cleaned_audio_path TEXT NULL`
- `audio_cleanup_status TEXT NULL`

## Migration

Create a new migration:

- `data/migrations/042_add_audio_processing_fields.sql`

Update:

- `ui/lib/tcm-admin/db.ts`

The `ensureAdminTables()` bootstrap should run the new migration using the same idempotent pattern already used for migrations `011` and `041`.

## API Contract

The manual reprocess endpoint should accept:

```json
{
  "whisper_model": "base",
  "frame_interval": 45,
  "extraction_mode": "reflective",
  "transcription_backend": "whisper",
  "audio_cleanup_mode": "none",
  "keyterms": []
}
```

Recommended defaults:

- Auto-upload jobs: `whisper + none`
- Manual noisy-video reprocessing: `elevenlabs + voice_isolator`

Reason:

- We want a safe canary path before changing the default upload behavior for every lesson video.

## File-by-File Implementation

### `ui/lib/tcm-admin/db.ts`

Update the TypeScript types:

- `ProcessingJob`
- `ProcessedVideo`

Extend `createJob(...)` so it stores:

- `transcription_backend`
- `audio_cleanup_mode`
- `transcript_model`
- `keyterms_json`

### `ui/app/api/tcm/admin/videos/[id]/route.ts`

Update the POST route to accept:

- `transcription_backend`
- `audio_cleanup_mode`
- `keyterms`

Convert `keyterms` to JSON before storing it on the job.

### `ui/lib/tcm-admin/uploads.ts`

Keep the current auto-processing behavior, but set explicit conservative defaults:

- `transcription_backend: 'whisper'`
- `audio_cleanup_mode: 'none'`

This keeps the current production behavior stable while the ElevenLabs path is validated manually.

### `ui/lib/tcm-admin/processor.ts`

Thread the new job settings into the Python worker:

- `--transcription-backend`
- `--audio-cleanup-mode`
- `--keyterms-json`

Extend the extraction result shape so it can persist:

- `transcription_backend`
- `audio_cleanup_mode`
- `audio_cleanup_status`
- `transcript_model`
- `cleaned_audio_path`

Update `updateVideo(...)` in the finalize path so these values are visible in the admin UI and database.

### `scripts/process_local_mp4.py`

Add CLI flags:

- `--audio-cleanup-mode`
- `--keyterms-json`

Extend `process_local_mp4(...)` to accept:

- `audio_cleanup_mode`
- `keyterms`

Ensure the final JSON result includes:

- `transcription_backend`
- `audio_cleanup_mode`
- `audio_cleanup_status`
- `transcript_model`
- `cleaned_audio_path`

### `scripts/lib/media_extraction.py`

Refactor the ElevenLabs path so it no longer uploads the MP4 directly to Scribe first.

Add:

- `isolate_audio_with_elevenlabs(audio_path, output_path, api_key)`

Change:

- `transcribe_with_elevenlabs(...)` to support `keyterms`
- `transcribe_video(...)` to run:
  - raw audio extraction
  - optional cleanup
  - transcription from the chosen audio artifact

The cleaned-audio path should return metadata in addition to transcript data so the caller can persist cleanup status.

### `ui/app/tcm/admin/videos/[id]/page.tsx`

Update the readiness panel to show:

- `Transcript Method`
- `Transcript Model`
- `Audio Cleanup`
- `Cleanup Status`

The current `Whisper Model` field should remain only as a backend-specific detail, not the primary way we describe transcription.

## Artifact Contract

Each processed video directory should contain:

```text
data/local-videos/<folder_id>/
├── audio.raw.wav
├── audio.cleaned.wav            # present only when cleanup succeeds
├── frames/
├── manifest.json
├── transcript.txt
└── transcript_timed.json
```

Notes:

- The transcript artifacts must keep the same shape so downstream steps do not need to change.
- We are not adding `cleaned.mp4` in V1.

## ElevenLabs Settings

### Voice Isolator

Use Voice Isolator only on extracted audio, not on the MP4 directly.

Operational rules:

- If cleanup succeeds, transcribe `audio.cleaned.wav`.
- If cleanup fails, transcribe `audio.raw.wav`.
- If the extracted audio exceeds vendor limits, skip cleanup and continue with raw audio.

### Scribe v2

Start with:

- `model_id = "scribe_v2"`
- `language_code = "eng"`
- `no_verbatim = true`
- `diarize = false`
- `tag_audio_events = false`
- `keyterms = [...]` when provided

Why:

- The main problem is transcript clarity on noisy uploads, not speaker attribution.
- `no_verbatim` should produce cleaner training-library output.
- `keyterms` gives us a path to preserve mentor/course vocabulary.

## Failure Policy

### Cleanup failure

If Voice Isolator fails:

- log a warning
- set `audio_cleanup_status = "failed_fallback_raw"`
- continue with `audio.raw.wav`

### Cleanup skipped

If Voice Isolator is not attempted due to settings or file limits:

- set `audio_cleanup_status = "skipped"`

### Cleanup success

If Voice Isolator succeeds:

- set `audio_cleanup_status = "completed"`
- set `cleaned_audio_path`

### Transcription failure

If Scribe v2 fails:

- fail the extraction job

We should not silently swap to another provider in V1 unless we explicitly decide to support provider fallback behavior.

## Rollout Plan

### Phase 1: Schema and plumbing

- add migration `042`
- add database and TypeScript fields
- pass new settings through the admin API and worker

### Phase 2: Python cleanup pipeline

- extract raw WAV audio first
- add Voice Isolator integration
- transcribe cleaned audio with Scribe v2
- preserve transcript artifact compatibility

### Phase 3: Manual validation

Manually reprocess 5-10 noisy uploads using:

- `transcription_backend = elevenlabs`
- `audio_cleanup_mode = voice_isolator`

Evaluate:

- transcript accuracy
- artifact completeness
- processing time
- failure rate

### Phase 4: Default flip

If validation is clearly positive:

- change auto-upload jobs from `whisper + none`
- to `elevenlabs + voice_isolator`

Keep a quick server-side rollback path by preserving the old backend and cleanup settings.

## Validation Checklist

- Reprocess one clean lesson video and one noisy lesson video end-to-end.
- Confirm transcript, manifest, frames, embeddings, lesson, and shorts artifacts are still created.
- Compare known noisy timestamps before and after cleanup.
- Confirm the admin detail page displays backend and cleanup metadata correctly.
- Confirm cleanup failure does not leave the job stuck in `extracting`.

## Deferred Work

Not in V1:

- async ElevenLabs webhooks
- chunked cleanup for very long recordings
- diarization
- cleaned MP4 generation
- automatic noise-scoring to decide when cleanup should run

These can be added after the first quality bake-off.

## Recommendation

Implement the new path behind manual reprocessing first, validate it on real noisy uploads, then change auto-upload defaults only after the comparison is positive.
