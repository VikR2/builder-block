import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');

export async function GET() {
  const dbFilePresent = existsSync(DB_PATH);
  let databaseReady = false;
  let error: string | null = null;

  if (dbFilePresent) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      db.prepare('SELECT 1').get();
      db.close();
      databaseReady = true;
    } catch (dbError) {
      error = dbError instanceof Error ? dbError.message : 'Unknown database error';
    }
  } else {
    error = 'Database file is missing';
  }

  return NextResponse.json(
    {
      ok: true,
      checks: {
        serverReady: true,
        dbFilePresent,
        databaseReady,
      },
      error,
    },
    { status: 200 }
  );
}
