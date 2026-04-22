import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { buildVisibleTCMSkillSql } from './tcm-skill-source-filter';
import { readVideoLesson } from './tcm-lessons';
import { resolveVideoDirectory } from './tcm-video-artifacts';

const DB_PATH = path.join(process.cwd(), '..', 'data', 'builder.db');
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_LINKED_SKILLS = 4;
const AUTO_SYNC_METHOD = 'automatic_sync';

const STOP_WORDS = new Set([
  'a', 'about', 'after', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'how', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'what', 'when', 'where', 'with', 'you', 'your'
]);

interface SyncableVideo {
  id?: number;
  file_path: string;
  folder_id?: string | null;
  title?: string | null;
  filename?: string | null;
}

interface SkillCandidate {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  nlp_keywords: string | null;
}

export interface VideoLinkedSkill {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  confidence: number | null;
  sourceTitle: string | null;
}

interface SkillMatch extends VideoLinkedSkill {
  score: number;
}

export interface VideoSkillSyncResult {
  linkedSkillIds: number[];
  insertedCount: number;
  existingCount: number;
  removedCount: number;
}

function getReadonlyDb() {
  return new Database(DB_PATH, { readonly: true });
}

function getWritableDb() {
  return new Database(DB_PATH);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bfour[\s-]+hour\b/g, '4h')
    .replace(/\b4[\s-]+hour\b/g, '4h')
    .replace(/(\d{1,2})[:.](\d{2})\s*(am|pm)\b/g, '$1$2$3')
    .replace(/(\d{1,2})\s*(am|pm)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );
}

function toFileSourceUrl(filePath: string): string {
  return `file://${path.resolve(filePath).replace(/\\/g, '/')}`;
}

function readTranscriptSample(videoDir: string): string {
  const transcriptPath = path.join(videoDir, 'transcript.txt');
  if (fs.existsSync(transcriptPath)) {
    return fs.readFileSync(transcriptPath, 'utf-8').slice(0, MAX_TRANSCRIPT_CHARS);
  }

  const timedTranscriptPath = path.join(videoDir, 'transcript_timed.json');
  if (!fs.existsSync(timedTranscriptPath)) {
    return '';
  }

  try {
    const segments = JSON.parse(fs.readFileSync(timedTranscriptPath, 'utf-8')) as Array<{ text?: string }>;
    return segments
      .map((segment) => segment.text || '')
      .join(' ')
      .slice(0, MAX_TRANSCRIPT_CHARS);
  } catch {
    return '';
  }
}

function buildVideoCorpus(video: SyncableVideo): { text: string; tokens: Set<string> } {
  const videoDir = resolveVideoDirectory(video);
  const parts: string[] = [video.title || '', video.filename || ''];

  if (videoDir) {
    const lesson = readVideoLesson(videoDir);
    if (lesson) {
      parts.push(
        lesson.videoTitle,
        lesson.summary,
        ...lesson.keyTakeaways,
        ...lesson.suggestedQuestions,
        ...lesson.recommendedMoments.map((moment) => `${moment.title} ${moment.reason}`),
        ...lesson.sections.map((section) => `${section.title} ${section.summary} ${section.transcriptExcerpt}`)
      );

      if (lesson.tutorPack) {
        parts.push(
          lesson.tutorPack.mentorApproach,
          ...lesson.tutorPack.prerequisites,
          ...lesson.tutorPack.teachingSequence,
          ...lesson.tutorPack.coreConcepts.map((concept) => `${concept.title} ${concept.summary} ${concept.timestampLabel || ''}`),
          ...lesson.tutorPack.commonMisconceptions,
          ...lesson.tutorPack.chartReadingRules,
          ...lesson.tutorPack.ifYouSeeThisThenThat.map((rule) => `${rule.ifYouSee} ${rule.thenExpect} ${rule.because}`),
          ...lesson.tutorPack.diagnosticQuestions,
          ...lesson.tutorPack.practicePrompts,
          ...lesson.tutorPack.glossary.map((item) => `${item.term} ${item.definition}`),
        );
      }
    }

    parts.push(readTranscriptSample(videoDir));
  }

  const text = normalizeText(parts.filter(Boolean).join(' '));
  return { text, tokens: tokenize(text) };
}

function intersectCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function getTimeTokens(tokens: Set<string>): string[] {
  return Array.from(tokens).filter((token) => /^\d+(?:\d{2})?(?:am|pm)$/.test(token));
}

function buildNameTokenFrequency(skills: SkillCandidate[]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const skill of skills) {
    for (const token of tokenize(skill.name)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }

  return frequency;
}

function getTokenWeight(token: string, frequency: Map<string, number>): number {
  const count = frequency.get(token) || 1;
  return 1 / count;
}

function scoreSkill(
  skill: SkillCandidate,
  corpus: { text: string; tokens: Set<string> },
  frequency: Map<string, number>
): number {
  const nameText = normalizeText(skill.name);
  const nameTokens = tokenize(skill.name);
  const keywordTokens = tokenize(skill.nlp_keywords || '');

  const exactNameMatch = nameText.length > 0 && corpus.text.includes(nameText);
  const keywordOverlap = intersectCount(keywordTokens, corpus.tokens);
  const timeTokens = getTimeTokens(nameTokens);
  const missingTimeToken = timeTokens.length > 0 && !timeTokens.some((token) => corpus.tokens.has(token));
  const totalNameSignal = Array.from(nameTokens).reduce(
    (sum, token) => sum + getTokenWeight(token, frequency),
    0
  );
  const matchedNameSignal = Array.from(nameTokens).reduce(
    (sum, token) => sum + (corpus.tokens.has(token) ? getTokenWeight(token, frequency) : 0),
    0
  );
  const weightedCoverage = totalNameSignal > 0 ? matchedNameSignal / totalNameSignal : 0;
  const strongSignalMatched = Array.from(nameTokens).some(
    (token) => corpus.tokens.has(token) && getTokenWeight(token, frequency) >= 0.5
  );

  let score = 0;
  if (exactNameMatch) {
    score += 10;
  }

  score += weightedCoverage * 8;
  score += keywordOverlap * 1.25;

  if (strongSignalMatched) {
    score += 2;
  }

  if (missingTimeToken) {
    score -= 4;
  }

  return score;
}

function isSkillMatch(
  skill: SkillCandidate,
  corpus: { text: string; tokens: Set<string> },
  frequency: Map<string, number>
): boolean {
  const nameTokens = tokenize(skill.name);
  const totalNameSignal = Array.from(nameTokens).reduce(
    (sum, token) => sum + getTokenWeight(token, frequency),
    0
  );
  const matchedNameSignal = Array.from(nameTokens).reduce(
    (sum, token) => sum + (corpus.tokens.has(token) ? getTokenWeight(token, frequency) : 0),
    0
  );
  const weightedCoverage = totalNameSignal > 0 ? matchedNameSignal / totalNameSignal : 0;
  const strongSignalMatched = Array.from(nameTokens).some(
    (token) => corpus.tokens.has(token) && getTokenWeight(token, frequency) >= 0.5
  );
  const exactNameMatch = normalizeText(skill.name).length > 0 && corpus.text.includes(normalizeText(skill.name));
  const score = scoreSkill(skill, corpus, frequency);

  if (exactNameMatch) {
    return score >= 8;
  }

  return strongSignalMatched && weightedCoverage >= 0.55 && score >= 6;
}

function getVisibleSkillsForSync(db: Database.Database): SkillCandidate[] {
  return db.prepare(`
    SELECT s.id, s.name, s.slug, s.category, s.description, s.nlp_keywords
    FROM skills s
    WHERE ${buildVisibleTCMSkillSql('s')}
    ORDER BY s.name
  `).all() as SkillCandidate[];
}

function getRankedMatches(video: SyncableVideo, db: Database.Database): SkillMatch[] {
  const corpus = buildVideoCorpus(video);
  if (!corpus.text) {
    return [];
  }

  const skills = getVisibleSkillsForSync(db);
  const frequency = buildNameTokenFrequency(skills);

  return skills
    .filter((skill) => isSkillMatch(skill, corpus, frequency))
    .map((skill) => {
      const score = scoreSkill(skill, corpus, frequency);
      return {
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        category: skill.category,
        description: skill.description,
        confidence: Math.min(0.99, Number((score / 12).toFixed(2))),
        sourceTitle: video.title || video.filename || null,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, MAX_LINKED_SKILLS);
}

export function getVideoLinkedSkillsByFolderId(folderId: string, limit: number = MAX_LINKED_SKILLS): VideoLinkedSkill[] {
  const db = getReadonlyDb();

  try {
    const video = db.prepare(`
      SELECT file_path, folder_id, title, filename
      FROM processed_local_videos
      WHERE folder_id = ?
        AND processing_status = 'ready'
        AND COALESCE(is_published, 0) = 1
      LIMIT 1
    `).get(folderId) as SyncableVideo | undefined;

    if (!video) {
      return [];
    }

    const sourceUrl = toFileSourceUrl(video.file_path);

    return db.prepare(`
      SELECT
        s.id,
        s.name,
        s.slug,
        s.category,
        s.description,
        ss.extraction_confidence AS confidence,
        ss.source_title AS sourceTitle
      FROM skill_sources ss
      JOIN skills s ON s.id = ss.skill_id
      WHERE ss.source_type = 'local_video'
        AND ss.source_url = ?
        AND ${buildVisibleTCMSkillSql('s')}
      ORDER BY COALESCE(ss.extraction_confidence, 0) DESC, s.name ASC
      LIMIT ?
    `).all(sourceUrl, limit) as VideoLinkedSkill[];
  } finally {
    db.close();
  }
}

export function skillMatchesQuery(skill: Pick<VideoLinkedSkill, 'name' | 'category' | 'description'>, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return false;
  }

  const haystack = normalizeText(`${skill.name} ${skill.category} ${skill.description}`);
  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return false;
  }

  return intersectCount(queryTokens, tokenize(haystack)) > 0;
}

export function syncVideoSkillLinks(video: SyncableVideo): VideoSkillSyncResult {
  const db = getWritableDb();

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_sources_unique_skill_source
      ON skill_sources(skill_id, source_type, source_url)
    `);

    const matches = getRankedMatches(video, db);
    const sourceUrl = toFileSourceUrl(video.file_path);
    const sourceTitle = video.title || video.filename || path.basename(video.file_path);

    let insertedCount = 0;
    let existingCount = 0;
    let removedCount = 0;

    const transaction = db.transaction(() => {
      const existingAutoLinks = db.prepare(`
        SELECT id, skill_id
        FROM skill_sources
        WHERE source_type = 'local_video'
          AND source_url = ?
          AND extraction_method = ?
      `).all(sourceUrl, AUTO_SYNC_METHOD) as Array<{ id: number; skill_id: number }>;

      const desiredSkillIds = new Set(matches.map((match) => match.id));

      for (const row of existingAutoLinks) {
        if (!desiredSkillIds.has(row.skill_id)) {
          db.prepare('DELETE FROM skill_sources WHERE id = ?').run(row.id);
          removedCount += 1;
        }
      }

      for (const match of matches) {
        const existing = db.prepare(`
          SELECT id, extraction_method
          FROM skill_sources
          WHERE skill_id = ?
            AND source_type = 'local_video'
            AND source_url = ?
          LIMIT 1
        `).get(match.id, sourceUrl) as { id: number; extraction_method: string | null } | undefined;

        if (existing) {
          existingCount += 1;

          if (existing.extraction_method === AUTO_SYNC_METHOD) {
            db.prepare(`
              UPDATE skill_sources
              SET source_title = ?,
                  extraction_confidence = ?,
                  notes = ?
              WHERE id = ?
            `).run(
              sourceTitle,
              match.confidence,
              `Auto-linked from lesson-ready upload${video.folder_id ? ` (${video.folder_id})` : ''}`,
              existing.id
            );
          }

          continue;
        }

        db.prepare(`
          INSERT INTO skill_sources (
            skill_id,
            source_type,
            source_url,
            source_title,
            extraction_confidence,
            extraction_method,
            notes
          )
          VALUES (?, 'local_video', ?, ?, ?, ?, ?)
        `).run(
          match.id,
          sourceUrl,
          sourceTitle,
          match.confidence,
          AUTO_SYNC_METHOD,
          `Auto-linked from lesson-ready upload${video.folder_id ? ` (${video.folder_id})` : ''}`
        );

        insertedCount += 1;
      }
    });

    transaction();

    return {
      linkedSkillIds: matches.map((match) => match.id),
      insertedCount,
      existingCount,
      removedCount,
    };
  } finally {
    db.close();
  }
}
