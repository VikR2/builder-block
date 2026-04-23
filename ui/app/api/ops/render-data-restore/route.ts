import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MIGRATION_TOKEN = process.env.RENDER_MIGRATION_TOKEN;
const RELEASE_TAG = process.env.RENDER_DATA_RELEASE_TAG || 'render-data-bundle-20260423';
const RELEASE_REPO = process.env.RENDER_DATA_RELEASE_REPO || 'VikR2/builder-block';
const TEMP_DIR = '/tmp/builder-block-render-restore';
const ZIP_PATH = join(TEMP_DIR, 'render-data-bundle.zip');
const MANIFEST_FILE = 'render-data-bundle.parts.json';

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

function fileUrl(name: string) {
  return `https://github.com/${RELEASE_REPO}/releases/download/${RELEASE_TAG}/${name}`;
}

async function downloadToFile(url: string, destination: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const writable = createWriteStream(destination);
  const readable = Readable.fromWeb(response.body as any);
  await pipeline(readable, writable);
}

async function concatenateParts(parts: string[], outputPath: string) {
  const out = createWriteStream(outputPath);

  try {
    for (const partPath of parts) {
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(partPath);
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.pipe(out, { end: false });
      });
    }
  } finally {
    out.end();
  }
}

async function runRestoreScript(bundlePath: string) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('python', [
      '/app/scripts/render_restore_data_bundle.py',
      '--bundle',
      bundlePath,
      '--dest',
      '/app/data',
      '--replace',
    ], {
      cwd: '/app/ui',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `Restore script exited with code ${code}`));
    });
  });
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

  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  try {
    const manifestPath = join(TEMP_DIR, MANIFEST_FILE);
    await downloadToFile(fileUrl(MANIFEST_FILE), manifestPath);

    const manifest = JSON.parse(await (await import('fs/promises')).readFile(manifestPath, 'utf-8')) as {
      parts: Array<{ name: string }>;
    };

    const partPaths: string[] = [];
    for (const part of manifest.parts) {
      const partPath = join(TEMP_DIR, part.name);
      await downloadToFile(fileUrl(part.name), partPath);
      partPaths.push(partPath);
    }

    await concatenateParts(partPaths, ZIP_PATH);
    await runRestoreScript(ZIP_PATH);

    return NextResponse.json({
      status: 'success',
      restoredTo: '/app/data',
      releaseTag: RELEASE_TAG,
      partCount: manifest.parts.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown restore failure',
      },
      { status: 500 }
    );
  }
}
