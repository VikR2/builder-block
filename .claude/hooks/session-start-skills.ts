/**
 * SessionStart hook for Skills Library continuity
 *
 * Loads library stats and ledger context on session start/resume.
 * Injects context silently via system reminder.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

// Database path
const DB_PATH = join(PROJECT_ROOT, 'data/builder.db');

// Ledger path
const LEDGER_PATH = join(PROJECT_ROOT, 'thoughts/ledgers/CONTINUITY_CLAUDE-skills-library.md');

interface SessionStartInput {
  type: 'start' | 'resume' | 'compact';
  session_id?: string;
}

interface HookOutput {
  result: 'continue' | 'block';
  message?: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data); });
  });
}

function queryDatabase(sql: string): string {
  try {
    if (!existsSync(DB_PATH)) {
      return '';
    }
    const result = execSync(`sqlite3 "${DB_PATH}" "${sql}"`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    // Silently fail - db queries are optional
    return '';
  }
}

function getLibraryStats(): { skills: number; videos: number; lastSkill: string } {
  const skillsCount = parseInt(queryDatabase('SELECT COUNT(*) FROM skills;') || '0', 10);
  const videosCount = parseInt(queryDatabase('SELECT COUNT(*) FROM processed_videos;') || '0', 10);
  const lastSkill = queryDatabase(
    "SELECT name FROM skills ORDER BY created_at DESC LIMIT 1;"
  ) || '(none)';

  return {
    skills: skillsCount,
    videos: videosCount,
    lastSkill,
  };
}

function getLedgerState(): string | null {
  try {
    if (!existsSync(LEDGER_PATH)) {
      return null;
    }
    const content = readFileSync(LEDGER_PATH, 'utf8');

    // Extract State section
    const stateMatch = content.match(/## State\n([\s\S]*?)(?=\n---|\n## |$)/);
    if (stateMatch) {
      return stateMatch[1].trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const inputStr = await readStdin();

  let input: SessionStartInput;
  try {
    input = JSON.parse(inputStr);
  } catch {
    // Invalid input, continue without message
    const output: HookOutput = { result: 'continue' };
    console.log(JSON.stringify(output));
    return;
  }

  // Only inject context on resume or compact (not fresh start)
  if (input.type === 'start') {
    const output: HookOutput = { result: 'continue' };
    console.log(JSON.stringify(output));
    return;
  }

  // Get library stats
  const stats = getLibraryStats();
  const ledgerState = getLedgerState();

  // Build context message
  let contextParts: string[] = [];

  contextParts.push('**Skills Library Context (auto-loaded)**');
  contextParts.push(`- Skills in library: ${stats.skills}`);
  contextParts.push(`- Videos processed: ${stats.videos}`);
  if (stats.lastSkill !== '(none)') {
    contextParts.push(`- Last skill added: ${stats.lastSkill}`);
  }

  if (ledgerState) {
    contextParts.push('');
    contextParts.push('**Current State:**');
    contextParts.push(ledgerState);
  }

  contextParts.push('');
  contextParts.push('Ledger: `thoughts/ledgers/CONTINUITY_CLAUDE-skills-library.md`');

  const output: HookOutput = {
    result: 'continue',
    message: contextParts.join('\n'),
  };

  console.log(JSON.stringify(output));
}

main().catch((err) => {
  // On error, continue without blocking
  console.log(JSON.stringify({ result: 'continue' }));
  process.exit(0);
});
