import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { NextResponse } from 'next/server';

const PERSISTENT_POST_UPLOADS_DIR = join(process.cwd(), '..', 'data', 'post-uploads');
const LEGACY_PUBLIC_UPLOADS_DIR = join(process.cwd(), 'public', 'uploads', 'posts');

const MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function resolveUploadPath(filename: string): string | null {
  const persistentPath = join(PERSISTENT_POST_UPLOADS_DIR, filename);
  if (existsSync(persistentPath)) {
    return persistentPath;
  }

  const legacyPath = join(LEGACY_PUBLIC_UPLOADS_DIR, filename);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safeFilename = basename(filename);

  if (safeFilename !== filename || safeFilename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filePath = resolveUploadPath(safeFilename);
  if (!filePath) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const file = await readFile(filePath);
  const contentType = MIME_TYPES[extname(safeFilename).toLowerCase()] || 'application/octet-stream';

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': file.byteLength.toString(),
      'Content-Type': contentType,
    },
  });
}
