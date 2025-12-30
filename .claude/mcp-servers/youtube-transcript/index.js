#!/usr/bin/env node

/**
 * YouTube Transcript MCP Server
 *
 * Provides tools for fetching YouTube video transcripts.
 * Uses youtube-transcript npm package with yt-dlp fallback for auto-generated captions.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { YoutubeTranscript } from 'youtube-transcript';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Parse VTT subtitle format into transcript segments.
 * Handles auto-generated captions with deduplication.
 */
function parseVTT(vttContent) {
  const lines = vttContent.split('\n');
  const segments = [];
  let currentText = '';
  let currentStart = 0;
  let lastText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WEBVTT header and empty lines
    if (line === 'WEBVTT' || line === '' || line.startsWith('Kind:') || line.startsWith('Language:')) {
      continue;
    }

    // Parse timestamp line: 00:00:00.000 --> 00:00:05.000
    const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timestampMatch) {
      currentStart = parseTimestamp(timestampMatch[1]);
      continue;
    }

    // Skip cue identifiers (numeric lines)
    if (/^\d+$/.test(line)) {
      continue;
    }

    // This is caption text
    if (line && !line.startsWith('NOTE')) {
      // Strip HTML-like tags (<c>, </c>, <c.colorXXXXXX>, etc.)
      let cleanText = line
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      // Deduplicate consecutive identical lines (common in auto-captions)
      if (cleanText && cleanText !== lastText) {
        segments.push({
          text: cleanText,
          offset: currentStart * 1000, // Convert to ms
          duration: 0 // VTT doesn't always have duration per segment
        });
        lastText = cleanText;
      }
    }
  }

  // Calculate duration from last segment
  const durationSeconds = segments.length > 0
    ? Math.round(segments[segments.length - 1].offset / 1000)
    : 0;

  // Combine all text
  const fullText = segments.map(s => s.text).join(' ');

  return {
    transcript: fullText,
    segments: segments.length,
    duration_seconds: durationSeconds,
    character_count: fullText.length
  };
}

/**
 * Parse VTT timestamp to seconds.
 * Format: HH:MM:SS.mmm
 */
function parseTimestamp(timestamp) {
  const parts = timestamp.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Fetch transcript using yt-dlp (for auto-generated captions).
 */
async function fetchWithYtDlp(url) {
  const tempDir = tmpdir();
  const tempId = randomUUID();
  const tempBase = join(tempDir, `yt-transcript-${tempId}`);

  return new Promise((resolve, reject) => {
    // yt-dlp command to download auto-generated subtitles
    const args = [
      '--write-auto-sub',
      '--sub-lang', 'en',
      '--skip-download',
      '--sub-format', 'vtt',
      '-o', tempBase,
      url
    ];

    const proc = spawn('yt-dlp', args, {
      timeout: 30000 // 30 second timeout
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      try {
        if (code !== 0) {
          reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
          return;
        }

        // Look for the generated VTT file
        const vttPath = `${tempBase}.en.vtt`;

        try {
          const vttContent = await fs.readFile(vttPath, 'utf8');
          const result = parseVTT(vttContent);

          // Cleanup temp file
          await fs.unlink(vttPath).catch(() => {});

          resolve(result);
        } catch (readErr) {
          // Try alternate naming patterns
          const altPaths = [
            `${tempBase}.en.vtt`,
            `${tempBase}.vtt`,
          ];

          for (const altPath of altPaths) {
            try {
              const content = await fs.readFile(altPath, 'utf8');
              const result = parseVTT(content);
              await fs.unlink(altPath).catch(() => {});
              resolve(result);
              return;
            } catch {
              continue;
            }
          }

          reject(new Error('No subtitle file found after yt-dlp download'));
        }
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

const server = new Server(
  {
    name: "youtube-transcript",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_transcript",
        description: "Fetch transcript from a YouTube video URL. Returns the full transcript text and metadata.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "YouTube video URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_transcript") {
    try {
      const url = args.url;

      // Validate URL
      if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Invalid YouTube URL. Please provide a valid YouTube video URL.",
                url: url,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      // Try youtube-transcript first (manual captions)
      let result = null;
      let primaryError = null;

      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);

        if (transcript && transcript.length > 0) {
          // Combine transcript segments into full text
          const fullText = transcript.map((item) => item.text).join(' ');
          const duration = transcript[transcript.length - 1]?.offset || 0;

          result = {
            transcript: fullText,
            segments: transcript.length,
            duration_seconds: Math.round(duration / 1000),
            character_count: fullText.length,
          };
        }
      } catch (err) {
        primaryError = err;
      }

      // Fallback to yt-dlp for auto-generated captions
      if (!result) {
        try {
          result = await fetchWithYtDlp(url);
        } catch (fallbackError) {
          // Both methods failed
          const errorMsg = primaryError
            ? `Manual captions: ${primaryError.message}. Auto-generated: ${fallbackError.message}`
            : fallbackError.message;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `No transcript available. ${errorMsg}`,
                  url: url,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: `Failed to fetch transcript: ${error.message}`,
                url: args.url,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

/**
 * Check if yt-dlp is available in PATH.
 */
async function checkYtDlp() {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--version']);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function main() {
  // Check yt-dlp availability
  const ytDlpAvailable = await checkYtDlp();
  if (!ytDlpAvailable) {
    console.error("Warning: yt-dlp not found. Auto-generated caption fallback will not work.");
    console.error("Install with: pip install yt-dlp");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (since stdout is used for JSON-RPC)
  console.error("YouTube Transcript MCP Server running on stdio");
  if (ytDlpAvailable) {
    console.error("yt-dlp fallback enabled for auto-generated captions");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
