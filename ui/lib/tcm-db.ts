import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';

// Database path (relative to project root)
const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');
const ARCHITECTURES_PATH = join(process.cwd(), '..', 'data', 'architectures');
const LOCAL_VIDEOS_PATH = join(process.cwd(), '..', 'data', 'local-videos');

// Get database connection
export function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  return db;
}

// TCM Skill type (subset of full Skill)
export interface TCMSkill {
  id: number;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  description: string;
  code_snippet: string | null;
  nlp_keywords: string | null;
}

// Search result from combined sources
export interface TCMSearchResult {
  type: 'skill' | 'document' | 'transcript';
  id: string;
  title: string;
  content: string;
  source: string;
  timestamp?: number; // For transcript segments
  videoId?: string;   // For transcript segments
}

// Get all TCM-related skills
export function getTCMSkills(): TCMSkill[] {
  const db = getDb();
  const skills = db.prepare(`
    SELECT id, name, slug, category, subcategory, description, code_snippet, nlp_keywords
    FROM skills
    WHERE category LIKE '%TCM%'
       OR name LIKE '%TCM%'
       OR description LIKE '%TCM%'
       OR description LIKE '%book building%'
       OR description LIKE '%submission%'
       OR description LIKE '%order fulfillment%'
    ORDER BY name
  `).all() as TCMSkill[];
  db.close();
  return skills;
}

// Search TCM skills using FTS5
export function searchTCMSkills(query: string, limit: number = 10): TCMSkill[] {
  const db = getDb();
  try {
    // First try FTS5 search
    const skills = db.prepare(`
      SELECT s.id, s.name, s.slug, s.category, s.subcategory, s.description, s.code_snippet, s.nlp_keywords
      FROM skills s
      JOIN skills_fts fts ON s.id = fts.rowid
      WHERE skills_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as TCMSkill[];
    db.close();
    return skills;
  } catch {
    // Fallback to LIKE search if FTS5 query fails
    const skills = db.prepare(`
      SELECT id, name, slug, category, subcategory, description, code_snippet, nlp_keywords
      FROM skills
      WHERE name LIKE ?
         OR description LIKE ?
         OR nlp_keywords LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as TCMSkill[];
    db.close();
    return skills;
  }
}

// Architecture document type
export interface ArchDocument {
  filename: string;
  title: string;
  content: string;
}

// Get all architecture documents
export function getArchitectureDocuments(): ArchDocument[] {
  const docs: ArchDocument[] = [];

  if (!existsSync(ARCHITECTURES_PATH)) {
    return docs;
  }

  const files = readdirSync(ARCHITECTURES_PATH).filter(f =>
    f.endsWith('.md') || f.endsWith('.txt')
  );

  for (const filename of files) {
    try {
      const content = readFileSync(join(ARCHITECTURES_PATH, filename), 'utf-8');
      // Extract title from first line or filename
      const firstLine = content.split('\n')[0];
      const title = firstLine.startsWith('#')
        ? firstLine.replace(/^#+\s*/, '')
        : filename.replace(/\.(md|txt)$/, '').replace(/-/g, ' ');

      docs.push({ filename, title, content });
    } catch {
      // Skip files that can't be read
    }
  }

  return docs;
}

// Search architecture documents
export function searchArchitectureDocuments(query: string): ArchDocument[] {
  const docs = getArchitectureDocuments();
  const lowerQuery = query.toLowerCase();

  return docs.filter(doc =>
    doc.title.toLowerCase().includes(lowerQuery) ||
    doc.content.toLowerCase().includes(lowerQuery)
  );
}

// Search within a document and return matching paragraphs
export function searchDocumentParagraphs(query: string, limit: number = 5): { doc: string; paragraph: string; score: number }[] {
  const docs = getArchitectureDocuments();
  const lowerQuery = query.toLowerCase();
  const results: { doc: string; paragraph: string; score: number }[] = [];

  for (const doc of docs) {
    // Split into paragraphs (double newline or section breaks)
    const paragraphs = doc.content.split(/\n\s*\n/).filter(p => p.trim().length > 20);

    for (const paragraph of paragraphs) {
      const lowerPara = paragraph.toLowerCase();
      if (lowerPara.includes(lowerQuery)) {
        // Simple scoring: count occurrences
        const matches = (lowerPara.match(new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        results.push({
          doc: doc.title,
          paragraph: paragraph.trim().substring(0, 500),
          score: matches
        });
      }
    }
  }

  // Sort by score and limit
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Transcript segment type
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// Video info type
export interface VideoInfo {
  id: string;
  title: string;
  path: string;
  hasFrames: boolean;
}

// Get all local video folders
export function getLocalVideos(): VideoInfo[] {
  const videos: VideoInfo[] = [];

  if (!existsSync(LOCAL_VIDEOS_PATH)) {
    return videos;
  }

  const folders = readdirSync(LOCAL_VIDEOS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const folder of folders) {
    const videoPath = join(LOCAL_VIDEOS_PATH, folder.name);
    const hasFrames = existsSync(join(videoPath, 'frames'));

    // Extract title from folder name (remove hash suffix)
    const title = folder.name.replace(/_[a-f0-9]+$/, '').replace(/_/g, ' ');

    videos.push({
      id: folder.name,
      title,
      path: videoPath,
      hasFrames
    });
  }

  return videos;
}

// Load transcript for a video
export function getVideoTranscript(videoId: string): TranscriptSegment[] | null {
  const transcriptPath = join(LOCAL_VIDEOS_PATH, videoId, 'transcript_timed.json');

  if (!existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    return JSON.parse(content) as TranscriptSegment[];
  } catch {
    return null;
  }
}

// Search transcripts across all videos
export function searchTranscripts(query: string, limit: number = 10): { videoId: string; videoTitle: string; segment: TranscriptSegment }[] {
  const videos = getLocalVideos();
  const lowerQuery = query.toLowerCase();
  const results: { videoId: string; videoTitle: string; segment: TranscriptSegment }[] = [];

  for (const video of videos) {
    const transcript = getVideoTranscript(video.id);
    if (!transcript) continue;

    for (const segment of transcript) {
      if (segment.text.toLowerCase().includes(lowerQuery)) {
        results.push({
          videoId: video.id,
          videoTitle: video.title,
          segment
        });

        if (results.length >= limit) {
          return results;
        }
      }
    }
  }

  return results;
}

// Format timestamp as HH:MM:SS
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Study guide type
export interface StudyGuide {
  id: number;
  title: string;
  slug: string;
  content: string;
  skill_ids: string | null;
  source_topic: string | null;
  created_at: string;
}

// Get all study guides
export function getAllStudyGuides(): StudyGuide[] {
  const db = getDb();
  const guides = db.prepare(`
    SELECT * FROM tcm_study_guides
    ORDER BY created_at DESC
  `).all() as StudyGuide[];
  db.close();
  return guides;
}

// Get study guide by slug
export function getStudyGuideBySlug(slug: string): StudyGuide | null {
  const db = getDb();
  const guide = db.prepare(`
    SELECT * FROM tcm_study_guides
    WHERE slug = ?
  `).get(slug) as StudyGuide | undefined;
  db.close();
  return guide || null;
}

// Search study guides
export function searchStudyGuides(query: string, limit: number = 10): StudyGuide[] {
  const db = getDb();
  try {
    const guides = db.prepare(`
      SELECT g.*
      FROM tcm_study_guides g
      JOIN tcm_study_guides_fts fts ON g.id = fts.rowid
      WHERE tcm_study_guides_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as StudyGuide[];
    db.close();
    return guides;
  } catch {
    // Fallback to LIKE search
    const guides = db.prepare(`
      SELECT * FROM tcm_study_guides
      WHERE title LIKE ? OR content LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as StudyGuide[];
    db.close();
    return guides;
  }
}

// Create a new study guide (requires writable db)
export function createStudyGuide(
  title: string,
  slug: string,
  content: string,
  skillIds?: number[],
  sourceTopic?: string
): number {
  const DB_PATH_WRITE = join(process.cwd(), '..', 'data', 'builder.db');
  const db = new Database(DB_PATH_WRITE);

  const result = db.prepare(`
    INSERT INTO tcm_study_guides (title, slug, content, skill_ids, source_topic)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    slug,
    content,
    skillIds ? JSON.stringify(skillIds) : null,
    sourceTopic || null
  );

  db.close();
  return result.lastInsertRowid as number;
}

// Delete a study guide
export function deleteStudyGuide(id: number): boolean {
  const DB_PATH_WRITE = join(process.cwd(), '..', 'data', 'builder.db');
  const db = new Database(DB_PATH_WRITE);

  const result = db.prepare(`
    DELETE FROM tcm_study_guides WHERE id = ?
  `).run(id);

  db.close();
  return result.changes > 0;
}

// Combined search across all TCM sources
export function searchTCM(query: string): TCMSearchResult[] {
  const results: TCMSearchResult[] = [];

  // Search skills
  const skills = searchTCMSkills(query, 5);
  for (const skill of skills) {
    results.push({
      type: 'skill',
      id: `skill-${skill.id}`,
      title: skill.name,
      content: skill.description,
      source: `Skill #${skill.id} - ${skill.category}`
    });
  }

  // Search documents
  const docs = searchDocumentParagraphs(query, 3);
  for (const doc of docs) {
    results.push({
      type: 'document',
      id: `doc-${doc.doc}`,
      title: doc.doc,
      content: doc.paragraph,
      source: 'Architecture Document'
    });
  }

  // Search transcripts
  const transcripts = searchTranscripts(query, 3);
  for (const t of transcripts) {
    results.push({
      type: 'transcript',
      id: `transcript-${t.videoId}-${t.segment.start}`,
      title: t.videoTitle,
      content: t.segment.text,
      source: `Video @ ${formatTimestamp(t.segment.start)}`,
      timestamp: t.segment.start,
      videoId: t.videoId
    });
  }

  return results;
}
