#!/usr/bin/env node

/**
 * NinjaTrader Skills MCP Server
 *
 * Provides tools for searching and saving NinjaTrader trading skills.
 * Auto-loads relevant skills into Claude Code conversation context.
 *
 * Features:
 * - Hybrid search: FTS5 keyword search + sqlite-vec vector similarity
 * - Reciprocal Rank Fusion (RRF) for combining search results
 * - Local embeddings via nomic-embed-text-v1.5
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readFileSync, existsSync } from "fs";
import {
  embed,
  embedQuery,
  embedBatch,
  createSkillText,
  embeddingToBuffer,
  EMBEDDING_DIM,
} from "./embeddings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path (relative to compiled dist/index.js)
// __dirname = .../nt-skills/dist, need to go up 4 levels to project root
const DB_PATH = join(__dirname, "../../../../data/builder.db");

// Helper function to create slug from name
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Helper function to validate visual_context_path
// Returns { valid: boolean, error?: string }
function validateVisualContextPath(
  path: string | null | undefined,
  sourceVideoUrl: string | null | undefined
): { valid: boolean; error?: string } {
  if (!path) return { valid: true }; // Optional field

  // Build absolute path from project root
  const projectRoot = resolve(__dirname, "../../../../");
  const absolutePath = resolve(projectRoot, path);

  // Check path exists
  if (!existsSync(absolutePath)) {
    return { valid: false, error: `Path does not exist: ${path}` };
  }

  // Check frame_index.json exists
  const frameIndexPath = join(absolutePath, "frame_index.json");
  if (!existsSync(frameIndexPath)) {
    return { valid: false, error: `No frame_index.json in: ${path}` };
  }

  // Extract video ID from path
  const pathVideoId = path.split("/").pop();

  // If source_video_url provided, validate match
  if (sourceVideoUrl) {
    // Extract video ID from YouTube URL
    const urlMatch = sourceVideoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (urlMatch) {
      const urlVideoId = urlMatch[1];
      if (pathVideoId !== urlVideoId) {
        return {
          valid: false,
          error: `Path video ID (${pathVideoId}) does not match source URL video ID (${urlVideoId})`,
        };
      }
    }
  }

  return { valid: true };
}

// Helper function for Levenshtein distance (for fuzzy name matching)
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower.charAt(i - 1) === aLower.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bLower.length][aLower.length];
}

// Helper function for name similarity (0-1 scale)
function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// Helper function to extract YouTube video ID from URL
function extractVideoId(url: string): string | null {
  // Handle youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Handle youtube.com/watch?v=VIDEO_ID
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (longMatch) return longMatch[1];

  // Handle youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

// Helper function for Jaccard similarity (keyword overlap)
function jaccardSimilarity(setA: string[], setB: string[]): number {
  const a = new Set(setA.map((s) => s.toLowerCase()));
  const b = new Set(setB.map((s) => s.toLowerCase()));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  a.forEach((item) => {
    if (b.has(item)) intersection++;
  });

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Helper functions for POI type defaults (from poi-type-contracts.md)
function getDefaultC1C2Rule(poiType: string): string {
  switch (poiType) {
    case "fvg":
      return "within_zone"; // C1/C2 must print WITHIN FVG zone
    case "ob":
      return "outside_invalidates"; // C1/C2 outside OB signals invalidation
    case "swing":
      return "flexible"; // More flexibility for swing points
    default:
      return "within_zone";
  }
}

function getDefaultThreshold(poiType: string): number {
  switch (poiType) {
    case "fvg":
      return 6; // 6 consecutive closes for FVG invalidation
    case "ob":
      return 30; // 30 closes for structural POI (OB)
    case "swing":
      return 6; // Less strict for swing
    default:
      return 6;
  }
}

function getDefaultCountingMode(poiType: string): string {
  switch (poiType) {
    case "fvg":
      return "cumulative"; // FVG: cumulative counting (no reset on non-touch)
    case "ob":
      return "location_based"; // OB: location-based (outside vs inside)
    case "swing":
      return "cumulative"; // Swing: context-dependent, default cumulative
    default:
      return "cumulative";
  }
}

// Interface for skill object
interface Skill {
  id: number;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  description: string;
  code_snippet: string;
  variables_required: string;
  dependencies: string;
  complexity: string;
  nlp_keywords: string;
  common_combinations?: string;
  embedding?: Buffer;
}

// Check if vector search is available
let vectorSearchEnabled = false;

/**
 * Initialize database with sqlite-vec extension.
 * Creates vec_skills table if it doesn't exist.
 */
function initVectorSearch(db: Database.Database): boolean {
  try {
    sqliteVec.load(db);

    // Check if vec_skills table exists, create if not
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_skills'"
      )
      .get();

    if (!tableExists) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_skills USING vec0(
          skill_id INTEGER PRIMARY KEY,
          embedding float[${EMBEDDING_DIM}]
        )
      `);
      console.error("Created vec_skills virtual table");
    }

    // Verify sqlite-vec is working
    const version = db.prepare("SELECT vec_version()").get() as {
      "vec_version()": string;
    };
    console.error(`sqlite-vec loaded: v${version["vec_version()"]}`);

    return true;
  } catch (err) {
    console.error("Failed to load sqlite-vec:", err);
    return false;
  }
}

/**
 * Perform hybrid search using FTS5 and vector similarity.
 * Combines results using Reciprocal Rank Fusion (RRF).
 */
async function hybridSearch(
  db: Database.Database,
  query: string,
  limit: number = 10
): Promise<Skill[]> {
  // Generate query embedding
  const queryEmbedding = await embedQuery(query);

  // FTS5 keyword search
  const ftsResults = db
    .prepare(
      `
      SELECT s.id, row_number() OVER (ORDER BY rank) as rn
      FROM skills s
      JOIN skills_fts fts ON s.id = fts.rowid
      WHERE skills_fts MATCH ?
      LIMIT ?
    `
    )
    .all(query, limit * 2) as { id: number; rn: number }[];

  // Vector similarity search
  let vecResults: { skill_id: number; distance: number }[] = [];
  if (vectorSearchEnabled) {
    try {
      vecResults = db
        .prepare(
          `
          SELECT skill_id, distance
          FROM vec_skills
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT ?
        `
        )
        .all(queryEmbedding.buffer, limit * 2) as {
        skill_id: number;
        distance: number;
      }[];
    } catch (err) {
      console.error("Vector search failed, falling back to FTS only:", err);
    }
  }

  // Combine with RRF (k=60)
  const k = 60;
  const scores = new Map<number, { score: number; sources: string[] }>();

  // Add FTS scores
  ftsResults.forEach(({ id, rn }) => {
    const existing = scores.get(id) || { score: 0, sources: [] };
    existing.score += 1 / (k + rn);
    existing.sources.push("fts");
    scores.set(id, existing);
  });

  // Add vector scores
  vecResults.forEach(({ skill_id, distance }, idx) => {
    const existing = scores.get(skill_id) || { score: 0, sources: [] };
    existing.score += 1 / (k + idx + 1);
    existing.sources.push("vec");
    scores.set(skill_id, existing);
  });

  // Sort by combined score
  const sortedIds = Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id]) => id);

  if (sortedIds.length === 0) {
    return [];
  }

  // Fetch full skill records
  const placeholders = sortedIds.map(() => "?").join(",");
  const skills = db
    .prepare(
      `SELECT * FROM skills WHERE id IN (${placeholders})`
    )
    .all(...sortedIds) as Skill[];

  // Maintain RRF order
  const skillMap = new Map(skills.map((s) => [s.id, s]));
  return sortedIds.map((id) => skillMap.get(id)!).filter(Boolean);
}

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "get_relevant_skills",
    description:
      "Search the NinjaTrader skills library for relevant trading patterns and concepts. Use this when the user mentions trading concepts like sweeps, breakouts, risk management, etc.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query or keywords (e.g., 'sweep', 'risk management', 'breakout')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "save_skill",
    description:
      "Save a new trading skill pattern to the knowledge base. Use this when extracting reusable patterns from scripts.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (e.g., 'VWAP Reversal Pattern')",
        },
        category: {
          type: "string",
          description:
            "Category (e.g., 'Entry Patterns', 'Risk Management', 'Market Analysis')",
        },
        subcategory: {
          type: "string",
          description:
            "Optional subcategory (e.g., 'Reversal', 'Continuation')",
        },
        description: {
          type: "string",
          description: "Clear description of what this skill does",
        },
        code_snippet: {
          type: "string",
          description: "C# code snippet showing the implementation",
        },
        variables: {
          type: "array",
          items: { type: "string" },
          description: "List of required variables",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description:
            "Keywords for searching (e.g., ['vwap', 'reversal', 'momentum'])",
        },
        complexity: {
          type: "string",
          enum: ["simple", "medium", "complex"],
          description: "Complexity level",
          default: "medium",
        },
        dependencies: {
          type: "array",
          items: { type: "string" },
          description: "Optional: slugs of skills this depends on",
        },
      },
      required: ["name", "category", "description", "code_snippet", "keywords"],
    },
  },
  {
    name: "list_skills_by_category",
    description:
      "List all skills organized by category. Useful for browsing the skills library.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Optional: filter by category (e.g., 'Entry Patterns', 'Risk Management')",
        },
      },
    },
  },
  {
    name: "check_skill_exists",
    description:
      "Check if a trading concept already exists in the skills library. Returns match score and suggested action (skip/update/ask_user/create_new).",
    inputSchema: {
      type: "object",
      properties: {
        concept_name: {
          type: "string",
          description: "Name of the concept to check for",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords associated with the concept",
        },
      },
      required: ["concept_name"],
    },
  },
  {
    name: "get_skill_with_dependencies",
    description:
      "Fetch a skill with all its dependencies recursively resolved. Returns dependency tree in execution order.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: {
          type: "number",
          description: "ID of the skill to fetch",
        },
        skill_slug: {
          type: "string",
          description: "Slug of the skill to fetch (alternative to skill_id)",
        },
      },
    },
  },
  {
    name: "suggest_complementary_skills",
    description:
      "Given a set of skills, suggest complementary skills that commonly work together with them.",
    inputSchema: {
      type: "object",
      properties: {
        skill_ids: {
          type: "array",
          items: { type: "number" },
          description: "IDs of skills to find complements for",
        },
        context: {
          type: "string",
          enum: ["entry", "exit", "risk", "complete_strategy"],
          description: "Trading context to filter suggestions",
        },
      },
      required: ["skill_ids"],
    },
  },
  {
    name: "save_skill_with_source",
    description:
      "Save a new trading skill with source tracking. Use this when extracting skills from videos, scripts, or manual entry.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (e.g., 'VWAP Reversal Pattern')",
        },
        category: {
          type: "string",
          description:
            "Category (e.g., 'Entry Patterns', 'Risk Management', 'Market Analysis')",
        },
        subcategory: {
          type: "string",
          description:
            "Optional subcategory (e.g., 'Reversal', 'Continuation')",
        },
        description: {
          type: "string",
          description: "Clear description of what this skill does",
        },
        code_snippet: {
          type: "string",
          description: "C# code snippet showing the implementation",
        },
        variables: {
          type: "array",
          items: { type: "string" },
          description: "List of required variables",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description:
            "Keywords for searching (e.g., ['vwap', 'reversal', 'momentum'])",
        },
        complexity: {
          type: "string",
          enum: ["simple", "medium", "complex"],
          description: "Complexity level",
          default: "medium",
        },
        dependencies: {
          type: "array",
          items: { type: "string" },
          description: "Optional: slugs of skills this depends on",
        },
        source_type: {
          type: "string",
          enum: ["youtube", "manual", "script"],
          description: "Type of source where skill was extracted from",
        },
        source_url: {
          type: "string",
          description: "URL of the source (e.g., YouTube video URL)",
        },
        source_title: {
          type: "string",
          description: "Title of the source content",
        },
        extraction_confidence: {
          type: "number",
          description:
            "Confidence score (0-1) of the extraction quality",
        },
      },
      required: [
        "name",
        "category",
        "description",
        "keywords",
        "source_type",
      ],
    },
  },
  {
    name: "save_model",
    description:
      "Create or update a complete trading model with full metadata. Use this when extracting complete trading models from videos or creating strategy specifications.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Model name (e.g., 'LumiTraders Liquidity Sweep V5')",
        },
        description: {
          type: "string",
          description: "Description of what this model does and when to use it",
        },
        skill_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of skill IDs that make up this model",
        },
        skill_contexts: {
          type: "object",
          description:
            "Per-skill context within this model: {skill_id: {phase, order, conditions, notes}}",
        },
        trade_flow_rules: {
          type: "object",
          description:
            "Trade flow specification: {pre_market, entry: {trigger, confirmations, filters}, exit: {targets, stops}}",
        },
        context_annotations: {
          type: "object",
          description:
            "Context annotations: {htf_timeframes, session_restrictions, edge_cases}",
        },
        state_machine_spec: {
          type: "object",
          description:
            "State machine specification for code generation: {initial_state, states: [...]}",
        },
        source_video_url: {
          type: "string",
          description: "YouTube URL if extracted from video",
        },
        source_video_title: {
          type: "string",
          description: "Title of source video",
        },
        extraction_confidence: {
          type: "number",
          description: "Confidence score (0-1) of the extraction quality",
        },
        variant_of: {
          type: "number",
          description: "Parent model ID if this is a variant",
        },
        typical_use_case: {
          type: "string",
          description: "When to use this model",
        },
        complexity: {
          type: "string",
          enum: ["simple", "medium", "complex"],
          description: "Model complexity level",
          default: "medium",
        },
        visual_context_path: {
          type: "string",
          description: "Path to video frames directory (e.g., 'data/video-frames/9AL41xON3hA'). Must match source video ID.",
        },
      },
      required: ["name", "description", "skill_ids"],
    },
  },
  {
    name: "get_model",
    description:
      "Fetch a complete trading model with all metadata, optionally including skills (with code), iterations and variants. Use include_skills=true for code generation. Returns visual_interpretations and poi_type_rules for frame-driven code generation.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description: "ID of the model to fetch",
        },
        model_name: {
          type: "string",
          description: "Name of the model to fetch (alternative to model_id)",
        },
        include_skills: {
          type: "boolean",
          description: "Include full skill objects with code_snippet for code generation",
          default: false,
        },
        include_iterations: {
          type: "boolean",
          description: "Include iteration history from model_iterations table",
          default: false,
        },
        include_variants: {
          type: "boolean",
          description: "Include variant models derived from this model",
          default: false,
        },
      },
    },
  },
  {
    name: "update_model_after_iteration",
    description:
      "Record iteration insights after analyzing backtest results. Creates a model_iterations record and updates the model's iteration_log.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description: "ID of the model being iterated on",
        },
        iteration_insight: {
          type: "object",
          description:
            "Insight captured: {problem_pattern, solution_applied, conditions, generalizable, suggested_rule}",
        },
        problems_detected: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              severity: { type: "string" },
              impact: { type: "number" },
              trades_affected: { type: "number" },
            },
          },
          description: "Problems detected in backtest analysis",
        },
        solution_applied: {
          type: "string",
          description: "Description of the fix applied",
        },
        impact_prediction: {
          type: "number",
          description: "Expected dollar improvement from this change",
        },
        backtest_csv_path: {
          type: "string",
          description: "Path to the analyzed backtest CSV file",
        },
        trades_analyzed: {
          type: "number",
          description: "Number of trades analyzed",
        },
        skills_added: {
          type: "array",
          items: { type: "number" },
          description: "Skill IDs added in this iteration",
        },
        skills_removed: {
          type: "array",
          items: { type: "number" },
          description: "Skill IDs removed in this iteration",
        },
        parameters_changed: {
          type: "object",
          description: "Parameters changed: {param: {before, after}}",
        },
        trade_flow_changes: {
          type: "string",
          description: "Description of trade flow changes",
        },
        insight_confidence: {
          type: "number",
          description: "Confidence in the insight (0-1)",
        },
      },
      required: ["model_id", "solution_applied"],
    },
  },
  {
    name: "search_models",
    description:
      "Search for trading models by criteria including text query, status, source, and problem patterns.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text search query for model name/description",
        },
        filter_by_status: {
          type: "string",
          enum: ["draft", "backtested", "validated", "production"],
          description: "Filter by model status",
        },
        filter_by_source: {
          type: "string",
          enum: ["youtube", "iteration", "manual"],
          description: "Filter by how the model was created",
        },
        has_iteration_for_problem: {
          type: "string",
          description:
            "Find models that have iterations addressing a specific problem pattern (e.g., 'mfe_reversal')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "suggest_model_variants",
    description:
      "Recommend model variants or parameter changes based on backtest patterns and historical learnings.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description: "ID of the model to suggest variants for",
        },
        problem_pattern: {
          type: "string",
          enum: [
            "mfe_reversal",
            "early_exit",
            "late_entry",
            "false_breakout",
            "range_fade",
            "session_leak",
            "stop_hunt",
            "overtrading",
          ],
          description: "The problem pattern detected in backtest",
        },
        backtest_summary: {
          type: "object",
          description:
            "Summary of backtest results: {win_rate, profit_factor, avg_mfe, avg_mae, total_trades}",
        },
      },
      required: ["model_id", "problem_pattern"],
    },
  },
  {
    name: "get_visual_context",
    description:
      "Get visual frames from a video for contradiction detection during strategy iteration. Returns frames filtered by type (entry/exit/context) for visual analysis.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "YouTube video ID (e.g., '9AL41xON3hA')",
        },
        context_type: {
          type: "string",
          enum: ["entry", "exit", "risk", "context", "all"],
          description:
            "Type of frames to retrieve: entry (entry setups), exit (take profit), risk (stop loss), context (market structure), or all",
          default: "all",
        },
        contradiction_only: {
          type: "boolean",
          description:
            "If true, only return frames marked as relevant for contradiction detection",
          default: false,
        },
      },
      required: ["video_id"],
    },
  },
  {
    name: "resolve_video_id",
    description:
      "Extract YouTube video_id from a URL or SAD file. Use this before get_visual_context when you only have a source_url. Supports youtu.be/X, youtube.com/watch?v=X, and youtube.com/embed/X formats.",
    inputSchema: {
      type: "object",
      properties: {
        source_url: {
          type: "string",
          description: "YouTube URL (e.g., 'https://youtu.be/9AL41xON3hA' or 'https://youtube.com/watch?v=9AL41xON3hA')",
        },
        sad_path: {
          type: "string",
          description: "Path to SAD file - will parse ## Source section to find URL",
        },
      },
    },
  },
  {
    name: "save_visual_interpretation",
    description:
      "Save a verified visual interpretation for a pattern in a model. Use this after analyzing frames and getting user confirmation. Stores interpretation for reuse in future code generation.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description: "ID of the model to add interpretation to",
        },
        pattern_name: {
          type: "string",
          description: "Pattern name (e.g., 'cisd_pattern', 'fvg_c1c2', 'ob_detection', 'entry_logic')",
        },
        frame_ref: {
          type: "string",
          description: "Frame reference path (e.g., '9AL41xON3hA/frame_008.jpg')",
        },
        interpretation: {
          type: "string",
          description: "Description of what was observed in the frame",
        },
        code_implication: {
          type: "string",
          description: "Specific code logic derived from the interpretation (e.g., 'OB = index [1], not [0]')",
        },
        verified_by_user: {
          type: "boolean",
          description: "Whether user confirmed this interpretation",
          default: true,
        },
        user_feedback: {
          type: "string",
          description: "Optional feedback or corrections from user",
        },
      },
      required: ["model_id", "pattern_name", "interpretation"],
    },
  },
  {
    name: "set_model_poi_type",
    description:
      "Set POI-type-specific rules for a model. Different POI types (FVG, OB, Swing) have different C1/C2 and invalidation rules. This stores the rules for code generation.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "number",
          description: "ID of the model to update",
        },
        primary_poi_type: {
          type: "string",
          enum: ["fvg", "ob", "swing"],
          description: "Primary POI type for this model",
        },
        c1c2_location_rule: {
          type: "string",
          description: "C1/C2 location requirement (e.g., 'within_zone', 'outside_invalidates', 'flexible')",
        },
        invalidation_direction: {
          type: "string",
          description: "Invalidation direction rule (e.g., 'bullish_below_bearish_above')",
        },
        invalidation_threshold: {
          type: "number",
          description: "Number of consecutive closes required for invalidation",
        },
        confirmation_counting: {
          type: "string",
          enum: ["cumulative", "consecutive", "location_based"],
          description: "How to count C1/C2 confirmations",
        },
        additional_rules: {
          type: "object",
          description: "Any additional POI-type-specific rules",
        },
      },
      required: ["model_id", "primary_poi_type"],
    },
  },
  {
    name: "suggest_pattern_mappings",
    description:
      "Given visual annotation labels from a video frame, suggest which skills they map to. Use this to auto-populate pattern_mappings in frame_index.json. Returns skill IDs and code insights for each detected pattern.",
    inputSchema: {
      type: "object",
      properties: {
        annotation_labels: {
          type: "array",
          items: { type: "string" },
          description: "Visual labels from the frame (e.g., ['C1', 'C2', 'FVG', 'OB', 'sweep', 'X'])",
        },
        zones_shown: {
          type: "array",
          items: { type: "string" },
          description: "Zone types visible in the frame (e.g., ['PDH', 'PDL', 'FVG zone', 'OB zone'])",
        },
        video_id: {
          type: "string",
          description: "Video ID for context (optional, used for frame references)",
        },
        frame_name: {
          type: "string",
          description: "Frame filename for references (optional)",
        },
      },
      required: ["annotation_labels"],
    },
  },
  {
    name: "get_poi_type_rules",
    description:
      "Get POI-type-specific rules for C1/C2 confirmation, entry, and invalidation. Use this when generating code to get the correct validation logic for each POI type.",
    inputSchema: {
      type: "object",
      properties: {
        poi_type: {
          type: "string",
          enum: ["FVG", "OB", "Swing", "all"],
          description: "POI type to get rules for, or 'all' for all types",
        },
        rule_type: {
          type: "string",
          enum: ["c1_confirmation", "c2_confirmation", "invalidation", "entry", "all"],
          description: "Rule type to get, or 'all' for all rule types",
        },
      },
      required: ["poi_type"],
    },
  },
];

// Create server
const server = new Server(
  {
    name: "nt-skills",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: "Error: No arguments provided",
        },
      ],
      isError: true,
    };
  }

  try {
    const writableTools = ["save_skill", "save_skill_with_source", "save_model", "update_model_after_iteration", "save_visual_interpretation", "set_model_poi_type"];
    const db = new Database(DB_PATH, { readonly: !writableTools.includes(name) });

    switch (name) {
      case "get_relevant_skills": {
        const query = args.query as string;
        const limit = (args.limit as number) || 10;

        // Initialize vector search for this connection
        vectorSearchEnabled = initVectorSearch(db);

        // Use hybrid search (FTS5 + vector similarity with RRF)
        let skills: Skill[];
        try {
          skills = await hybridSearch(db, query, limit);
        } catch (err) {
          // Fallback to FTS-only if hybrid fails
          console.error("Hybrid search failed, using FTS fallback:", err);
          skills = db
            .prepare(
              `
              SELECT s.*
              FROM skills s
              JOIN skills_fts fts ON s.id = fts.rowid
              WHERE skills_fts MATCH ?
              ORDER BY rank
              LIMIT ?
            `
            )
            .all(query, limit) as Skill[];
        }

        if (skills.length === 0) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `No skills found matching "${query}". Try broader keywords like "sweep", "breakout", "risk", or "management".`,
              },
            ],
          };
        }

        // Format results
        const formattedSkills = skills.map((skill: Skill) => ({
          id: skill.id,
          name: skill.name,
          category: skill.category,
          subcategory: skill.subcategory,
          description: skill.description,
          complexity: skill.complexity,
          code_snippet: skill.code_snippet,
          variables: JSON.parse(skill.variables_required || "[]"),
          dependencies: JSON.parse(skill.dependencies || "[]"),
          keywords: JSON.parse(skill.nlp_keywords || "[]"),
          has_embedding: !!skill.embedding,
        }));

        db.close();

        return {
          content: [
            {
              type: "text",
              text: `Found ${skills.length} relevant skill(s) using ${vectorSearchEnabled ? "hybrid" : "FTS"} search:\n\n${formattedSkills
                .map(
                  (s, i) =>
                    `${i + 1}. **${s.name}** [#${s.id}] (${s.category}${s.subcategory ? ` -> ${s.subcategory}` : ""})\n   ${s.description}\n   Complexity: ${s.complexity}\n   Variables: ${s.variables.join(", ")}\n\n   \`\`\`csharp\n   ${(s.code_snippet || "").substring(0, 300)}${(s.code_snippet || "").length > 300 ? "..." : ""}\n   \`\`\``
                )
                .join("\n\n")}`,
            },
          ],
        };
      }

      case "save_skill": {
        const skillName = args.name as string;
        const category = args.category as string;
        const subcategory = (args.subcategory as string) || null;
        const description = args.description as string;
        const code_snippet = args.code_snippet as string;
        const variables = args.variables as string[];
        const keywords = args.keywords as string[];
        const complexity = (args.complexity as string) || "medium";
        const dependencies = (args.dependencies as string[]) || [];

        const slug = slugify(skillName);

        // Generate embedding for the skill
        const textToEmbed = createSkillText(skillName, description, keywords);
        let embeddingBuffer: Buffer | null = null;
        let vectorInserted = false;

        try {
          const embeddingArray = await embed(textToEmbed);
          embeddingBuffer = embeddingToBuffer(embeddingArray);
        } catch (err) {
          console.error("Failed to generate embedding:", err);
          // Continue without embedding
        }

        // Initialize vector search
        vectorSearchEnabled = initVectorSearch(db);

        // Insert skill with embedding
        const result = db
          .prepare(
            `
            INSERT INTO skills (
              name, slug, category, subcategory, description,
              code_snippet, variables_required, dependencies,
              complexity, nlp_keywords, embedding
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            skillName,
            slug,
            category,
            subcategory,
            description,
            code_snippet,
            JSON.stringify(variables),
            JSON.stringify(dependencies),
            complexity,
            JSON.stringify(keywords),
            embeddingBuffer
          );

        const skillId = result.lastInsertRowid as number;

        // Also insert into vector table if we have an embedding
        if (embeddingBuffer && vectorSearchEnabled) {
          try {
            db.prepare(
              "INSERT INTO vec_skills (skill_id, embedding) VALUES (?, ?)"
            ).run(skillId, embeddingBuffer);
            vectorInserted = true;
          } catch (err) {
            console.error("Failed to insert into vec_skills:", err);
          }
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: `Skill "${skillName}" saved successfully!\n\nID: ${skillId}\nSlug: ${slug}\nCategory: ${category}\nComplexity: ${complexity}\nEmbedding: ${embeddingBuffer ? "generated" : "skipped"}\nVector index: ${vectorInserted ? "indexed" : "not indexed"}\n\nYou can now search for this skill using keywords: ${keywords.join(", ")}`,
            },
          ],
        };
      }

      case "list_skills_by_category": {
        const categoryFilter = (args.category as string) || null;

        let skills;
        if (categoryFilter) {
          skills = db
            .prepare(
              `
            SELECT name, category, subcategory, description, complexity
            FROM skills
            WHERE category = ?
            ORDER BY name
          `
            )
            .all(categoryFilter);
        } else {
          skills = db
            .prepare(
              `
            SELECT name, category, subcategory, description, complexity
            FROM skills
            ORDER BY category, name
          `
            )
            .all();
        }

        db.close();

        if (skills.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: categoryFilter
                  ? `No skills found in category "${categoryFilter}"`
                  : "No skills in database",
              },
            ],
          };
        }

        // Group by category
        const byCategory: Record<string, any[]> = {};
        skills.forEach((skill: any) => {
          if (!byCategory[skill.category]) {
            byCategory[skill.category] = [];
          }
          byCategory[skill.category].push(skill);
        });

        const formatted = Object.entries(byCategory)
          .map(
            ([cat, skillsList]) =>
              `## ${cat}\n\n${skillsList
                .map(
                  (s) =>
                    `- **${s.name}**${s.subcategory ? ` (${s.subcategory})` : ""} - ${s.description.substring(0, 100)}... [${s.complexity}]`
                )
                .join("\n")}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# NinjaTrader Skills Library\n\nTotal: ${skills.length} skills\n\n${formatted}`,
            },
          ],
        };
      }

      case "check_skill_exists": {
        const conceptName = args.concept_name as string;
        const keywords = (args.keywords as string[]) || [];

        // Build FTS5 search query from concept name and keywords
        const searchTerms = [
          conceptName,
          ...keywords,
        ]
          .join(" ")
          .replace(/[^\w\s]/g, " ");

        // Search using FTS5
        let ftsResults = db
          .prepare(
            `
            SELECT s.*, rank
            FROM skills s
            JOIN skills_fts fts ON s.id = fts.rowid
            WHERE skills_fts MATCH ?
            ORDER BY rank
            LIMIT 10
          `
          )
          .all(searchTerms) as (Skill & { rank: number })[];

        // If FTS5 fails, try LIKE-based fallback to catch partial name matches
        if (ftsResults.length === 0) {
          // Search for skills containing the concept name in their name or description
          const likePattern = `%${conceptName}%`;
          let fallbackResults = db
            .prepare(
              `
              SELECT *, 0 as rank
              FROM skills
              WHERE name LIKE ? OR description LIKE ?
              LIMIT 10
            `
            )
            .all(likePattern, likePattern) as (Skill & { rank: number })[];

          // If still no results, try matching individual words
          if (fallbackResults.length === 0) {
            const words = conceptName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            for (const word of words) {
              const wordPattern = `%${word}%`;
              const wordResults = db
                .prepare(
                  `
                  SELECT *, 0 as rank
                  FROM skills
                  WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?
                  LIMIT 10
                `
                )
                .all(wordPattern, wordPattern) as (Skill & { rank: number })[];

              if (wordResults.length > 0) {
                fallbackResults = wordResults;
                break;
              }
            }
          }

          if (fallbackResults.length > 0) {
            ftsResults = fallbackResults;
          }
        }

        // Still no results, return create_new
        if (ftsResults.length === 0) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    exists: false,
                    match_score: 0,
                    existing_skill: null,
                    suggested_action: "create_new",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Score each result
        const scoredResults = ftsResults.map((skill) => {
          const existingKeywords: string[] = JSON.parse(
            skill.nlp_keywords || "[]"
          );

          // Name similarity (Levenshtein-based) - primary factor
          const nameScore = nameSimilarity(conceptName, skill.name);

          // Also check if concept name appears in skill name (exact substring match)
          const nameContains = skill.name.toLowerCase().includes(conceptName.toLowerCase()) ? 0.3 : 0;

          // Keyword overlap (Jaccard)
          const keywordScore =
            keywords.length > 0
              ? jaccardSimilarity(keywords, existingKeywords)
              : 0.3; // Lower neutral if no keywords provided

          // FTS5 rank score (normalized)
          const ftsScore = 1 / (1 + Math.abs(skill.rank));

          // Weighted average - prioritize name similarity heavily
          // Add bonus if concept name is contained in skill name
          const weightedScore =
            (nameScore * 0.5) + nameContains + (keywordScore * 0.25) + (ftsScore * 0.25);

          return {
            skill,
            nameScore,
            keywordScore,
            ftsScore,
            weightedScore,
          };
        });

        // Sort by weighted score and get best match
        scoredResults.sort((a, b) => b.weightedScore - a.weightedScore);
        const bestMatch = scoredResults[0];

        // Determine suggested action
        let suggestedAction: string;
        if (bestMatch.weightedScore > 0.85) {
          suggestedAction = "skip";
        } else if (bestMatch.weightedScore >= 0.7) {
          suggestedAction = "update";
        } else if (bestMatch.weightedScore >= 0.4) {
          suggestedAction = "ask_user";
        } else {
          suggestedAction = "create_new";
        }

        db.close();

        const existingSkill = {
          id: bestMatch.skill.id,
          name: bestMatch.skill.name,
          slug: bestMatch.skill.slug,
          category: bestMatch.skill.category,
          subcategory: bestMatch.skill.subcategory,
          description: bestMatch.skill.description,
          keywords: JSON.parse(bestMatch.skill.nlp_keywords || "[]"),
          complexity: bestMatch.skill.complexity,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  exists: bestMatch.weightedScore >= 0.4,
                  match_score: Math.round(bestMatch.weightedScore * 100) / 100,
                  existing_skill: existingSkill,
                  suggested_action: suggestedAction,
                  score_breakdown: {
                    name_similarity: Math.round(bestMatch.nameScore * 100) / 100,
                    keyword_overlap: Math.round(bestMatch.keywordScore * 100) / 100,
                    fts_relevance: Math.round(bestMatch.ftsScore * 100) / 100,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_skill_with_dependencies": {
        const skillId = args.skill_id as number | undefined;
        const skillSlug = args.skill_slug as string | undefined;

        if (!skillId && !skillSlug) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Either skill_id or skill_slug must be provided",
              },
            ],
            isError: true,
          };
        }

        // Helper to get skill by ID or slug
        const getSkill = (id?: number, slug?: string): Skill | null => {
          if (id) {
            return db
              .prepare("SELECT * FROM skills WHERE id = ?")
              .get(id) as Skill | null;
          } else if (slug) {
            return db
              .prepare("SELECT * FROM skills WHERE slug = ?")
              .get(slug) as Skill | null;
          }
          return null;
        };

        // Get the main skill
        const mainSkill = getSkill(skillId, skillSlug);
        if (!mainSkill) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Skill not found with ${skillId ? `id=${skillId}` : `slug=${skillSlug}`}`,
              },
            ],
            isError: true,
          };
        }

        // Recursively resolve dependencies
        const visited = new Set<string>();
        const dependencyList: { skill: Skill; depth: number }[] = [];
        const dependencyOrder: Skill[] = [];

        const resolveDependencies = (skill: Skill, depth: number) => {
          const deps: string[] = JSON.parse(skill.dependencies || "[]");

          for (const depSlug of deps) {
            if (visited.has(depSlug)) continue;
            visited.add(depSlug);

            const depSkill = getSkill(undefined, depSlug);
            if (depSkill) {
              // Resolve nested dependencies first (depth-first)
              resolveDependencies(depSkill, depth + 1);
              dependencyList.push({ skill: depSkill, depth });
              dependencyOrder.push(depSkill);
            }
          }
        };

        // Start resolving from main skill
        visited.add(mainSkill.slug);
        resolveDependencies(mainSkill, 1);

        // Add main skill at the end (execution order: dependencies first)
        dependencyOrder.push(mainSkill);

        db.close();

        // Format output
        const formatSkill = (skill: Skill) => ({
          id: skill.id,
          name: skill.name,
          slug: skill.slug,
          category: skill.category,
          subcategory: skill.subcategory,
          description: skill.description,
          code_snippet: skill.code_snippet,
          complexity: skill.complexity,
          keywords: JSON.parse(skill.nlp_keywords || "[]"),
          variables: JSON.parse(skill.variables_required || "[]"),
          dependencies: JSON.parse(skill.dependencies || "[]"),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  skill: formatSkill(mainSkill),
                  dependencies: dependencyList.map((d) => ({
                    skill: formatSkill(d.skill),
                    depth: d.depth,
                  })),
                  dependency_order: dependencyOrder.map(formatSkill),
                  total_skills: dependencyOrder.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "suggest_complementary_skills": {
        const skillIds = args.skill_ids as number[];
        const context = args.context as string | undefined;

        if (!skillIds || skillIds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Error: skill_ids array is required and must not be empty",
              },
            ],
            isError: true,
          };
        }

        // Get provided skills
        const providedSkills = db
          .prepare(
            `SELECT * FROM skills WHERE id IN (${skillIds.map(() => "?").join(",")})`
          )
          .all(...skillIds) as Skill[];

        if (providedSkills.length === 0) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: "Error: No skills found with the provided IDs",
              },
            ],
            isError: true,
          };
        }

        // Aggregate suggestions with scores
        const suggestionScores: Map<
          number,
          { score: number; reasons: string[] }
        > = new Map();

        // 1. Get from common_combinations field
        for (const skill of providedSkills) {
          const combinations: string[] = JSON.parse(
            skill.common_combinations || "[]"
          );
          for (const combo of combinations) {
            // Find skill by slug
            const comboSkill = db
              .prepare("SELECT id FROM skills WHERE slug = ?")
              .get(combo) as { id: number } | undefined;

            if (comboSkill && !skillIds.includes(comboSkill.id)) {
              const existing = suggestionScores.get(comboSkill.id) || {
                score: 0,
                reasons: [],
              };
              existing.score += 0.4;
              existing.reasons.push(`Listed in ${skill.name}'s combinations`);
              suggestionScores.set(comboSkill.id, existing);
            }
          }
        }

        // 2. Query skill_combinations table
        const providedSlugs = providedSkills.map((s) => s.slug);
        try {
          const combinations = db
            .prepare(
              `
              SELECT skill_slug_1, skill_slug_2, frequency
              FROM skill_combinations
              WHERE skill_slug_1 IN (${providedSlugs.map(() => "?").join(",")})
                 OR skill_slug_2 IN (${providedSlugs.map(() => "?").join(",")})
            `
            )
            .all(...providedSlugs, ...providedSlugs) as {
            skill_slug_1: string;
            skill_slug_2: string;
            frequency: number;
          }[];

          for (const combo of combinations) {
            const otherSlug = providedSlugs.includes(combo.skill_slug_1)
              ? combo.skill_slug_2
              : combo.skill_slug_1;

            const otherSkill = db
              .prepare("SELECT id FROM skills WHERE slug = ?")
              .get(otherSlug) as { id: number } | undefined;

            if (otherSkill && !skillIds.includes(otherSkill.id)) {
              const existing = suggestionScores.get(otherSkill.id) || {
                score: 0,
                reasons: [],
              };
              existing.score += 0.3 * Math.min(combo.frequency / 10, 1);
              existing.reasons.push(
                `Found in ${combo.frequency} combination pattern(s)`
              );
              suggestionScores.set(otherSkill.id, existing);
            }
          }
        } catch {
          // Table might not exist yet - continue
        }

        // 3. Query script_skills for co-occurrence
        try {
          const coOccurrences = db
            .prepare(
              `
              SELECT ss2.skill_id, COUNT(*) as count
              FROM script_skills ss1
              JOIN script_skills ss2 ON ss1.script_id = ss2.script_id
              WHERE ss1.skill_id IN (${skillIds.map(() => "?").join(",")})
                AND ss2.skill_id NOT IN (${skillIds.map(() => "?").join(",")})
              GROUP BY ss2.skill_id
              ORDER BY count DESC
              LIMIT 20
            `
            )
            .all(...skillIds, ...skillIds) as {
            skill_id: number;
            count: number;
          }[];

          for (const co of coOccurrences) {
            const existing = suggestionScores.get(co.skill_id) || {
              score: 0,
              reasons: [],
            };
            existing.score += 0.3 * Math.min(co.count / 5, 1);
            existing.reasons.push(`Commonly used together in ${co.count} script(s)`);
            suggestionScores.set(co.skill_id, existing);
          }
        } catch {
          // Table might not exist yet - continue
        }

        // Convert to array, get skill details, and sort by score
        const suggestionIds = Array.from(suggestionScores.entries());
        if (suggestionIds.length === 0) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ suggestions: [] }, null, 2),
              },
            ],
          };
        }

        // Get skill details and filter by context if specified
        let suggestions = [];
        for (const [id, data] of suggestionIds) {
          const skill = db
            .prepare("SELECT * FROM skills WHERE id = ?")
            .get(id) as Skill | null;

          if (!skill) continue;

          // Filter by context if specified
          if (context) {
            const category = skill.category.toLowerCase();
            const matchesContext =
              (context === "entry" &&
                (category.includes("entry") || category.includes("signal"))) ||
              (context === "exit" &&
                (category.includes("exit") || category.includes("target"))) ||
              (context === "risk" &&
                (category.includes("risk") ||
                  category.includes("management"))) ||
              context === "complete_strategy";

            if (!matchesContext) continue;
          }

          suggestions.push({
            skill: {
              id: skill.id,
              name: skill.name,
              slug: skill.slug,
              category: skill.category,
              subcategory: skill.subcategory,
              description: skill.description,
              complexity: skill.complexity,
            },
            confidence: Math.round(Math.min(data.score, 1) * 100) / 100,
            reason: data.reasons.join("; "),
          });
        }

        // Sort by confidence and take top 5
        suggestions.sort((a, b) => b.confidence - a.confidence);
        suggestions = suggestions.slice(0, 5);

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ suggestions }, null, 2),
            },
          ],
        };
      }

      case "save_skill_with_source": {
        const skillName = args.name as string;
        const category = args.category as string;
        const subcategory = (args.subcategory as string) || null;
        const description = args.description as string;
        const code_snippet = (args.code_snippet as string) || "";
        const variables = (args.variables as string[]) || [];
        const keywords = args.keywords as string[];
        const complexity = (args.complexity as string) || "medium";
        const dependencies = (args.dependencies as string[]) || [];

        // Source tracking fields
        const sourceType = args.source_type as string;
        const sourceUrl = (args.source_url as string) || null;
        const sourceTitle = (args.source_title as string) || null;
        const extractionConfidence =
          (args.extraction_confidence as number) || null;

        const slug = slugify(skillName);

        // Generate embedding for the skill
        const textToEmbed = createSkillText(skillName, description, keywords);
        let embeddingBuffer: Buffer | null = null;
        let vectorInserted = false;

        try {
          const embeddingArray = await embed(textToEmbed);
          embeddingBuffer = embeddingToBuffer(embeddingArray);
        } catch (err) {
          console.error("Failed to generate embedding:", err);
          // Continue without embedding
        }

        // Initialize vector search
        vectorSearchEnabled = initVectorSearch(db);

        // Use transaction to ensure atomicity
        const insertSkill = db.prepare(`
          INSERT INTO skills (
            name, slug, category, subcategory, description,
            code_snippet, variables_required, dependencies,
            complexity, nlp_keywords, embedding
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertSource = db.prepare(`
          INSERT INTO skill_sources (
            skill_id, source_type, source_url, source_title,
            extraction_confidence, extracted_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);

        const insertVec = db.prepare(
          "INSERT INTO vec_skills (skill_id, embedding) VALUES (?, ?)"
        );

        let skillId: number;
        let sourceId: number;

        try {
          const transaction = db.transaction(() => {
            // Insert skill with embedding
            const skillResult = insertSkill.run(
              skillName,
              slug,
              category,
              subcategory,
              description,
              code_snippet,
              JSON.stringify(variables),
              JSON.stringify(dependencies),
              complexity,
              JSON.stringify(keywords),
              embeddingBuffer
            );

            skillId = skillResult.lastInsertRowid as number;

            // Insert source tracking
            const sourceResult = insertSource.run(
              skillId,
              sourceType,
              sourceUrl,
              sourceTitle,
              extractionConfidence
            );

            sourceId = sourceResult.lastInsertRowid as number;

            // Insert into vector table if we have an embedding
            if (embeddingBuffer && vectorSearchEnabled) {
              try {
                insertVec.run(skillId, embeddingBuffer);
                vectorInserted = true;
              } catch (err) {
                console.error("Failed to insert into vec_skills:", err);
              }
            }
          });

          transaction();
        } catch (err) {
          db.close();
          throw err;
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  skill_id: skillId!,
                  source_id: sourceId!,
                  slug,
                  message: `Skill "${skillName}" saved with source tracking`,
                  details: {
                    category,
                    complexity,
                    source_type: sourceType,
                    source_url: sourceUrl,
                    keywords,
                    embedding_generated: !!embeddingBuffer,
                    vector_indexed: vectorInserted,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "save_model": {
        const modelName = args.name as string;
        const description = args.description as string;
        const skillIds = args.skill_ids as number[];
        const skillContexts = args.skill_contexts as Record<string, unknown> | undefined;
        const tradeFlowRules = args.trade_flow_rules as Record<string, unknown> | undefined;
        const contextAnnotations = args.context_annotations as Record<string, unknown> | undefined;
        const stateMachineSpec = args.state_machine_spec as Record<string, unknown> | undefined;
        const sourceVideoUrl = (args.source_video_url as string) || null;
        const sourceVideoTitle = (args.source_video_title as string) || null;
        const extractionConfidence = (args.extraction_confidence as number) || null;
        const variantOf = (args.variant_of as number) || null;
        const typicalUseCase = (args.typical_use_case as string) || null;
        const complexity = (args.complexity as string) || "medium";
        const visualContextPath = (args.visual_context_path as string) || null;

        // Validate visual_context_path if provided
        const pathValidation = validateVisualContextPath(visualContextPath, sourceVideoUrl);
        if (!pathValidation.valid) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: pathValidation.error,
                  hint: "visual_context_path must be a valid path like 'data/video-frames/VIDEO_ID' with frame_index.json present",
                }),
              },
            ],
            isError: true,
          };
        }

        // Determine created_from based on source
        const createdFrom = sourceVideoUrl ? "youtube" : (variantOf ? "iteration" : "manual");

        const insertModel = db.prepare(`
          INSERT INTO skill_combinations (
            name, description, skill_ids, skill_contexts,
            trade_flow_rules, context_annotations, state_machine_spec,
            source_video_url, source_video_title, extraction_confidence,
            variant_of, typical_use_case, complexity, visual_context_path,
            model_type, status, created_from, version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete_model', 'draft', ?, 1, datetime('now'), datetime('now'))
        `);

        let modelId: number;

        try {
          const result = insertModel.run(
            modelName,
            description,
            JSON.stringify(skillIds),
            skillContexts ? JSON.stringify(skillContexts) : null,
            tradeFlowRules ? JSON.stringify(tradeFlowRules) : null,
            contextAnnotations ? JSON.stringify(contextAnnotations) : null,
            stateMachineSpec ? JSON.stringify(stateMachineSpec) : null,
            sourceVideoUrl,
            sourceVideoTitle,
            extractionConfidence,
            variantOf,
            typicalUseCase,
            complexity,
            visualContextPath,
            createdFrom
          );
          modelId = result.lastInsertRowid as number;
        } catch (err) {
          db.close();
          throw err;
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  model_id: modelId,
                  message: `Model "${modelName}" saved successfully`,
                  details: {
                    skill_count: skillIds.length,
                    model_type: "complete_model",
                    status: "draft",
                    version: 1,
                    created_from: createdFrom,
                    has_trade_flow: !!tradeFlowRules,
                    has_context_annotations: !!contextAnnotations,
                    has_state_machine: !!stateMachineSpec,
                    source_video_url: sourceVideoUrl,
                    variant_of: variantOf,
                    visual_context_path: visualContextPath,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_model": {
        const modelId = args.model_id as number | undefined;
        const modelName = args.model_name as string | undefined;
        const includeSkills = (args.include_skills as boolean) || false;
        const includeIterations = (args.include_iterations as boolean) || false;
        const includeVariants = (args.include_variants as boolean) || false;

        if (!modelId && !modelName) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: "Error: Either model_id or model_name must be provided",
              },
            ],
            isError: true,
          };
        }

        // Fetch the model - also check for models without model_type set
        let model: Record<string, unknown> | undefined;
        if (modelId) {
          model = db
            .prepare("SELECT * FROM skill_combinations WHERE id = ?")
            .get(modelId) as Record<string, unknown> | undefined;
        } else if (modelName) {
          model = db
            .prepare("SELECT * FROM skill_combinations WHERE name = ?")
            .get(modelName) as Record<string, unknown> | undefined;
        }

        if (!model) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Model not found with ${modelId ? `id=${modelId}` : `name=${modelName}`}`,
              },
            ],
            isError: true,
          };
        }

        // Parse JSON fields
        const skillIds: number[] = JSON.parse((model.skill_ids as string) || "[]");
        const parsedModel = {
          ...model,
          skill_ids: skillIds,
          skill_contexts: model.skill_contexts ? JSON.parse(model.skill_contexts as string) : null,
          trade_flow_rules: model.trade_flow_rules ? JSON.parse(model.trade_flow_rules as string) : null,
          context_annotations: model.context_annotations ? JSON.parse(model.context_annotations as string) : null,
          state_machine_spec: model.state_machine_spec ? JSON.parse(model.state_machine_spec as string) : null,
          model_rules: model.model_rules ? JSON.parse(model.model_rules as string) : [],
          failed_entry_conditions: model.failed_entry_conditions ? JSON.parse(model.failed_entry_conditions as string) : [],
          iteration_log: model.iteration_log ? JSON.parse(model.iteration_log as string) : [],
          backtest_history: model.backtest_history ? JSON.parse(model.backtest_history as string) : [],
          // Frame-driven code generation fields
          visual_interpretations: model.visual_interpretations ? JSON.parse(model.visual_interpretations as string) : null,
          poi_type_rules: model.poi_type_rules ? JSON.parse(model.poi_type_rules as string) : null,
        };

        // Fetch skills if requested (for code generation)
        let skills: Record<string, unknown>[] = [];
        if (includeSkills && skillIds.length > 0) {
          const placeholders = skillIds.map(() => "?").join(",");
          skills = db
            .prepare(`
              SELECT id, name, slug, category, subcategory, description,
                     code_snippet, variables_required, dependencies, complexity, nlp_keywords
              FROM skills
              WHERE id IN (${placeholders})
            `)
            .all(...skillIds) as Record<string, unknown>[];

          // Parse JSON fields and add model context
          const skillContexts = parsedModel.skill_contexts || {};
          skills = skills.map((skill) => ({
            ...skill,
            variables_required: skill.variables_required ? JSON.parse(skill.variables_required as string) : [],
            dependencies: skill.dependencies ? JSON.parse(skill.dependencies as string) : [],
            nlp_keywords: skill.nlp_keywords ? JSON.parse(skill.nlp_keywords as string) : [],
            model_context: skillContexts[String(skill.id)] || null,
          }));
        }

        // Fetch iterations if requested
        let iterations: Record<string, unknown>[] = [];
        if (includeIterations) {
          iterations = db
            .prepare(`
              SELECT * FROM model_iterations
              WHERE model_id = ?
              ORDER BY iteration_date DESC
            `)
            .all(model.id) as Record<string, unknown>[];

          // Parse JSON fields in iterations
          iterations = iterations.map((iter) => ({
            ...iter,
            problems_detected: iter.problems_detected ? JSON.parse(iter.problems_detected as string) : null,
            skills_added: iter.skills_added ? JSON.parse(iter.skills_added as string) : null,
            skills_removed: iter.skills_removed ? JSON.parse(iter.skills_removed as string) : null,
            parameters_changed: iter.parameters_changed ? JSON.parse(iter.parameters_changed as string) : null,
            insight_captured: iter.insight_captured ? JSON.parse(iter.insight_captured as string) : null,
          }));
        }

        // Fetch variants if requested
        let variants: Record<string, unknown>[] = [];
        if (includeVariants) {
          variants = db
            .prepare(`
              SELECT id, name, description, version, status, created_at
              FROM skill_combinations
              WHERE variant_of = ?
              ORDER BY created_at DESC
            `)
            .all(model.id) as Record<string, unknown>[];
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  model: parsedModel,
                  skills: includeSkills ? skills : undefined,
                  iterations: includeIterations ? iterations : undefined,
                  variants: includeVariants ? variants : undefined,
                  skill_count: includeSkills ? skills.length : undefined,
                  iteration_count: includeIterations ? iterations.length : undefined,
                  variant_count: includeVariants ? variants.length : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "update_model_after_iteration": {
        const modelId = args.model_id as number;
        const iterationInsight = args.iteration_insight as Record<string, unknown> | undefined;
        const problemsDetected = args.problems_detected as Array<Record<string, unknown>> | undefined;
        const solutionApplied = args.solution_applied as string;
        const impactPrediction = (args.impact_prediction as number) || null;
        const backtestCsvPath = (args.backtest_csv_path as string) || null;
        const tradesAnalyzed = (args.trades_analyzed as number) || null;
        const skillsAdded = (args.skills_added as number[]) || null;
        const skillsRemoved = (args.skills_removed as number[]) || null;
        const parametersChanged = args.parameters_changed as Record<string, unknown> | undefined;
        const tradeFlowChanges = (args.trade_flow_changes as string) || null;
        const insightConfidence = (args.insight_confidence as number) || null;

        // Get current model state
        const currentModel = db
          .prepare("SELECT * FROM skill_combinations WHERE id = ?")
          .get(modelId) as Record<string, unknown> | undefined;

        if (!currentModel) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Model not found with id=${modelId}`,
              },
            ],
            isError: true,
          };
        }

        const currentVersion = (currentModel.version as number) || 1;
        const newVersion = currentVersion + 1;

        // Parse existing iteration_log
        let iterationLog: Array<Record<string, unknown>> = [];
        try {
          iterationLog = currentModel.iteration_log
            ? JSON.parse(currentModel.iteration_log as string)
            : [];
        } catch {
          iterationLog = [];
        }

        // Add new iteration entry to log
        const newLogEntry = {
          version: newVersion,
          problem: problemsDetected?.[0]?.pattern || "unknown",
          solution: solutionApplied,
          impact: impactPrediction ? `+$${impactPrediction}` : "pending",
          confidence: insightConfidence || 0.5,
          date: new Date().toISOString(),
        };
        iterationLog.push(newLogEntry);

        // Use transaction for atomicity
        const insertIteration = db.prepare(`
          INSERT INTO model_iterations (
            model_id, version_before, version_after, iteration_date,
            backtest_csv_path, trades_analyzed, problems_detected,
            solution_applied, skills_added, skills_removed, parameters_changed,
            trade_flow_changes, impact_prediction, insight_captured, insight_confidence
          ) VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const updateModel = db.prepare(`
          UPDATE skill_combinations
          SET version = ?,
              iteration_log = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `);

        let iterationId: number;

        try {
          const transaction = db.transaction(() => {
            // Insert iteration record
            const iterResult = insertIteration.run(
              modelId,
              currentVersion,
              newVersion,
              backtestCsvPath,
              tradesAnalyzed,
              problemsDetected ? JSON.stringify(problemsDetected) : null,
              solutionApplied,
              skillsAdded ? JSON.stringify(skillsAdded) : null,
              skillsRemoved ? JSON.stringify(skillsRemoved) : null,
              parametersChanged ? JSON.stringify(parametersChanged) : null,
              tradeFlowChanges,
              impactPrediction,
              iterationInsight ? JSON.stringify(iterationInsight) : null,
              insightConfidence
            );
            iterationId = iterResult.lastInsertRowid as number;

            // Update model version and iteration_log
            updateModel.run(newVersion, JSON.stringify(iterationLog), modelId);
          });

          transaction();
        } catch (err) {
          db.close();
          throw err;
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  iteration_id: iterationId!,
                  model_id: modelId,
                  version_before: currentVersion,
                  version_after: newVersion,
                  message: `Model updated to version ${newVersion}`,
                  details: {
                    solution_applied: solutionApplied,
                    problems_count: problemsDetected?.length || 0,
                    impact_prediction: impactPrediction,
                    trades_analyzed: tradesAnalyzed,
                    skills_added: skillsAdded?.length || 0,
                    skills_removed: skillsRemoved?.length || 0,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_models": {
        const query = (args.query as string) || null;
        const filterByStatus = (args.filter_by_status as string) || null;
        const filterBySource = (args.filter_by_source as string) || null;
        const hasIterationForProblem = (args.has_iteration_for_problem as string) || null;
        const limit = (args.limit as number) || 10;

        // Build query dynamically
        let sql = `
          SELECT sc.*,
                 (SELECT COUNT(*) FROM model_iterations WHERE model_id = sc.id) as iteration_count
          FROM skill_combinations sc
          WHERE sc.model_type = 'complete_model'
        `;
        const params: (string | number)[] = [];

        if (filterByStatus) {
          sql += " AND sc.status = ?";
          params.push(filterByStatus);
        }

        if (filterBySource) {
          sql += " AND sc.created_from = ?";
          params.push(filterBySource);
        }

        if (hasIterationForProblem) {
          sql += `
            AND EXISTS (
              SELECT 1 FROM model_iterations mi
              WHERE mi.model_id = sc.id
              AND mi.problems_detected LIKE ?
            )
          `;
          params.push(`%"pattern":"${hasIterationForProblem}"%`);
        }

        // Text search on name/description
        if (query) {
          sql += " AND (sc.name LIKE ? OR sc.description LIKE ?)";
          params.push(`%${query}%`, `%${query}%`);
        }

        sql += " ORDER BY sc.updated_at DESC LIMIT ?";
        params.push(limit);

        const models = db.prepare(sql).all(...params) as Record<string, unknown>[];

        // Parse JSON fields for each model
        const parsedModels = models.map((model) => ({
          id: model.id,
          name: model.name,
          description: model.description,
          skill_ids: JSON.parse((model.skill_ids as string) || "[]"),
          status: model.status,
          version: model.version,
          created_from: model.created_from,
          source_video_url: model.source_video_url,
          iteration_count: model.iteration_count,
          complexity: model.complexity,
          variant_of: model.variant_of,
          created_at: model.created_at,
          updated_at: model.updated_at,
        }));

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: parsedModels.length,
                  models: parsedModels,
                  filters_applied: {
                    query,
                    status: filterByStatus,
                    source: filterBySource,
                    problem_pattern: hasIterationForProblem,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "suggest_model_variants": {
        const modelId = args.model_id as number;
        const problemPattern = args.problem_pattern as string;
        const backtestSummary = args.backtest_summary as Record<string, unknown> | undefined;

        // Get the model
        const model = db
          .prepare("SELECT * FROM skill_combinations WHERE id = ?")
          .get(modelId) as Record<string, unknown> | undefined;

        if (!model) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Model not found with id=${modelId}`,
              },
            ],
            isError: true,
          };
        }

        // Look for iterations across ALL models that addressed this problem pattern
        const similarIterations = db
          .prepare(`
            SELECT mi.*, sc.name as model_name
            FROM model_iterations mi
            JOIN skill_combinations sc ON mi.model_id = sc.id
            WHERE mi.problems_detected LIKE ?
            AND mi.impact_actual > 0
            ORDER BY mi.impact_actual DESC
            LIMIT 5
          `)
          .all(`%"pattern":"${problemPattern}"%`) as Record<string, unknown>[];

        // Parse insights from found iterations
        const historicalSolutions: Array<{
          model_name: string;
          solution: string;
          impact: number;
          insight: Record<string, unknown> | null;
        }> = [];

        for (const iter of similarIterations) {
          const insight = iter.insight_captured
            ? JSON.parse(iter.insight_captured as string)
            : null;
          historicalSolutions.push({
            model_name: iter.model_name as string,
            solution: iter.solution_applied as string,
            impact: iter.impact_actual as number,
            insight,
          });
        }

        // Suggest based on problem pattern
        const suggestions: Array<{
          type: string;
          description: string;
          confidence: number;
          source?: string;
        }> = [];

        // Problem-specific suggestions
        const problemSuggestions: Record<string, Array<{ type: string; description: string; confidence: number }>> = {
          mfe_reversal: [
            { type: "parameter_change", description: "Add partial profits at 1R (take 50%)", confidence: 0.85 },
            { type: "skill_addition", description: "Add trailing stop skill activated at 1R", confidence: 0.75 },
            { type: "filter_addition", description: "Add session filter to avoid PM session", confidence: 0.65 },
          ],
          early_exit: [
            { type: "parameter_change", description: "Widen initial stop by 20%", confidence: 0.7 },
            { type: "skill_addition", description: "Add protected swing stop skill", confidence: 0.75 },
            { type: "flow_change", description: "Wait for swing low protection before stop placement", confidence: 0.65 },
          ],
          late_entry: [
            { type: "parameter_change", description: "Reduce confirmation wait time", confidence: 0.7 },
            { type: "skill_removal", description: "Remove secondary confirmation requirement", confidence: 0.6 },
            { type: "filter_addition", description: "Add momentum threshold to skip weak setups", confidence: 0.65 },
          ],
          false_breakout: [
            { type: "skill_addition", description: "Add liquidity sweep detection before entry", confidence: 0.8 },
            { type: "filter_addition", description: "Require HTF structure alignment", confidence: 0.75 },
            { type: "parameter_change", description: "Wait for close above/below level", confidence: 0.7 },
          ],
          range_fade: [
            { type: "filter_addition", description: "Add range size threshold (min/max ticks)", confidence: 0.75 },
            { type: "skill_addition", description: "Add range maturity detection", confidence: 0.7 },
            { type: "flow_change", description: "Only trade first break of session range", confidence: 0.65 },
          ],
          session_leak: [
            { type: "filter_addition", description: "Hard stop trading after 2:30 PM ET", confidence: 0.85 },
            { type: "parameter_change", description: "Reduce position size 50% after 1 PM", confidence: 0.7 },
            { type: "flow_change", description: "Close all positions before 3 PM", confidence: 0.75 },
          ],
          stop_hunt: [
            { type: "parameter_change", description: "Place stops beyond sweep levels", confidence: 0.8 },
            { type: "skill_addition", description: "Add sweep detection to adjust stops dynamically", confidence: 0.75 },
            { type: "flow_change", description: "Wait for sweep completion before entry", confidence: 0.7 },
          ],
          overtrading: [
            { type: "filter_addition", description: "Max 3 trades per day limit", confidence: 0.85 },
            { type: "parameter_change", description: "Require 30 minute cooldown after loss", confidence: 0.75 },
            { type: "flow_change", description: "Stop trading after 2 consecutive losses", confidence: 0.7 },
          ],
        };

        // Add pattern-specific suggestions
        if (problemSuggestions[problemPattern]) {
          suggestions.push(...problemSuggestions[problemPattern]);
        }

        // Add suggestions from historical solutions
        for (const hist of historicalSolutions) {
          if (hist.insight?.generalizable) {
            suggestions.push({
              type: "historical_learning",
              description: `${hist.insight.suggested_rule || hist.solution} (from ${hist.model_name})`,
              confidence: Math.min((hist.impact / 1000) * 0.1 + 0.5, 0.9),
              source: hist.model_name,
            });
          }
        }

        // Sort by confidence
        suggestions.sort((a, b) => b.confidence - a.confidence);

        // Get skills that might help
        const skillSuggestions = db
          .prepare(`
            SELECT id, name, category, description
            FROM skills
            WHERE (
              category LIKE '%risk%'
              OR category LIKE '%management%'
              OR category LIKE '%filter%'
            )
            AND id NOT IN (
              SELECT json_each.value
              FROM skill_combinations, json_each(skill_ids)
              WHERE skill_combinations.id = ?
            )
            LIMIT 5
          `)
          .all(modelId) as Record<string, unknown>[];

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  model_id: modelId,
                  model_name: model.name,
                  problem_pattern: problemPattern,
                  backtest_summary: backtestSummary,
                  suggestions: suggestions.slice(0, 5),
                  historical_solutions: historicalSolutions,
                  available_skills: skillSuggestions.map((s) => ({
                    id: s.id,
                    name: s.name,
                    category: s.category,
                    description: s.description,
                  })),
                  recommendation:
                    suggestions.length > 0
                      ? `Top suggestion: ${suggestions[0].description} (confidence: ${Math.round(suggestions[0].confidence * 100)}%)`
                      : "No specific suggestions available. Consider creating a variant with manual adjustments.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_visual_context": {
        const videoId = args.video_id as string;
        const contextType = (args.context_type as string) || "all";
        const contradictionOnly = args.contradiction_only as boolean || false;

        // Build query based on filters
        let query = `
          SELECT
            video_id, frame_filename, frame_index, timestamp_sec, timestamp_str,
            frame_type, sad_section, categories, is_contradiction_relevant,
            transcript_segment, sad_path
          FROM video_frames
          WHERE video_id = ?
        `;
        const params: (string | number)[] = [videoId];

        if (contextType !== "all") {
          query += " AND frame_type = ?";
          params.push(contextType);
        }

        if (contradictionOnly) {
          query += " AND is_contradiction_relevant = 1";
        }

        query += " ORDER BY timestamp_sec ASC";

        const frames = db.prepare(query).all(...params) as Record<string, unknown>[];

        if (frames.length === 0) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `No frames found for video_id="${videoId}" with context_type="${contextType}". ` +
                  `Make sure frames were persisted with --persist-frames flag during /youtube extraction.`,
              },
            ],
          };
        }

        // Build the frame paths (relative to project root)
        const frameData = frames.map((f) => {
          const categories = f.categories ? JSON.parse(f.categories as string) : [];
          return {
            video_id: f.video_id,
            filename: f.frame_filename,
            // Construct the absolute path for Claude to read
            path: `data/video-frames/${f.video_id}/frames/${f.frame_filename}`,
            timestamp: f.timestamp_str,
            timestamp_sec: f.timestamp_sec,
            frame_type: f.frame_type,
            sad_section: f.sad_section,
            categories,
            is_contradiction_relevant: f.is_contradiction_relevant === 1,
            transcript_context: f.transcript_segment,
          };
        });

        // Group by frame type for summary
        const typeCounts: Record<string, number> = {};
        for (const f of frameData) {
          typeCounts[f.frame_type as string] = (typeCounts[f.frame_type as string] || 0) + 1;
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  video_id: videoId,
                  filter: { context_type: contextType, contradiction_only: contradictionOnly },
                  frame_count: frames.length,
                  type_summary: typeCounts,
                  frames: frameData,
                  usage_hint: "Use the Read tool with frame paths to view images for visual analysis",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "resolve_video_id": {
        const sourceUrl = args.source_url as string | undefined;
        const sadPath = args.sad_path as string | undefined;

        // Option 1: Direct URL provided
        if (sourceUrl) {
          const videoId = extractVideoId(sourceUrl);
          if (videoId) {
            // Check if we have frames for this video
            const frameCount = db.prepare(
              "SELECT COUNT(*) as count FROM video_frames WHERE video_id = ?"
            ).get(videoId) as { count: number };

            db.close();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    video_id: videoId,
                    source: "url",
                    source_url: sourceUrl,
                    has_persisted_frames: frameCount.count > 0,
                    frame_count: frameCount.count,
                  }, null, 2),
                },
              ],
            };
          }
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Could not extract video_id from URL: ${sourceUrl}. Expected formats: youtu.be/X, youtube.com/watch?v=X, or youtube.com/embed/X`,
              },
            ],
            isError: true,
          };
        }

        // Option 2: Parse SAD file for source_url
        if (sadPath) {
          // Resolve path relative to project root
          const projectRoot = join(__dirname, "../../../..");
          const fullPath = sadPath.startsWith("/") || sadPath.includes(":")
            ? sadPath
            : resolve(projectRoot, sadPath);

          if (!existsSync(fullPath)) {
            db.close();
            return {
              content: [
                {
                  type: "text",
                  text: `SAD file not found: ${fullPath}`,
                },
              ],
              isError: true,
            };
          }

          const content = readFileSync(fullPath, "utf-8");

          // Look for URL in ## Source section or anywhere
          const urlPatterns = [
            /URL:\s*(https?:\/\/[^\s\n]+)/i,
            /\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/i,
            /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^\s\n]+)/i,
          ];

          let foundUrl: string | null = null;
          for (const pattern of urlPatterns) {
            const match = content.match(pattern);
            if (match) {
              foundUrl = match[1];
              break;
            }
          }

          if (foundUrl) {
            const videoId = extractVideoId(foundUrl);
            if (videoId) {
              // Check if we have frames for this video
              const frameCount = db.prepare(
                "SELECT COUNT(*) as count FROM video_frames WHERE video_id = ?"
              ).get(videoId) as { count: number };

              db.close();
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      video_id: videoId,
                      source: "sad",
                      sad_path: sadPath,
                      source_url: foundUrl,
                      has_persisted_frames: frameCount.count > 0,
                      frame_count: frameCount.count,
                    }, null, 2),
                  },
                ],
              };
            }
          }

          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Could not find YouTube URL in SAD file: ${sadPath}. Expected ## Source section with URL.`,
              },
            ],
            isError: true,
          };
        }

        db.close();
        return {
          content: [
            {
              type: "text",
              text: "Must provide either source_url or sad_path parameter",
            },
          ],
          isError: true,
        };
      }

      case "save_visual_interpretation": {
        const modelId = args.model_id as number;
        const patternName = args.pattern_name as string;
        const frameRef = (args.frame_ref as string) || null;
        const interpretation = args.interpretation as string;
        const codeImplication = (args.code_implication as string) || null;
        const verifiedByUser = args.verified_by_user !== false; // Default true
        const userFeedback = (args.user_feedback as string) || null;

        // Get current model
        const model = db
          .prepare("SELECT id, visual_interpretations FROM skill_combinations WHERE id = ?")
          .get(modelId) as { id: number; visual_interpretations: string | null } | undefined;

        if (!model) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Model not found with id=${modelId}`,
              },
            ],
            isError: true,
          };
        }

        // Parse existing interpretations or create new object
        let interpretations: Record<string, unknown> = {};
        try {
          interpretations = model.visual_interpretations
            ? JSON.parse(model.visual_interpretations)
            : {};
        } catch {
          interpretations = {};
        }

        // Add/update the interpretation
        const newInterpretation = {
          frame_ref: frameRef,
          interpretation,
          code_implication: codeImplication,
          verified_by_user: verifiedByUser,
          user_feedback: userFeedback,
          added_date: new Date().toISOString().split("T")[0],
          verified_date: verifiedByUser ? new Date().toISOString().split("T")[0] : null,
        };

        interpretations[patternName] = newInterpretation;

        // Update model
        db.prepare(`
          UPDATE skill_combinations
          SET visual_interpretations = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(JSON.stringify(interpretations), modelId);

        // Also insert into interpretation_history for tracking
        try {
          db.prepare(`
            INSERT INTO interpretation_history (
              model_id, pattern_name, frame_ref, interpretation,
              code_implication, user_verified, user_feedback,
              verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            modelId,
            patternName,
            frameRef,
            interpretation,
            codeImplication,
            verifiedByUser ? 1 : 0,
            userFeedback,
            verifiedByUser ? new Date().toISOString() : null
          );
        } catch {
          // Table might not exist yet - that's OK, the migration will create it
          console.error("interpretation_history table not found - skipping history insert");
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  model_id: modelId,
                  pattern_name: patternName,
                  message: `Visual interpretation saved for pattern "${patternName}"`,
                  interpretation: newInterpretation,
                  total_interpretations: Object.keys(interpretations).length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "set_model_poi_type": {
        const modelId = args.model_id as number;
        const primaryPoiType = args.primary_poi_type as string;
        const c1c2LocationRule = (args.c1c2_location_rule as string) || null;
        const invalidationDirection = (args.invalidation_direction as string) || null;
        const invalidationThreshold = (args.invalidation_threshold as number) || null;
        const confirmationCounting = (args.confirmation_counting as string) || null;
        const additionalRules = args.additional_rules as Record<string, unknown> | undefined;

        // Get current model
        const model = db
          .prepare("SELECT id, poi_type_rules FROM skill_combinations WHERE id = ?")
          .get(modelId) as { id: number; poi_type_rules: string | null } | undefined;

        if (!model) {
          db.close();
          return {
            content: [
              {
                type: "text",
                text: `Error: Model not found with id=${modelId}`,
              },
            ],
            isError: true,
          };
        }

        // Build POI type rules object
        const poiTypeRules = {
          primary_poi_type: primaryPoiType,
          c1c2_location_rule: c1c2LocationRule || getDefaultC1C2Rule(primaryPoiType),
          invalidation_direction: invalidationDirection || "bullish_below_bearish_above",
          invalidation_threshold: invalidationThreshold || getDefaultThreshold(primaryPoiType),
          confirmation_counting: confirmationCounting || getDefaultCountingMode(primaryPoiType),
          additional_rules: additionalRules || {},
          updated_at: new Date().toISOString(),
        };

        // Update model
        db.prepare(`
          UPDATE skill_combinations
          SET poi_type_rules = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(JSON.stringify(poiTypeRules), modelId);

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  model_id: modelId,
                  message: `POI type rules set for model (type: ${primaryPoiType})`,
                  poi_type_rules: poiTypeRules,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "suggest_pattern_mappings": {
        const annotationLabels = (args.annotation_labels as string[]) || [];
        const zonesShown = (args.zones_shown as string[]) || [];
        const videoId = (args.video_id as string) || null;
        const frameName = (args.frame_name as string) || null;

        // Pattern to skill mapping rules
        const patternMappings: Record<string, { skill_name: string; skill_id: number; code_insight: string }> = {};

        // Label-to-skill mappings
        const labelMappings: Record<string, { skillName: string; codeInsight: string }> = {
          // Candle confirmation labels
          "C1": { skillName: "Candle 2 Closure", codeInsight: "C1 = first candle closing beyond POI zone" },
          "C2": { skillName: "Candle 2 Closure", codeInsight: "C2 = second candle confirming direction (must close beyond C1)" },
          "C3": { skillName: "Candle 3 Closure", codeInsight: "C3 = third candle for extended confirmation (XC2 pattern)" },
          "C4": { skillName: "Candle 4 Expansion", codeInsight: "C4 = expansion candle, entry on closure" },
          // POI type labels
          "FVG": { skillName: "Fair Value Gap", codeInsight: "FVG = price inefficiency gap between candles" },
          "OB": { skillName: "Order Block", codeInsight: "OB = last opposing candle before reversal (use index[1], NOT index[0])" },
          "order block": { skillName: "Order Block", codeInsight: "OB = last opposing candle before reversal" },
          "sweep": { skillName: "Liquidity Sweep Detection", codeInsight: "Sweep = liquidity grab at key level followed by reversal" },
          "liquidity": { skillName: "Liquidity Sweep Detection", codeInsight: "Liquidity level = area of stop orders to be swept" },
          // Pattern labels
          "CISD": { skillName: "CISD Pattern", codeInsight: "CISD = Change In State Of Delivery - swing point break" },
          "CHoCH": { skillName: "Change Of Character", codeInsight: "CHoCH = Change of Character - structure break" },
          "BOS": { skillName: "Change Of Character", codeInsight: "BOS = Break of Structure" },
          // Invalidation
          "X": { skillName: "Invalidation", codeInsight: "X mark = level invalidated, do not re-trade" },
          "invalidation": { skillName: "Invalidation", codeInsight: "Mark invalidated levels with X" },
          // Structure
          "swing": { skillName: "Protected Swings", codeInsight: "Swing = structural high/low level" },
          "protected swing": { skillName: "Protected Swings", codeInsight: "Protected swing = level to watch for sweep" },
          "SMT": { skillName: "SMT Divergence Confirmation", codeInsight: "SMT = Smart Money Technique divergence between correlated assets" },
        };

        // Zone-to-skill mappings
        const zoneMappings: Record<string, { skillName: string; codeInsight: string }> = {
          "PDH": { skillName: "Pre-market Bias Calculation", codeInsight: "PDH = Previous Day High - key liquidity level" },
          "PDL": { skillName: "Pre-market Bias Calculation", codeInsight: "PDL = Previous Day Low - key liquidity level" },
          "FVG zone": { skillName: "FVG Entry Zones", codeInsight: "FVG zone = area for potential entry" },
          "OB zone": { skillName: "Order Blocks for Continuations", codeInsight: "OB zone = order block area for reaction" },
          "POI": { skillName: "Fair Value Gap", codeInsight: "POI = Point of Interest for entry" },
        };

        // Query skills table for skill IDs
        const skillQuery = db.prepare("SELECT id, name FROM skills WHERE LOWER(name) LIKE ?");

        // Process annotation labels
        for (const label of annotationLabels) {
          const normalizedLabel = label.toLowerCase().trim();

          for (const [pattern, mapping] of Object.entries(labelMappings)) {
            if (normalizedLabel.includes(pattern.toLowerCase())) {
              const skill = skillQuery.get(`%${mapping.skillName.toLowerCase()}%`) as { id: number; name: string } | undefined;
              if (skill && !patternMappings[pattern]) {
                patternMappings[pattern] = {
                  skill_name: skill.name,
                  skill_id: skill.id,
                  code_insight: mapping.codeInsight,
                };
              }
            }
          }
        }

        // Process zones
        for (const zone of zonesShown) {
          const normalizedZone = zone.toLowerCase().trim();

          for (const [pattern, mapping] of Object.entries(zoneMappings)) {
            if (normalizedZone.includes(pattern.toLowerCase())) {
              const skill = skillQuery.get(`%${mapping.skillName.toLowerCase()}%`) as { id: number; name: string } | undefined;
              if (skill && !patternMappings[pattern]) {
                patternMappings[pattern] = {
                  skill_name: skill.name,
                  skill_id: skill.id,
                  code_insight: mapping.codeInsight,
                };
              }
            }
          }
        }

        db.close();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pattern_count: Object.keys(patternMappings).length,
                  pattern_mappings: patternMappings,
                  video_id: videoId,
                  frame_name: frameName,
                  hint: "Add these to frame_index.json pattern_mappings for the frame",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_poi_type_rules": {
        const poiType = args.poi_type as string;
        const ruleType = (args.rule_type as string) || "all";

        let query = "SELECT * FROM poi_type_rules WHERE 1=1";
        const params: string[] = [];

        if (poiType !== "all") {
          query += " AND poi_type = ?";
          params.push(poiType);
        }

        if (ruleType !== "all") {
          query += " AND rule_type = ?";
          params.push(ruleType);
        }

        query += " ORDER BY poi_type, rule_type";

        const rules = db.prepare(query).all(...params) as Array<{
          id: number;
          poi_type: string;
          rule_type: string;
          rule_text: string;
          code_pattern: string | null;
          timeframe_restriction: string | null;
          source_video_id: string | null;
          source_frame: string | null;
        }>;

        db.close();

        // Group by POI type for easier consumption
        const groupedRules: Record<string, Record<string, { rule_text: string; code_pattern: string | null }>> = {};

        for (const rule of rules) {
          if (!groupedRules[rule.poi_type]) {
            groupedRules[rule.poi_type] = {};
          }
          groupedRules[rule.poi_type][rule.rule_type] = {
            rule_text: rule.rule_text,
            code_pattern: rule.code_pattern,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  rule_count: rules.length,
                  rules_by_poi_type: groupedRules,
                  raw_rules: rules,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NinjaTrader Skills MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
