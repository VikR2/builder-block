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
import { dirname, join } from "path";
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
    const writableTools = ["save_skill", "save_skill_with_source"];
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
