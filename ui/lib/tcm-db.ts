import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { ensureAdminTables, getPublishedReadyVideos } from './tcm-admin/db';
import { containsTeachTrades } from './teachtrades-filter';
import { buildVisibleTCMSkillSql } from './tcm-skill-source-filter';

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
    WHERE ${buildVisibleTCMSkillSql()}
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
        AND ${buildVisibleTCMSkillSql('s')}
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
      WHERE (
        name LIKE ?
        OR description LIKE ?
        OR nlp_keywords LIKE ?
      )
        AND ${buildVisibleTCMSkillSql()}
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

export type ArchDocumentSectionType = 'explanation' | 'quote' | 'table' | 'metadata';

export interface ArchDocumentSection {
  doc: string;
  sectionTitle: string;
  sectionType: ArchDocumentSectionType;
  content: string;
}

export interface DocumentParagraphMatch {
  doc: string;
  paragraph: string;
  score: number;
  sectionTitle: string;
  sectionType: ArchDocumentSectionType;
}

const SUPPRESSED_SECTION_HEADINGS = new Set([
  'skills to extract',
  'relationship to existing tcm skills',
]);

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

      if (containsTeachTrades(filename, title, content)) {
        continue;
      }

      docs.push({ filename, title, content });
    } catch {
      // Skip files that can't be read
    }
  }

  return docs;
}

function cleanSectionContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/^-{3,}$/gm, ' ')
    .replace(/^\*\*Source:\*\*.*$/gm, ' ')
    .replace(/^\*\*Duration:\*\*.*$/gm, ' ')
    .replace(/^\*\*Extracted:\*\*.*$/gm, ' ')
    .replace(/^\*\*Type:\*\*.*$/gm, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function classifySection(sectionTitle: string, content: string): ArchDocumentSectionType {
  const loweredTitle = sectionTitle.trim().toLowerCase();
  const loweredContent = content.trim().toLowerCase();

  if (!loweredContent) {
    return 'metadata';
  }

  if (SUPPRESSED_SECTION_HEADINGS.has(loweredTitle)) {
    return 'metadata';
  }

  if (loweredTitle.includes('key quotes') || /^>\s/m.test(content)) {
    return 'quote';
  }

  if (/^\|.*\|$/m.test(content) || /^\|[-\s|:]+\|$/m.test(content)) {
    return 'table';
  }

  if (
    /^\*\*source:\*\*/m.test(loweredContent)
    || /^\*\*duration:\*\*/m.test(loweredContent)
    || /^\*\*extracted:\*\*/m.test(loweredContent)
    || /^\*\*type:\*\*/m.test(loweredContent)
  ) {
    return 'metadata';
  }

  return 'explanation';
}

function flushSection(
  sections: ArchDocumentSection[],
  docTitle: string,
  sectionTitle: string,
  lines: string[],
) {
  const rawContent = lines.join('\n').trim();
  if (!rawContent) {
    return;
  }

  const cleanedContent = cleanSectionContent(rawContent);
  if (!cleanedContent) {
    return;
  }

  sections.push({
    doc: docTitle,
    sectionTitle,
    sectionType: classifySection(sectionTitle, rawContent),
    content: cleanedContent
  });
}

export function getArchitectureDocumentSections(): ArchDocumentSection[] {
  const sections: ArchDocumentSection[] = [];

  for (const doc of getArchitectureDocuments()) {
    const lines = doc.content.split(/\r?\n/);
    let currentTitle = 'Overview';
    let currentLines: string[] = [];

    for (const line of lines) {
      if (/^#\s+/.test(line)) {
        continue;
      }

      const headingMatch = line.match(/^#{2,3}\s+(.*)$/);
      if (headingMatch) {
        flushSection(sections, doc.title, currentTitle, currentLines);
        currentTitle = headingMatch[1].trim();
        currentLines = [];
        continue;
      }

      currentLines.push(line);
    }

    flushSection(sections, doc.title, currentTitle, currentLines);
  }

  return sections;
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

// Stop words to filter from search queries
const STOP_WORDS = new Set([
  'explain', 'what', 'is', 'are', 'how', 'the', 'a', 'an', 'to', 'for', 'of', 'in',
  'on', 'with', 'about', 'can', 'you', 'me', 'tell', 'show', 'describe', 'help',
  'please', 'i', 'my', 'do', 'does', 'and', 'or', 'this', 'that', 'it', 'be'
]);

const TCM_QUERY_ALIASES: Record<string, string[]> = {
  css: ['csd', 'cisd', 'change in state', 'change in state of delivery'],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordRegex(keyword: string): RegExp {
  const escaped = escapeRegex(keyword);

  if (/^[a-z0-9]{2,4}$/i.test(keyword)) {
    return new RegExp(`\\b${escaped}\\b`, 'gi');
  }

  return new RegExp(escaped, 'gi');
}

function containsKeyword(text: string, keyword: string): boolean {
  return buildKeywordRegex(keyword).test(text);
}

function countKeywordMatches(text: string, keyword: string): number {
  return (text.match(buildKeywordRegex(keyword)) || []).length;
}

function expandSearchTerms(keywords: string[]): string[] {
  const expanded = new Set<string>();

  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    expanded.add(normalized);

    for (const alias of TCM_QUERY_ALIASES[normalized] || []) {
      expanded.add(alias);
    }
  }

  return Array.from(expanded);
}

// Extract meaningful keywords from a query
function extractKeywords(query: string): string[] {
  return expandSearchTerms(query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word)));
}

// Search within the cleaned document sections and return matching paragraphs.
export function searchDocumentParagraphs(
  query: string,
  limit: number = 5,
  includeTypes: ArchDocumentSectionType[] = ['explanation']
): DocumentParagraphMatch[] {
  const sections = getArchitectureDocumentSections().filter(section =>
    includeTypes.includes(section.sectionType)
  );
  const keywords = extractKeywords(query);
  const results: DocumentParagraphMatch[] = [];

  // If no meaningful keywords, try the full query as fallback
  if (keywords.length === 0) {
    keywords.push(...expandSearchTerms([query.toLowerCase()]));
  }

  for (const section of sections) {
    const paragraphs = section.content
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.replace(/^\s*[-*]\s+/gm, '').trim())
      .filter(paragraph => paragraph.length > 30 && !paragraph.includes('|'));

    for (const paragraph of paragraphs) {
      const lowerPara = paragraph.toLowerCase();
      const sectionTitleLower = section.sectionTitle.toLowerCase();

      // Score based on keyword matches
      let score = 0;
      for (const keyword of keywords) {
        const matches = countKeywordMatches(lowerPara, keyword);
        score += matches;

        if (containsKeyword(sectionTitleLower, keyword)) {
          score += 2;
        }
      }

      if (score > 0) {
        results.push({
          doc: section.doc,
          paragraph: paragraph.trim().substring(0, 500),
          score,
          sectionTitle: section.sectionTitle,
          sectionType: section.sectionType
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
  ensureAdminTables();

  return getPublishedReadyVideos()
    .filter((video) => Boolean(video.folder_id))
    .map((video) => {
      const folderId = video.folder_id!;
      const videoPath = join(LOCAL_VIDEOS_PATH, folderId);
      const manifestPath = join(videoPath, 'manifest.json');

      let title = video.title || folderId.replace(/_[a-f0-9]+$/, '').replace(/_/g, ' ');
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          title = manifest.source_title || title;
        } catch {
          // Keep DB title fallback
        }
      }

      if (containsTeachTrades(folderId, title, video.title ?? null, video.description ?? null)) {
        return null;
      }

      return {
        id: folderId,
        title,
        path: videoPath,
        hasFrames: existsSync(join(videoPath, 'frames'))
      };
    })
    .filter((video): video is VideoInfo => video !== null);
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
export function searchTranscripts(query: string, limit: number = 10): { videoId: string; videoTitle: string; segment: TranscriptSegment; score: number }[] {
  const videos = getLocalVideos();
  const keywords = extractKeywords(query);
  const results: { videoId: string; videoTitle: string; segment: TranscriptSegment; score: number }[] = [];

  // If no meaningful keywords, try the full query as fallback
  if (keywords.length === 0) {
    keywords.push(...expandSearchTerms([query.toLowerCase()]));
  }

  for (const video of videos) {
    const transcript = getVideoTranscript(video.id);
    if (!transcript) continue;

    for (const segment of transcript) {
      const lowerText = segment.text.toLowerCase();

      // Score based on keyword matches
      let score = 0;
      for (const keyword of keywords) {
        score += countKeywordMatches(lowerText, keyword);
      }

      if (score > 0) {
        results.push({
          videoId: video.id,
          videoTitle: video.title,
          segment,
          score
        });
      }
    }
  }

  // Sort by score and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
