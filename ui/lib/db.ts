import Database from 'better-sqlite3';
import { join } from 'path';
import { buildVisibleTCMSkillSql } from './tcm-skill-source-filter';

// Database path (relative to project root)
const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');

// Get database connection
export function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  return db;
}

// Types from database schema
export interface Skill {
  id: number;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  description: string;
  code_snippet: string | null;
  variables_required: string | null;
  dependencies: string | null;
  complexity: string;
  trading_style: string | null;
  timeframe: string | null;
  nlp_keywords: string | null;
  usage_examples: string | null;
  common_combinations: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  trading_account: string | null;
  created_at: string;
  updated_at: string;
  last_worked_on: string | null;
}

export interface Script {
  id: number;
  project_id: number;
  name: string;
  version: number;
  description: string | null;
  file_path: string;
  file_hash: string | null;
  generation_prompt: string | null;
  ai_conversation_id: string | null;
  skills_used: string | null;
  compilation_status: string | null;
  compilation_errors: string | null;
  backtest_results: string | null;
  deployment_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: number;
  project_id: number | null;
  script_id: number | null;
  title: string;
  entry_type: string;
  content: string;
  has_attachments: number;
  attachment_count: number;
  trade_date: string | null;
  symbols: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: number;
  journal_entry_id: number;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

const SKILL_SELECT_COLUMN_NAMES = [
  'id',
  'name',
  'slug',
  'category',
  'subcategory',
  'description',
  'code_snippet',
  'variables_required',
  'dependencies',
  'complexity',
  'trading_style',
  'timeframe',
  'nlp_keywords',
  'usage_examples',
  'common_combinations',
  'usage_count',
  'created_at',
  'updated_at',
];

function buildSkillSelectColumns(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return SKILL_SELECT_COLUMN_NAMES.map((column) => `${prefix}${column}`).join(', ');
}

const SKILL_SELECT_COLUMNS = buildSkillSelectColumns();

const VISIBLE_SKILL_SQL = buildVisibleTCMSkillSql();

// Skill queries
export function getAllSkills(): Skill[] {
  const db = getDb();
  const skills = db.prepare(`
    SELECT ${SKILL_SELECT_COLUMNS}
    FROM skills
    WHERE ${VISIBLE_SKILL_SQL}
    ORDER BY category, name
  `).all() as Skill[];
  db.close();
  return skills;
}

export function getSkillBySlug(slug: string): Skill | undefined {
  const db = getDb();
  const skill = db.prepare(`
    SELECT ${SKILL_SELECT_COLUMNS}
    FROM skills
    WHERE slug = ?
      AND ${VISIBLE_SKILL_SQL}
  `).get(slug) as Skill | undefined;
  db.close();
  return skill;
}

export function getSkillsByCategory(category: string): Skill[] {
  const db = getDb();
  const skills = db.prepare(`
    SELECT ${SKILL_SELECT_COLUMNS}
    FROM skills
    WHERE category = ?
      AND ${VISIBLE_SKILL_SQL}
    ORDER BY name
  `).all(category) as Skill[];
  db.close();
  return skills;
}

export function searchSkills(query: string, limit: number = 20): Skill[] {
  const db = getDb();
  const skills = db.prepare(`
    SELECT ${buildSkillSelectColumns('s')}
    FROM skills s
    JOIN skills_fts fts ON s.id = fts.rowid
    WHERE skills_fts MATCH ?
      AND ${buildVisibleTCMSkillSql('s')}
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Skill[];
  db.close();
  return skills;
}

export function getSkillCategories(): { category: string; count: number }[] {
  const db = getDb();
  const categories = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM skills
    WHERE ${VISIBLE_SKILL_SQL}
    GROUP BY category
    ORDER BY category
  `).all() as { category: string; count: number }[];
  db.close();
  return categories;
}

// Project queries
export function getAllProjects(): Project[] {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY last_worked_on DESC, created_at DESC').all() as Project[];
  db.close();
  return projects;
}

export function getProjectBySlug(slug: string): Project | undefined {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Project | undefined;
  db.close();
  return project;
}

export interface ProjectWithDetails extends Project {
  scriptCount: number;
  journalCount: number;
  skillsUsedCount: number;
}

export function getProjectWithDetails(slug: string): ProjectWithDetails | undefined {
  const db = getDb();

  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Project | undefined;

  if (!project) {
    db.close();
    return undefined;
  }

  const scriptCount = db.prepare('SELECT COUNT(*) as count FROM scripts WHERE project_id = ?').get(project.id) as { count: number };
  const journalCount = db.prepare('SELECT COUNT(*) as count FROM journal_entries WHERE project_id = ?').get(project.id) as { count: number };

  // Get unique skills used across all scripts in this project
  const skillsUsed = db.prepare(`
    SELECT COUNT(DISTINCT skill_id) as count
    FROM script_skills ss
    JOIN scripts s ON ss.script_id = s.id
    WHERE s.project_id = ?
  `).get(project.id) as { count: number };

  db.close();

  return {
    ...project,
    scriptCount: scriptCount.count,
    journalCount: journalCount.count,
    skillsUsedCount: skillsUsed.count,
  };
}

export function getAllProjectsWithDetails(): ProjectWithDetails[] {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY last_worked_on DESC, created_at DESC').all() as Project[];

  const projectsWithDetails = projects.map(project => {
    const scriptCount = db.prepare('SELECT COUNT(*) as count FROM scripts WHERE project_id = ?').get(project.id) as { count: number };
    const journalCount = db.prepare('SELECT COUNT(*) as count FROM journal_entries WHERE project_id = ?').get(project.id) as { count: number };
    const skillsUsed = db.prepare(`
      SELECT COUNT(DISTINCT skill_id) as count
      FROM script_skills ss
      JOIN scripts s ON ss.script_id = s.id
      WHERE s.project_id = ?
    `).get(project.id) as { count: number };

    return {
      ...project,
      scriptCount: scriptCount.count,
      journalCount: journalCount.count,
      skillsUsedCount: skillsUsed.count,
    };
  });

  db.close();
  return projectsWithDetails;
}

// Script queries
export function getScriptsByProject(projectId: number): Script[] {
  const db = getDb();
  const scripts = db.prepare('SELECT * FROM scripts WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Script[];
  db.close();
  return scripts;
}

export function getScriptsByProjectSlug(projectSlug: string): Script[] {
  const db = getDb();
  const scripts = db.prepare(`
    SELECT s.*
    FROM scripts s
    JOIN projects p ON s.project_id = p.id
    WHERE p.slug = ?
    ORDER BY s.created_at DESC
  `).all(projectSlug) as Script[];
  db.close();
  return scripts;
}

export function getScriptById(id: number): Script | undefined {
  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Script | undefined;
  db.close();
  return script;
}

export function getSkillsByScript(scriptId: number): Skill[] {
  const db = getDb();
  const skills = db.prepare(`
    SELECT ${SKILL_SELECT_COLUMNS}
    FROM skills s
    JOIN script_skills ss ON s.id = ss.skill_id
    WHERE ss.script_id = ?
      AND ${buildVisibleTCMSkillSql('s')}
    ORDER BY s.category, s.name
  `).all(scriptId) as Skill[];
  db.close();
  return skills;
}

// Journal queries
export interface JournalEntryWithProject extends JournalEntry {
  project_name?: string;
  project_slug?: string;
}

export function getAllJournalEntries(): JournalEntry[] {
  const db = getDb();
  const entries = db.prepare('SELECT * FROM journal_entries ORDER BY created_at DESC').all() as JournalEntry[];
  db.close();
  return entries;
}

export function getAllJournalEntriesWithProject(): JournalEntryWithProject[] {
  const db = getDb();
  const entries = db.prepare(`
    SELECT
      j.*,
      p.name as project_name,
      p.slug as project_slug
    FROM journal_entries j
    LEFT JOIN projects p ON j.project_id = p.id
    ORDER BY j.created_at DESC
  `).all() as JournalEntryWithProject[];
  db.close();
  return entries;
}

export function getJournalEntriesByProject(projectId: number): JournalEntry[] {
  const db = getDb();
  const entries = db.prepare('SELECT * FROM journal_entries WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as JournalEntry[];
  db.close();
  return entries;
}

export function getJournalEntryById(id: number): JournalEntry | undefined {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id) as JournalEntry | undefined;
  db.close();
  return entry;
}

export function getAttachmentsByEntry(entryId: number): Attachment[] {
  const db = getDb();
  const attachments = db.prepare('SELECT * FROM attachments WHERE journal_entry_id = ?').all(entryId) as Attachment[];
  db.close();
  return attachments;
}

// Stats for dashboard
export function getStats() {
  const db = getDb();

  const skillCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM skills
    WHERE ${VISIBLE_SKILL_SQL}
  `).get() as { count: number };
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  const scriptCount = db.prepare('SELECT COUNT(*) as count FROM scripts').get() as { count: number };
  const journalCount = db.prepare('SELECT COUNT(*) as count FROM journal_entries').get() as { count: number };

  db.close();

  return {
    skills: skillCount.count,
    projects: projectCount.count,
    scripts: scriptCount.count,
    journalEntries: journalCount.count,
  };
}
