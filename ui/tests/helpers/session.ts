import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type { Page } from '@playwright/test';

const DB_PATH = path.join(process.cwd(), '..', 'data', 'builder.db');

export function createSession(userId: number): string {
  const sessionId = randomUUID();
  const db = new Database(DB_PATH);

  try {
    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, datetime('now', '+1 day'))
    `).run(sessionId, userId);
  } finally {
    db.close();
  }

  return sessionId;
}

export function deleteSession(sessionId: string): void {
  const db = new Database(DB_PATH);

  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  } finally {
    db.close();
  }
}

export async function attachSessionCookie(page: Page, sessionId: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'tcm_session',
      value: sessionId,
      domain: 'localhost',
      path: '/',
    },
  ]);
}
