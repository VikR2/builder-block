'use server';

import Database from 'better-sqlite3';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { createError, ErrorCode } from '@/lib/errors';

const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');
const SCRIPTS_OUTPUT_PATH = join(process.cwd(), '..', 'data', 'scripts-output');

interface UploadScriptResult {
  success: boolean;
  scriptId?: number;
  error?: string;
  errorCode?: ErrorCode;
}

interface CreateJournalEntryResult {
  success: boolean;
  entryId?: number;
  error?: string;
  errorCode?: ErrorCode;
}

interface CreateProjectResult {
  success: boolean;
  projectId?: number;
  error?: string;
}

export async function uploadScript(formData: FormData): Promise<UploadScriptResult> {
  try {
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    // Validate required fields
    if (!file || !projectId) {
      const error = createError(ErrorCode.MISSING_FIELDS, 'File or projectId missing');
      return { success: false, error: error.userMessage, errorCode: error.code };
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      const error = createError(
        ErrorCode.FILE_TOO_LARGE,
        `File size ${file.size} exceeds ${MAX_FILE_SIZE}`,
        { fileSize: file.size, maxSize: MAX_FILE_SIZE }
      );
      return { success: false, error: error.userMessage, errorCode: error.code };
    }

    // Validate file extension
    if (!file.name.endsWith('.cs')) {
      const error = createError(ErrorCode.INVALID_FILE_TYPE, 'File type is not .cs');
      return { success: false, error: error.userMessage, errorCode: error.code };
    }

    // Read file content
    const buffer = await file.arrayBuffer();
    const content = Buffer.from(buffer).toString('utf-8');

    // Generate file hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Keep generated scripts on the persistent app data volume in production.
    const scriptsDir = SCRIPTS_OUTPUT_PATH;
    try {
      mkdirSync(scriptsDir, { recursive: true });
      const fileName = file.name;
      const filePath = join(scriptsDir, fileName);
      writeFileSync(filePath, content);

      // Insert into database
      let db;
      try {
        db = new Database(DB_PATH);
        const stmt = db.prepare(`
          INSERT INTO scripts (
            project_id, name, version, description, file_path, file_hash,
            compilation_status, deployment_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const result = stmt.run(
          Number(projectId),
          name || file.name.replace('.cs', ''),
          '1.0',
          description || null,
          filePath,
          hash,
          'pending',
          'draft'
        );

        db.close();

        // Revalidate the project page
        revalidatePath('/projects/[slug]', 'page');

        return { success: true, scriptId: Number(result.lastInsertRowid) };
      } catch (dbError) {
        if (db) db.close();
        console.error('Database error:', dbError);
        const error = createError(ErrorCode.DATABASE_ERROR, String(dbError), dbError);
        return { success: false, error: error.userMessage, errorCode: error.code };
      }
    } catch (fsError) {
      console.error('File system error:', fsError);
      const error = createError(ErrorCode.FILE_SYSTEM_ERROR, String(fsError));
      return { success: false, error: error.userMessage, errorCode: error.code };
    }
  } catch (error) {
    console.error('Unexpected error uploading script:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
      errorCode: ErrorCode.DATABASE_ERROR
    };
  }
}

export async function createJournalEntry(data: {
  projectId: number;
  scriptId?: number;
  title: string;
  entryType: string;
  content: string;
  attachments?: File[];
}): Promise<CreateJournalEntryResult> {
  try {
    const db = new Database(DB_PATH);

    // Insert journal entry
    const stmt = db.prepare(`
      INSERT INTO journal_entries (
        project_id, script_id, title, entry_type, content,
        has_attachments, attachment_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const hasAttachments = data.attachments && data.attachments.length > 0 ? 1 : 0;
    const attachmentCount = data.attachments?.length || 0;

    const result = stmt.run(
      data.projectId,
      data.scriptId || null,
      data.title,
      data.entryType,
      data.content,
      hasAttachments,
      attachmentCount
    );

    const entryId = Number(result.lastInsertRowid);

    // Handle attachments if present
    if (data.attachments && data.attachments.length > 0) {
      const attachmentsDir = join(process.cwd(), '..', 'data', 'attachments');
      mkdirSync(attachmentsDir, { recursive: true });

      for (const file of data.attachments) {
        const buffer = await file.arrayBuffer();
        const content = Buffer.from(buffer);

        const fileName = `${Date.now()}-${file.name}`;
        const filePath = join(attachmentsDir, fileName);
        writeFileSync(filePath, content);

        // Insert attachment record
        const attachStmt = db.prepare(`
          INSERT INTO attachments (
            journal_entry_id, file_name, file_path, file_type, file_size, created_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);

        attachStmt.run(
          entryId,
          file.name,
          filePath,
          file.type,
          file.size
        );
      }
    }

    db.close();

    // Revalidate pages
    revalidatePath('/projects/[slug]', 'page');
    revalidatePath('/projects', 'page');

    return { success: true, entryId };
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return { success: false, error: 'Failed to create journal entry' };
  }
}

export async function createProject(data: {
  name: string;
  slug: string;
  description?: string;
  status?: string;
}): Promise<CreateProjectResult> {
  try {
    const db = new Database(DB_PATH);

    const stmt = db.prepare(`
      INSERT INTO projects (
        name, slug, description, status, created_at, updated_at, last_worked_on
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      data.name,
      data.slug,
      data.description || null,
      data.status || 'active'
    );

    db.close();

    // Revalidate projects page
    revalidatePath('/projects', 'page');

    return { success: true, projectId: Number(result.lastInsertRowid) };
  } catch (error) {
    console.error('Error creating project:', error);
    return { success: false, error: 'Failed to create project' };
  }
}
