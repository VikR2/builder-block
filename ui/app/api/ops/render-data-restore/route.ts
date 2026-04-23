import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MIGRATION_TOKEN = process.env.RENDER_MIGRATION_TOKEN;
const RELEASE_TAG = process.env.RENDER_DATA_RELEASE_TAG || 'render-data-bundle-20260423';
const RELEASE_REPO = process.env.RENDER_DATA_RELEASE_REPO || 'VikR2/builder-block';
const STATUS_FILE = '/app/data/.render-restore-status.json';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function tokensMatch(expected: string | undefined, provided: string | null | undefined) {
  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function readStatusPayload() {
  if (!existsSync(STATUS_FILE)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
  } catch {
    return {
      status: 'error',
      error: 'Status file exists but could not be parsed',
    };
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const providedToken = request.headers.get('x-render-migration-token')
    ?? requestUrl.searchParams.get('token');

  if (!tokensMatch(MIGRATION_TOKEN, providedToken)) {
    return unauthorized();
  }

  const payload = readStatusPayload();
  return NextResponse.json(
    payload ?? {
      status: existsSync('/app/data/builder.db') ? 'already_restored' : 'idle',
    }
  );
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const body = await request.json().catch(() => ({})) as { token?: string };
  const providedToken = request.headers.get('x-render-migration-token')
    ?? requestUrl.searchParams.get('token')
    ?? body.token;

  if (!tokensMatch(MIGRATION_TOKEN, providedToken)) {
    return unauthorized();
  }

  const targetDbPath = '/app/data/builder.db';
  if (existsSync(targetDbPath)) {
    return NextResponse.json({
      status: 'already_restored',
      message: 'builder.db already exists on the Render disk',
    });
  }

  const currentStatus = readStatusPayload();
  if (currentStatus?.status && !['error', 'success', 'already_restored'].includes(currentStatus.status)) {
    return NextResponse.json({
      status: 'already_running',
      currentStatus,
    });
  }

  mkdirSync('/app/data', { recursive: true });
  const proc = spawn('python', [
    '/app/scripts/render_restore_from_release.py',
    '--repo',
    RELEASE_REPO,
    '--tag',
    RELEASE_TAG,
    '--dest',
    '/app/data',
    '--status-file',
    STATUS_FILE,
  ], {
    cwd: '/app/ui',
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();

  return NextResponse.json({
    status: 'started',
    pid: proc.pid,
    releaseTag: RELEASE_TAG,
    releaseRepo: RELEASE_REPO,
    statusEndpoint: '/api/ops/render-data-restore',
  });
}
