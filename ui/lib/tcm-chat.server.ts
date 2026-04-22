import { generateContextBasedResponse } from '@/lib/tcm-context';
import {
  buildStructuredCoachBrief,
  type StructuredCoachBrief
} from '@/lib/tcm-coach-brief';
import {
  buildContextAssemblyPrompt,
  buildSystemPrompt,
  formatContextForLLM,
  normalizeAssistantResponse,
  type TCMChatMode,
} from '@/lib/tcm-prompts';
import { findFramesNearTimestamp } from '@/lib/tcm-frames';
import { generateChartDataForQuery } from '@/lib/tcm-chart-data';
import {
  formatTimestamp,
  searchDocumentParagraphs,
  searchTCMSkills,
  TCMSearchResult
} from '@/lib/tcm-db';
import { FAISSResult, searchFAISS, searchFAISSWithBoundary } from '@/lib/tcm-faiss.server';
import { VideoClipInfo } from '@/lib/tcm-video-clips';
import { getPublishedReadyVideoByFolderId, getPublishedReadyVideos } from '@/lib/tcm-admin/db';
import { getVideoPlaylistMembership } from '@/lib/tcm-admin/organization';
import { isLessonUsableForChat, readVideoLesson } from '@/lib/tcm-lessons';
import { getVideoLinkedSkillsByFolderId, skillMatchesQuery } from '@/lib/tcm-video-skill-sync';
import { resolveVideoDirectory } from '@/lib/tcm-video-artifacts';
import { resolveVideoId } from '@/lib/tcm-library';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type ChatProvider = 'openai' | 'anthropic' | 'none';

function resolveChatProvider(): ChatProvider {
  const configured = process.env.TCM_LLM_PROVIDER;

  if (configured === 'openai') {
    return OPENAI_API_KEY ? 'openai' : 'none';
  }

  if (configured === 'anthropic') {
    return ANTHROPIC_API_KEY ? 'anthropic' : 'none';
  }

  if (OPENAI_API_KEY) {
    return 'openai';
  }

  return 'none';
}

export const CHAT_PROVIDER = resolveChatProvider();
export const CHAT_MODEL = process.env.TCM_CHAT_MODEL || (
  CHAT_PROVIDER === 'openai'
    ? 'gpt-5-mini'
    : CHAT_PROVIDER === 'anthropic'
      ? 'claude-3-5-haiku-latest'
      : 'gpt-5-mini'
);
const CHAT_TIMEOUT_MS = Number.parseInt(process.env.TCM_CHAT_TIMEOUT_MS || '15000', 10);
export const USE_LLM = CHAT_PROVIDER !== 'none';

export interface ChatRequestBody {
  message: string;
  history?: Array<{ role: string; content: string }>;
  preferredVideoId?: string;
  preferredPlaylistId?: number | string | null;
  preferredTimestamp?: number | null;
  chatMode?: TCMChatMode;
}

export interface AssembledChatContext {
  query: string;
  skills: TCMSearchResult[];
  documents: TCMSearchResult[];
  transcripts: TCMSearchResult[];
  totalResults: number;
}

interface RankedTranscriptResult extends FAISSResult {
  rankScore: number;
  videoTitle: string;
  watchLink: string;
  lessonLink: string;
  description: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SAME_MOMENT_WINDOW_SECONDS = 60;

export interface ChatResponsePayload {
  context: AssembledChatContext;
  structuredAnswer: StructuredCoachBrief;
  sources: TCMSearchResult[];
  frames: Array<{
    videoId: string;
    videoTitle: string;
    frameNumber: number;
    timestamp: number;
    timestampFormatted: string;
    transcriptText: string;
  }>;
  chartData: ReturnType<typeof generateChartDataForQuery>;
  videoClip?: VideoClipInfo;
  primaryClip?: VideoClipInfo;
  recommendedClips: VideoClipInfo[];
  watchLink?: string;
  lessonLink?: string;
  contextSize: number;
  retrievalMs: number;
  mode: TCMChatMode;
}

export interface LLMResult {
  response: string;
  usedLLM: boolean;
  generationMs: number;
  model: string | null;
}

function parsePreferredPlaylistId(value: ChatRequestBody['preferredPlaylistId']): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  return null;
}

function buildWatchLink(videoId: string, startTime: number): string {
  return `/tcm/library/${encodeURIComponent(videoId)}?t=${Math.floor(startTime)}`;
}

function buildLessonLink(videoId: string): string {
  return `/tcm/library/${encodeURIComponent(videoId)}/lesson`;
}

function buildClipCandidate(params: {
  videoId: string;
  videoTitle: string;
  startTime: number;
  endTime: number;
  description: string;
  relevanceScore?: number;
  source?: string;
}): VideoClipInfo {
  const startTime = Math.max(0, params.startTime);

  return {
    videoId: params.videoId,
    videoTitle: params.videoTitle,
    startTime,
    endTime: Math.max(params.endTime, startTime + 45),
    description: params.description,
    relevanceScore: params.relevanceScore,
    source: params.source,
    watchLink: buildWatchLink(params.videoId, startTime),
    lessonLink: buildLessonLink(params.videoId),
  };
}

function clipsReferenceSameMoment(left: VideoClipInfo, right: VideoClipInfo): boolean {
  if (left.videoId !== right.videoId) {
    return false;
  }

  const startsClose = Math.abs(left.startTime - right.startTime) <= SAME_MOMENT_WINDOW_SECONDS;
  const overlaps = left.startTime <= right.endTime && right.startTime <= left.endTime;
  return startsClose || overlaps;
}

function cleanClipDescription(text: string): string {
  return text
    .replace(/\r\n/g, ' ')
    .replace(/^\s*"+|"+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureLessonSentence(text: string): string {
  const normalized = normalizeLessonText(text);
  if (!normalized) {
    return '';
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

const VIDEO_INTENT_STOP_WORDS = new Set([
  'what', 'is', 'in', 'the', 'video', 'videos', 'about', 'does', 'teach', 'taught',
  'part', 'lesson', 'show', 'me', 'tell', 'explain'
]);

const LOW_SIGNAL_LESSON_PATTERNS = [
  /\bbecause this is coming out the top of my head\b/i,
  /\blose my train of thought\b/i,
  /\bfor the sake of (?:the lecture|uniformity)\b/i,
  /\bi'm going to put\b.*\btext box\b/i,
  /\bit wouldn't be fair if i didn't\b/i,
  /\bblah, blah, blah\b/i,
  /\bbam\b/i,
];

function normalizeVideoIntentText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLessonText(value: string): string {
  return value
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksHelpfulLessonText(value: string): boolean {
  const normalized = normalizeLessonText(value);
  if (!normalized || normalized.length < 32) {
    return false;
  }

  if (normalized.endsWith('...')) {
    return false;
  }

  if (/^(all right|alright|okay|ok|so|well|um|uh)\b/i.test(normalized)) {
    return false;
  }

  return !LOW_SIGNAL_LESSON_PATTERNS.some((pattern) => pattern.test(normalized));
}

function dedupeText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of items) {
    const normalized = normalizeLessonText(item).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(item);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function buildVideoReferenceAliases(videoId: string, rawTitle: string): string[] {
  const aliases = new Set<string>();
  const addAlias = (value: string) => {
    const normalized = normalizeVideoIntentText(value);
    if (normalized.length >= 3) {
      aliases.add(normalized);
    }
  };

  addAlias(rawTitle);
  addAlias(videoId.split('_')[0] || videoId);

  const compactTitle = normalizeVideoIntentText(rawTitle).replace(/\s+/g, '');
  const compactMatch = compactTitle.match(/^(.*?)(\d+)$/);
  const spacedMatch = normalizeVideoIntentText(rawTitle).match(/^(.*?)(?:\b(?:part|pt|p)\s*)(\d+)$/);
  const numericMatch = compactMatch || spacedMatch;

  if (numericMatch) {
    const base = normalizeVideoIntentText(numericMatch[1]).replace(/\bvideo\b/g, '').trim();
    const part = numericMatch[2];
    const variants = new Set<string>([base]);

    if (base && !base.endsWith('s')) {
      variants.add(`${base}s`);
    }

    for (const variant of variants) {
      addAlias(`${variant}${part}`);
      addAlias(`${variant} ${part}`);
      addAlias(`${variant} part ${part}`);
      addAlias(`${variant} video part ${part}`);
    }
  }

  return Array.from(aliases);
}

function inferPreferredVideoIdFromQuery(query: string): string | null {
  const normalizedQuery = normalizeVideoIntentText(query);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');

  if (!normalizedQuery) {
    return null;
  }

  let bestVideoId: string | null = null;
  let bestScore = 0;

  for (const video of getPublishedReadyVideos()) {
    if (!video.folder_id) {
      continue;
    }

    const rawTitle = video.title || video.filename || video.folder_id;
    const aliases = buildVideoReferenceAliases(video.folder_id, rawTitle);
    let score = 0;

    for (const alias of aliases) {
      if (normalizedQuery.includes(alias)) {
        score = Math.max(score, 4 + Math.min(alias.split(' ').length, 3));
      }

      const compactAlias = alias.replace(/\s+/g, '');
      if (compactAlias.length >= 4 && compactQuery.includes(compactAlias)) {
        score = Math.max(score, 5);
      }
    }

    const titleTokens = normalizeVideoIntentText(rawTitle)
      .split(' ')
      .filter((token) => token && !VIDEO_INTENT_STOP_WORDS.has(token));

    if (titleTokens.length > 0 && titleTokens.every((token) => normalizedQuery.includes(token))) {
      score = Math.max(score, 2 + titleTokens.length);
    }

    if (score > bestScore) {
      bestScore = score;
      bestVideoId = video.folder_id;
    }
  }

  return bestScore >= 5 ? bestVideoId : null;
}

function buildLessonFocusSentence(title: string, timestampLabel?: string): string {
  const prefix = timestampLabel ? `At ${timestampLabel}, ` : '';
  const normalizedTitle = normalizeLessonText(title);
  const lowerTitle = normalizedTitle.toLowerCase();

  if (!normalizedTitle || lowerTitle === 'key teaching moment') {
    return `${prefix}the mentor walks through the bar-by-bar logic of the setup so you can read what price is communicating in real time.`;
  }

  if (lowerTitle.includes('submission range') && lowerTitle.includes('matching window')) {
    return `${prefix}the mentor connects the submission range to the matching window so you can see when submitted prices become actionable liquidity.`;
  }

  if (lowerTitle.includes('bias') && lowerTitle.includes('delivery')) {
    return `${prefix}the lesson explains how bias and delivery work together so the trade idea is framed in context instead of in isolation.`;
  }

  return `${prefix}the mentor focuses on ${lowerTitle} and how to apply it directly on the chart.`;
}

function lessonHasTutorPackContent(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): boolean {
  const tutorPack = lesson.tutorPack;
  return Boolean(
    tutorPack?.mentorApproach
    || tutorPack?.teachingSequence.length
    || tutorPack?.coreConcepts.length
    || tutorPack?.commonMisconceptions.length
    || tutorPack?.chartReadingRules.length
    || tutorPack?.ifYouSeeThisThenThat.length
    || tutorPack?.diagnosticQuestions.length
    || tutorPack?.practicePrompts.length
  );
}

function buildTutorPackFocusAreas(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): string[] {
  const tutorPack = lesson.tutorPack;
  if (!tutorPack) {
    return [];
  }

  return dedupeText(
    [
      ...tutorPack.teachingSequence,
      ...tutorPack.coreConcepts.map((concept) => (
        concept.timestampLabel
          ? `At ${concept.timestampLabel}, ${concept.summary}`
          : concept.summary
      )),
      ...tutorPack.chartReadingRules,
    ]
      .map(ensureLessonSentence)
      .filter(looksHelpfulLessonText),
    4
  );
}

function buildTutorPackMentorNotes(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): string {
  const tutorPack = lesson.tutorPack;
  if (!tutorPack) {
    return '';
  }

  return dedupeText(
    [
      tutorPack.mentorApproach,
      ...tutorPack.prerequisites,
      ...tutorPack.teachingSequence,
      ...tutorPack.coreConcepts.map((concept) => (
        concept.timestampLabel
          ? `At ${concept.timestampLabel}, ${concept.summary}`
          : concept.summary
      )),
    ]
      .map(ensureLessonSentence)
      .filter(looksHelpfulLessonText),
    8
  ).join(' ');
}

function buildTutorPackRuleNotes(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): string {
  const tutorPack = lesson.tutorPack;
  if (!tutorPack) {
    return '';
  }

  return dedupeText(
    [
      ...tutorPack.commonMisconceptions,
      ...tutorPack.chartReadingRules,
      ...tutorPack.ifYouSeeThisThenThat.map((rule) => (
        `If you see ${rule.ifYouSee}, then ${rule.thenExpect} because ${rule.because}.`
      )),
    ]
      .map(ensureLessonSentence)
      .filter(looksHelpfulLessonText),
    8
  ).join(' ');
}

function buildTutorPackCoachingPrompts(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): string {
  const tutorPack = lesson.tutorPack;
  if (!tutorPack) {
    return '';
  }

  return dedupeText(
    [
      ...tutorPack.diagnosticQuestions,
      ...tutorPack.practicePrompts,
    ]
      .map(ensureLessonSentence)
      .filter(looksHelpfulLessonText),
    8
  ).join(' ');
}

function lessonHasUsableChatContent(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): boolean {
  if (looksHelpfulLessonText(lesson.summary)) {
    return true;
  }

  if (lessonHasTutorPackContent(lesson)) {
    return true;
  }

  return lesson.sections.some((section) => Boolean(section.title))
    || lesson.recommendedMoments.some((moment) => Boolean(moment.title));
}

function buildLessonFocusAreas(lesson: NonNullable<ReturnType<typeof readVideoLesson>>): string[] {
  const tutorPackFocus = buildTutorPackFocusAreas(lesson);
  if (tutorPackFocus.length > 0) {
    return tutorPackFocus;
  }

  const titledSections = lesson.sections
    .map((section) => normalizeLessonText(section.title))
    .filter(Boolean)
    .map((title) => buildLessonFocusSentence(title));

  if (titledSections.length > 0) {
    return dedupeText(titledSections, 4);
  }

  return dedupeText(
    lesson.recommendedMoments.map((moment) => buildLessonFocusSentence(moment.title, moment.timestampLabel)),
    4
  );
}

function getLessonMomentDescription(videoId: string, targetTimestamp: number): string | null {
  const video = getPublishedReadyVideoByFolderId(videoId);
  if (!video) {
    return null;
  }

  const videoDir = resolveVideoDirectory(video);
  if (!videoDir) {
    return null;
  }

  const lesson = readVideoLesson(videoDir);
  if (!lesson || !lessonHasUsableChatContent(lesson)) {
    return null;
  }

  const nearestSection = lesson.sections
    .slice()
    .sort((left, right) => Math.abs(left.startTime - targetTimestamp) - Math.abs(right.startTime - targetTimestamp))[0];

  const nearestMoment = lesson.recommendedMoments
    .slice()
    .sort((left, right) => Math.abs(left.timestamp - targetTimestamp) - Math.abs(right.timestamp - targetTimestamp))[0];

  const readableDescription = [
    nearestMoment?.reason,
    nearestSection?.summary,
    nearestSection?.transcriptExcerpt,
    lesson.summary,
  ]
    .map((value) => normalizeLessonText(value || ''))
    .find(looksHelpfulLessonText);

  const title = nearestSection?.title || nearestMoment?.title;
  const timestampLabel = nearestSection?.timestampLabel || nearestMoment?.timestampLabel;

  if (title && readableDescription) {
    return `${title}: ${cleanClipDescription(readableDescription)}`;
  }

  if (title) {
    return buildLessonFocusSentence(title, timestampLabel);
  }

  return readableDescription ? cleanClipDescription(readableDescription) : null;
}

function buildPreferredLessonClip(videoId: string, preferredTimestamp?: number | null): VideoClipInfo | null {
  const video = getPublishedReadyVideoByFolderId(videoId);
  if (!video) {
    return null;
  }

  const videoDir = resolveVideoDirectory(video);
  if (!videoDir) {
    return null;
  }

  const lesson = readVideoLesson(videoDir);
  const lessonForClip = lesson && lessonHasUsableChatContent(lesson) ? lesson : null;
  const targetTimestamp = typeof preferredTimestamp === 'number' && Number.isFinite(preferredTimestamp)
    ? preferredTimestamp
    : null;

  const recommendedMoment = targetTimestamp !== null
    ? lessonForClip?.recommendedMoments
        .slice()
        .sort((a, b) => Math.abs(a.timestamp - targetTimestamp) - Math.abs(b.timestamp - targetTimestamp))[0]
    : lessonForClip?.recommendedMoments?.[0];

  const startTime = Math.max(0, recommendedMoment?.timestamp ?? targetTimestamp ?? 0);
  const description = getLessonMomentDescription(videoId, startTime)
    || (lessonForClip?.summary && looksHelpfulLessonText(lessonForClip.summary)
      ? cleanClipDescription(lessonForClip.summary)
      : null)
    || `Start with the mentor's explanation in ${video.title || videoId}.`;

  return {
    videoId,
    videoTitle: video.title || videoId,
    startTime: Math.max(0, startTime - 10),
    endTime: Math.max(startTime + 60, startTime + 45),
    description,
    watchLink: buildWatchLink(videoId, Math.max(0, startTime - 10)),
    lessonLink: buildLessonLink(videoId),
  };
}

function toTranscriptSource(result: RankedTranscriptResult): TCMSearchResult {
  return {
    type: 'transcript',
    id: `faiss-${result.videoId}-${result.start}`,
    title: result.videoTitle,
    content: result.text,
    source: `Video @ ${formatTimestamp(result.start)}`,
    timestamp: result.start,
    videoId: result.videoId,
  };
}

function getLessonSources(videoId: string): TCMSearchResult[] {
  const video = getPublishedReadyVideoByFolderId(videoId);
  if (!video) {
    return [];
  }

  const videoDir = resolveVideoDirectory(video);
  if (!videoDir) {
    return [];
  }

  const lesson = readVideoLesson(videoDir);
  if (!lesson || !lessonHasUsableChatContent(lesson)) {
    return [];
  }

  const sources: TCMSearchResult[] = [];
  const summary = looksHelpfulLessonText(lesson.summary)
    ? cleanClipDescription(lesson.summary)
    : '';
  const focusAreas = buildLessonFocusAreas(lesson);
  const mentorNotes = buildTutorPackMentorNotes(lesson);
  const ruleNotes = buildTutorPackRuleNotes(lesson);
  const coachingPrompts = buildTutorPackCoachingPrompts(lesson);

  if (summary) {
    sources.push({
      type: 'document',
      id: `lesson-${videoId}-overview`,
      title: `${lesson.videoTitle || video.title || videoId} lesson overview`,
      content: summary,
      source: 'Lesson guide',
    });
  }

  if (mentorNotes) {
    sources.push({
      type: 'document',
      id: `lesson-${videoId}-mentor`,
      title: `${lesson.videoTitle || video.title || videoId} mentor notes`,
      content: mentorNotes,
      source: 'Tutor pack',
    });
  }

  if (ruleNotes) {
    sources.push({
      type: 'document',
      id: `lesson-${videoId}-rules`,
      title: `${lesson.videoTitle || video.title || videoId} chart reading rules`,
      content: ruleNotes,
      source: 'Tutor pack',
    });
  }

  if (coachingPrompts) {
    sources.push({
      type: 'document',
      id: `lesson-${videoId}-coaching`,
      title: `${lesson.videoTitle || video.title || videoId} coaching prompts`,
      content: coachingPrompts,
      source: 'Tutor pack',
    });
  }

  if (!mentorNotes && focusAreas.length > 0) {
    sources.push({
      type: 'document',
      id: `lesson-${videoId}-focus`,
      title: `${lesson.videoTitle || video.title || videoId} lesson focus areas`,
      content: focusAreas.join(' '),
      source: 'Lesson guide',
    });
  }

  if (sources.length > 0) {
    return sources;
  }

  if (isLessonUsableForChat(lesson)) {
    return [{
      type: 'document',
      id: `lesson-${videoId}`,
      title: `${lesson.videoTitle || video.title || videoId} lesson guide`,
      content: lesson.summary,
      source: 'Lesson guide',
    }];
  }

  return [];
}

async function rankTranscriptResults(params: {
  query: string;
  preferredVideoId?: string;
  preferredPlaylistId?: number | string | null;
  preferredTimestamp?: number | null;
  mode: TCMChatMode;
}): Promise<{ results: RankedTranscriptResult[]; resolvedPreferredVideoId: string | null }> {
  const { query, preferredVideoId, preferredPlaylistId, preferredTimestamp, mode } = params;
  const faissResults = await searchFAISS(query, 8);
  const resolvedPreferredVideoId = preferredVideoId ? resolveVideoId(preferredVideoId) ?? preferredVideoId : null;
  const resolvedPreferredPlaylistId = parsePreferredPlaylistId(preferredPlaylistId);
  const targetTimestamp = typeof preferredTimestamp === 'number' && Number.isFinite(preferredTimestamp)
    ? preferredTimestamp
    : null;

  const prioritizedResults = faissResults
    .map((result) => {
      const video = getPublishedReadyVideoByFolderId(result.videoId);
      const videoTitle = video?.title || result.videoId;
      let rankScore = result.score;

      if (resolvedPreferredVideoId && result.videoId === resolvedPreferredVideoId) {
        rankScore += mode === 'lesson' ? 0.45 : 0.2;

        if (targetTimestamp !== null) {
          const delta = Math.abs(result.start - targetTimestamp);
          if (delta <= 45) {
            rankScore += mode === 'lesson' ? 0.18 : 0.12;
          } else if (delta <= 180) {
            rankScore += mode === 'lesson' ? 0.1 : 0.06;
          }
        }
      }

      if (resolvedPreferredPlaylistId && video) {
        const memberships = getVideoPlaylistMembership(video.id);
        if (memberships.some((membership) => membership.playlist_id === resolvedPreferredPlaylistId)) {
          rankScore += mode === 'lesson' ? 0.14 : 0.08;
        }
      }

      const startTime = Math.max(0, result.start - 10);
      const endTime = Math.max(result.end, result.start + 45);

      return {
        ...result,
        rankScore,
        videoTitle,
        watchLink: buildWatchLink(result.videoId, startTime),
        lessonLink: buildLessonLink(result.videoId),
        description: getLessonMomentDescription(result.videoId, result.start)
          || cleanClipDescription(result.text.slice(0, 150))
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);

  return { results: prioritizedResults, resolvedPreferredVideoId };
}

function buildBoundaryAwarePrimaryClip(
  boundaryMatch: FAISSResult | null,
  transcriptResults: RankedTranscriptResult[]
): VideoClipInfo | null {
  if (!boundaryMatch) {
    return null;
  }

  const video = getPublishedReadyVideoByFolderId(boundaryMatch.videoId);
  const fallbackResult = transcriptResults.find((result) => result.videoId === boundaryMatch.videoId);
  const videoTitle = video?.title || fallbackResult?.videoTitle || boundaryMatch.videoId;
  const description = getLessonMomentDescription(boundaryMatch.videoId, boundaryMatch.start)
    || fallbackResult?.description
    || cleanClipDescription(boundaryMatch.text.slice(0, 150));

  return buildClipCandidate({
    videoId: boundaryMatch.videoId,
    videoTitle,
    startTime: boundaryMatch.start - 10,
    endTime: boundaryMatch.end,
    description,
    relevanceScore: boundaryMatch.score,
    source: 'faiss-boundary',
  });
}

function buildRecommendedClips(
  results: RankedTranscriptResult[],
  resolvedPreferredVideoId: string | null,
  mode: TCMChatMode,
  preferredTimestamp?: number | null,
  precisePrimaryClip?: VideoClipInfo | null
): VideoClipInfo[] {
  const prioritized = mode === 'lesson' && resolvedPreferredVideoId
    ? [
        ...results.filter((result) => result.videoId === resolvedPreferredVideoId),
        ...results.filter((result) => result.videoId !== resolvedPreferredVideoId)
      ]
    : results;

  const recommended: VideoClipInfo[] = [];

  const pushIfDistinct = (clip: VideoClipInfo | null) => {
    if (!clip) {
      return;
    }

    const duplicate = recommended.some((existing) => clipsReferenceSameMoment(existing, clip));
    if (!duplicate) {
      recommended.push(clip);
    }
  };

  pushIfDistinct(precisePrimaryClip ?? null);

  for (const result of prioritized) {
    pushIfDistinct(buildClipCandidate({
      videoId: result.videoId,
      videoTitle: result.videoTitle,
      startTime: result.start - 10,
      endTime: Math.max(result.end, result.start + 45),
      description: result.description,
      relevanceScore: result.rankScore,
      source: 'faiss-segment',
    }));

    if (recommended.length >= 3) {
      break;
    }
  }

  if (mode === 'lesson' && resolvedPreferredVideoId) {
    const hasCurrentLessonClip = recommended.some((clip) => clip.videoId === resolvedPreferredVideoId);
    if (!hasCurrentLessonClip) {
      const preferredLessonClip = buildPreferredLessonClip(resolvedPreferredVideoId, preferredTimestamp);
      if (preferredLessonClip) {
        return [preferredLessonClip, ...recommended].slice(0, 3);
      }
    }
  }

  return recommended.slice(0, 3);
}

function buildFrameReferences(results: RankedTranscriptResult[], clips: VideoClipInfo[]) {
  return clips.slice(0, 3).flatMap((clip) => {
    const nearestFrame = findFramesNearTimestamp(clip.videoId, clip.startTime, 90)[0];
    if (!nearestFrame) {
      return [];
    }

    const relatedTranscript = results.find(
      (result) => result.videoId === clip.videoId && Math.abs(result.start - clip.startTime) <= 90
    );

    return [{
      videoId: clip.videoId,
      videoTitle: clip.videoTitle,
      frameNumber: nearestFrame.frameNumber,
      timestamp: nearestFrame.timestamp,
      timestampFormatted: nearestFrame.timestampFormatted,
      transcriptText: relatedTranscript?.text.slice(0, 200) || clip.description || ''
    }];
  });
}

function buildContext(params: {
  query: string;
  transcriptResults: RankedTranscriptResult[];
  mode: TCMChatMode;
  resolvedPreferredVideoId: string | null;
}): AssembledChatContext {
  const { query, transcriptResults, mode, resolvedPreferredVideoId } = params;
  const searchedSkills = searchTCMSkills(query, 4).map((skill) => ({
    type: 'skill' as const,
    id: `skill-${skill.id}`,
    title: skill.name,
    content: skill.description,
    source: `Skill #${skill.id}`,
  }));

  const lessonLinkedSkills = mode === 'lesson' && resolvedPreferredVideoId
    ? getVideoLinkedSkillsByFolderId(resolvedPreferredVideoId, 4)
        .filter((skill) => searchedSkills.length === 0 || skillMatchesQuery(skill, query))
        .map((skill) => ({
          type: 'skill' as const,
          id: `skill-${skill.id}`,
          title: skill.name,
          content: skill.description,
          source: 'Linked to this lesson',
        }))
    : [];

  const skills = Array.from(
    new Map(
      [...searchedSkills, ...lessonLinkedSkills].map((skill) => [skill.id, skill])
    ).values()
  ).slice(0, 6);

  const lessonDocuments = mode === 'lesson' && resolvedPreferredVideoId
    ? getLessonSources(resolvedPreferredVideoId)
    : [];

  const relatedLessonDocuments = Array.from(new Set(transcriptResults.map((result) => result.videoId)))
    .filter((videoId) => videoId !== resolvedPreferredVideoId)
    .slice(0, 3)
    .flatMap((videoId) => getLessonSources(videoId));

  const documents = [
    ...lessonDocuments,
    ...searchDocumentParagraphs(query, 3).map((document, index) => ({
      type: 'document' as const,
      id: `doc-${index}`,
      title: `${document.doc} - ${document.sectionTitle}`,
      content: document.paragraph,
      source: `Study material · ${document.sectionTitle}`,
    })),
    ...relatedLessonDocuments
  ];

  const prioritizedTranscripts = mode === 'lesson' && resolvedPreferredVideoId
    ? [
        ...transcriptResults.filter((result) => result.videoId === resolvedPreferredVideoId),
        ...transcriptResults.filter((result) => result.videoId !== resolvedPreferredVideoId)
      ]
    : transcriptResults;

  const transcripts = prioritizedTranscripts.slice(0, 5).map(toTranscriptSource);

  return {
    query,
    skills,
    documents,
    transcripts,
    totalResults: skills.length + documents.length + transcripts.length,
  };
}

export async function buildChatResponsePayload(body: ChatRequestBody): Promise<ChatResponsePayload> {
  const retrievalStartedAt = Date.now();
  const inferredPreferredVideoId = body.preferredVideoId ? null : inferPreferredVideoIdFromQuery(body.message);
  const effectivePreferredVideoId = body.preferredVideoId ?? inferredPreferredVideoId ?? undefined;
  const mode = body.chatMode === 'lesson' || Boolean(inferredPreferredVideoId) ? 'lesson' : 'knowledge';
  const { results: transcriptResults, resolvedPreferredVideoId } = await rankTranscriptResults({
    query: body.message,
    preferredVideoId: effectivePreferredVideoId,
    preferredPlaylistId: body.preferredPlaylistId,
    preferredTimestamp: body.preferredTimestamp,
    mode
  });
  const boundaryMatch = await searchFAISSWithBoundary(body.message, 0.4, 300, 60);
  const precisePrimaryClip = (!resolvedPreferredVideoId || boundaryMatch?.videoId === resolvedPreferredVideoId)
    ? buildBoundaryAwarePrimaryClip(boundaryMatch, transcriptResults)
    : null;

  const context = buildContext({
    query: body.message,
    transcriptResults,
    mode,
    resolvedPreferredVideoId
  });

  const stabilizedRecommendedClips = buildRecommendedClips(
    transcriptResults,
    resolvedPreferredVideoId,
    mode,
    body.preferredTimestamp,
    precisePrimaryClip
  );
  const primaryClip = stabilizedRecommendedClips[0];
  const frames = buildFrameReferences(transcriptResults, stabilizedRecommendedClips);
  const chartData = generateChartDataForQuery(body.message);
  const sources = [
    ...context.transcripts.slice(0, 3),
    ...context.documents.slice(0, 2),
    ...context.skills.slice(0, 2)
  ].slice(0, 6);
  const structuredAnswer = buildStructuredCoachBrief({
    context,
    mode,
    primaryClip
  });

  return {
    context,
    structuredAnswer,
    sources,
    frames,
    chartData,
    videoClip: primaryClip,
    primaryClip,
    recommendedClips: stabilizedRecommendedClips,
    watchLink: primaryClip?.watchLink,
    lessonLink: primaryClip?.lessonLink,
    contextSize: context.totalResults,
    retrievalMs: Date.now() - retrievalStartedAt,
    mode
  };
}

function buildUserPrompt(message: string, context: AssembledChatContext, mode: TCMChatMode): string {
  const allResults = [...context.skills, ...context.documents, ...context.transcripts];
  return buildContextAssemblyPrompt(mode)
    .replace('{context}', formatContextForLLM(allResults))
    .replace('{question}', message);
}

function buildConversationHistory(
  history: Array<{ role: string; content: string }> | undefined,
  message: string,
  context: AssembledChatContext,
  mode: TCMChatMode
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  if (history && history.length > 0) {
    for (const item of history.slice(-20)) {
      messages.push({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: buildUserPrompt(message, context, mode)
  });

  return messages;
}

function buildOpenAIMessages(
  history: Array<{ role: string; content: string }> | undefined,
  message: string,
  context: AssembledChatContext,
  mode: TCMChatMode
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [
    {
      role: 'system',
      content: buildSystemPrompt(mode),
    },
    ...buildConversationHistory(history, message, context, mode),
  ];
}

function extractOpenAIText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }

      return '';
    })
    .join('');
}

async function generateOpenAIResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
  signal: AbortSignal;
}): Promise<LLMResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY!}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_completion_tokens: 1024,
      messages: buildOpenAIMessages(params.history, params.message, params.context, params.mode),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const assistantMessage = extractOpenAIText(data.choices?.[0]?.message?.content);
  if (!assistantMessage) {
    throw new Error('No response from API');
  }

  return {
    response: normalizeAssistantResponse(assistantMessage),
    usedLLM: true,
    generationMs: 0,
    model: CHAT_MODEL,
  };
}

async function generateAnthropicResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
  signal: AbortSignal;
}): Promise<LLMResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(params.mode),
      messages: buildConversationHistory(params.history, params.message, params.context, params.mode),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', errorText);
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json() as {
    content?: Array<{ text?: string }>;
  };
  const assistantMessage = data.content?.[0]?.text;

  if (!assistantMessage) {
    throw new Error('No response from API');
  }

  return {
    response: normalizeAssistantResponse(assistantMessage),
    usedLLM: true,
    generationMs: 0,
    model: CHAT_MODEL,
  };
}

async function streamOpenAIResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
  signal: AbortSignal;
  onToken: (delta: string) => void;
}): Promise<LLMResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY!}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_completion_tokens: 1024,
      stream: true,
      messages: buildOpenAIMessages(params.history, params.message, params.context, params.mode),
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    console.error('OpenAI stream API error:', errorText);
    throw new Error(`API returned ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n\n')) {
      const separatorIndex = buffer.indexOf('\n\n');
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      if (!rawEvent.trim()) continue;

      let dataPayload = '';
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('data:')) {
          dataPayload += line.slice(5).trim();
        }
      }

      if (!dataPayload || dataPayload === '[DONE]') {
        continue;
      }

      const parsed = JSON.parse(dataPayload) as {
        choices?: Array<{
          delta?: {
            content?: string;
          };
        }>;
      };

      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        fullResponse += delta;
        params.onToken(delta);
      }
    }
  }

  return {
    response: normalizeAssistantResponse(fullResponse),
    usedLLM: true,
    generationMs: 0,
    model: CHAT_MODEL,
  };
}

async function streamAnthropicResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
  signal: AbortSignal;
  onToken: (delta: string) => void;
}): Promise<LLMResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(params.mode),
      messages: buildConversationHistory(params.history, params.message, params.context, params.mode),
      stream: true
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    console.error('Anthropic stream API error:', errorText);
    throw new Error(`API returned ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n\n')) {
      const separatorIndex = buffer.indexOf('\n\n');
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      if (!rawEvent.trim()) continue;

      let eventName = 'message';
      let dataPayload = '';

      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataPayload += line.slice(5).trim();
        }
      }

      if (!dataPayload) continue;
      const parsed = JSON.parse(dataPayload) as {
        delta?: { text?: string };
      };

      if (eventName === 'content_block_delta' && parsed.delta?.text) {
        fullResponse += parsed.delta.text;
        params.onToken(parsed.delta.text);
      }
    }
  }

  return {
    response: normalizeAssistantResponse(fullResponse),
    usedLLM: true,
    generationMs: 0,
    model: CHAT_MODEL,
  };
}

export async function generateLLMResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
}): Promise<LLMResult> {
  const generationStartedAt = Date.now();

  if (!USE_LLM) {
    return {
      response: normalizeAssistantResponse(generateContextBasedResponse(params.context)),
      usedLLM: false,
      generationMs: Date.now() - generationStartedAt,
      model: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const providerResult = CHAT_PROVIDER === 'openai'
      ? await generateOpenAIResponse({ ...params, signal: controller.signal })
      : CHAT_PROVIDER === 'anthropic'
        ? await generateAnthropicResponse({ ...params, signal: controller.signal })
        : null;

    if (!providerResult) {
      throw new Error('No supported LLM provider configured');
    }

    return {
      ...providerResult,
      generationMs: Date.now() - generationStartedAt,
    };
  } catch (error) {
    console.error('LLM generation error:', error);
    return {
      response: normalizeAssistantResponse(generateContextBasedResponse(params.context)),
      usedLLM: false,
      generationMs: Date.now() - generationStartedAt,
      model: CHAT_MODEL
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function streamLLMResponse(params: {
  message: string;
  context: AssembledChatContext;
  history?: Array<{ role: string; content: string }>;
  mode: TCMChatMode;
  onToken: (delta: string) => void;
}): Promise<LLMResult> {
  const generationStartedAt = Date.now();

  if (!USE_LLM) {
    const fallback = normalizeAssistantResponse(generateContextBasedResponse(params.context));
    params.onToken(fallback);
    return {
      response: fallback,
      usedLLM: false,
      generationMs: Date.now() - generationStartedAt,
      model: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const providerResult = CHAT_PROVIDER === 'openai'
      ? await streamOpenAIResponse({ ...params, signal: controller.signal })
      : CHAT_PROVIDER === 'anthropic'
        ? await streamAnthropicResponse({ ...params, signal: controller.signal })
        : null;

    if (!providerResult) {
      throw new Error('No supported LLM provider configured');
    }

    return {
      ...providerResult,
      generationMs: Date.now() - generationStartedAt,
    };
  } catch (error) {
    console.error('LLM stream generation error:', error);
    const fallback = normalizeAssistantResponse(generateContextBasedResponse(params.context));
    params.onToken(fallback);
    return {
      response: fallback,
      usedLLM: false,
      generationMs: Date.now() - generationStartedAt,
      model: CHAT_MODEL
    };
  } finally {
    clearTimeout(timeout);
  }
}
