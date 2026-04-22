import type { TCMSearchResult } from "@/lib/tcm-db";
import type { ChartConfig } from "@/lib/tcm-chart-data";
import type { StructuredCoachBrief } from "@/lib/tcm-coach-brief";
import type { VideoClipInfo } from "@/lib/tcm-video-clips";

export interface StoredFrameReference {
  videoId: string;
  videoTitle: string;
  frameNumber: number;
  timestamp: number;
  timestampFormatted: string;
  transcriptText?: string;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  structuredAnswer?: StructuredCoachBrief;
  sources?: TCMSearchResult[];
  isLoading?: boolean;
  frames?: StoredFrameReference[];
  chartData?: ChartConfig;
  videoClip?: VideoClipInfo;
  primaryClip?: VideoClipInfo;
  recommendedClips?: VideoClipInfo[];
  watchLink?: string;
  lessonLink?: string;
}

export interface StoredChatSession {
  schemaVersion: 2;
  userId: string;
  scope: string;
  updatedAt: string;
  messages: StoredChatMessage[];
  input: string;
}

const STORAGE_PREFIX = "tcm-chat-session";
const STORAGE_SCHEMA_VERSION = 2;

export function buildTCMChatSessionKey(userId: string | number, scope = "default"): string {
  return `${STORAGE_PREFIX}:v2:${String(userId)}:${scope}`;
}

export function buildLegacyTCMChatSessionKey(namespace = "default"): string {
  return `${STORAGE_PREFIX}:${namespace}`;
}

export function readTCMChatSession(key: string): StoredChatSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredChatSession>;
    if (!parsed || !Array.isArray(parsed.messages) || typeof parsed.userId !== "string" || typeof parsed.scope !== "string") {
      return null;
    }

    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      userId: parsed.userId,
      scope: parsed.scope,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      messages: parsed.messages.filter((message) => typeof message?.content === "string"),
      input: typeof parsed.input === "string" ? parsed.input : "",
    };
  } catch (error) {
    console.error("Failed to read persisted TCM chat session:", error);
    return null;
  }
}

export function writeTCMChatSession(key: string, session: Omit<StoredChatSession, "schemaVersion" | "updatedAt">): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify({
      ...session,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    } satisfies StoredChatSession));
  } catch (error) {
    console.error("Failed to persist TCM chat session:", error);
  }
}

export function migrateLegacyTCMChatSession(params: {
  legacyKey: string;
  nextKey: string;
  userId: string | number;
  scope: string;
}): StoredChatSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(params.legacyKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { messages?: StoredChatMessage[]; input?: string } | null;
    if (!parsed || !Array.isArray(parsed.messages)) {
      window.localStorage.removeItem(params.legacyKey);
      return null;
    }

    const migratedSession: StoredChatSession = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      userId: String(params.userId),
      scope: params.scope,
      updatedAt: new Date().toISOString(),
      messages: parsed.messages.filter((message) => typeof message?.content === "string"),
      input: typeof parsed.input === "string" ? parsed.input : "",
    };

    window.localStorage.setItem(params.nextKey, JSON.stringify(migratedSession));
    window.localStorage.removeItem(params.legacyKey);
    return migratedSession;
  } catch (error) {
    console.error("Failed to migrate persisted TCM chat session:", error);
    return null;
  }
}

export function migrateStoredTCMChatSession(params: {
  fromKey: string;
  nextKey: string;
  scope?: string;
}): StoredChatSession | null {
  if (typeof window === "undefined") return null;

  try {
    if (params.fromKey === params.nextKey) {
      return readTCMChatSession(params.nextKey);
    }

    const existingSession = readTCMChatSession(params.fromKey);
    if (!existingSession) {
      return null;
    }

    const migratedSession: StoredChatSession = {
      ...existingSession,
      scope: params.scope ?? existingSession.scope,
      updatedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(params.nextKey, JSON.stringify(migratedSession));
    window.localStorage.removeItem(params.fromKey);
    return migratedSession;
  } catch (error) {
    console.error("Failed to migrate stored TCM chat session:", error);
    return null;
  }
}

export function clearTCMChatSessions(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${STORAGE_PREFIX}:`)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Failed to clear persisted TCM chat sessions:", error);
  }
}
