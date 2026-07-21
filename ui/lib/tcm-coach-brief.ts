import { TCMSearchResult } from './tcm-db';
import { VideoClipInfo } from './tcm-video-clips';

export interface StructuredCoachBrief {
  lead: string;
  bullets: string[];
  bestClipReason?: string;
  broaderContext?: string;
  sources: string[];
}

export interface CoachBriefContext {
  query: string;
  skills: TCMSearchResult[];
  documents: TCMSearchResult[];
  transcripts: TCMSearchResult[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
  'i', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'what', 'when', 'where', 'why', 'with', 'you'
]);

const BUILT_IN_LEADS: Array<{ pattern: RegExp; text: string }> = [
  {
    pattern: /\bbook(?:\s+building)?\b/i,
    text: 'Book building is the process of turning submitted orders into real liquidity once the matching window trades back through those prices. In TCM terms, the book is the overlap between the submission range and the matching activity that proves buyers and sellers actually paired off there.'
  },
  {
    pattern: /\bsubmission range\b|\bsr\b/i,
    text: 'The Submission Range is the afternoon window where institutions place large orders, but those orders are just interest until the market comes back and matches them. That is why TCM separates submitted prices from true liquidity.'
  },
  {
    pattern: /\bmatching window\b/i,
    text: 'The matching window is the session where previously submitted orders find counterparties and become real liquidity. If price never trades back through those submitted prices, the orders stay unmatched and the market still has work to do there.'
  },
  {
    pattern: /\b(order\s+fulfillment|matched orders|unmatched orders)\b/i,
    text: 'Order fulfillment is the full path from submission, to matching, to filling, to distribution. Matched orders create the book, while unmatched orders often leave behind levels the market still needs to revisit.'
  },
  {
    pattern: /\bbias\b/i,
    text: 'In TCM, bias comes from combining the key level with the type of delivery at that level. You are not guessing direction in isolation; you are reading where liquidity sits and whether price swept it or ran through it.'
  }
];

const BUILT_IN_BULLETS: Array<{ pattern: RegExp; bullets: string[] }> = [
  {
    pattern: /\bbook(?:\s+building)?\b/i,
    bullets: [
      'Submitted orders show intent, but they do not become liquidity until the matching window trades back through them.',
      'The book is the overlap between the submission range and the matching activity that proves buyers and sellers paired off there.',
      'Once the book is formed, its high, low, and EQ become the levels you monitor for later fills, sweeps, and objectives.',
      'If price leaves the book after matching, the profitable side usually tells you where the next protected liquidity is resting.'
    ]
  },
  {
    pattern: /\bsubmission range\b|\bsr\b/i,
    bullets: [
      'The submission range marks where institutions placed large orders during the afternoon window.',
      'Those prices are only potential interest until the market comes back and matches them in the later session.',
      'You compare the submission range with the matching window to see which submitted prices actually became part of the book.'
    ]
  },
  {
    pattern: /\bmatching window\b/i,
    bullets: [
      'The matching window is where previously submitted orders find counterparties and become real liquidity.',
      'If price never trades back through the submitted levels during this window, those orders stay unmatched.',
      'That distinction is why TCM separates submitted prices from the book that can actually be filled.'
    ]
  },
  {
    pattern: /\b(order\s+fulfillment|matched orders|unmatched orders)\b/i,
    bullets: [
      'Order fulfillment moves through submission, matching, filling, and distribution.',
      'Matched orders create the book and tell you where liquidity is active right now.',
      'Unmatched orders often leave behind unfinished business that price may return to fill later.'
    ]
  },
  {
    pattern: /\bbias\b/i,
    bullets: [
      'Bias comes from the key level plus the kind of delivery that happens at that level.',
      'A sweep suggests reversal conditions, while a run that leaves an imbalance open suggests continuation.',
      'You use that delivery read together with book levels to decide whether the next objective sits above or below price.'
    ]
  }
];

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/^-{3,}$/gm, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\*\*From [^:]+:\*\*\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripQuotes(text: string): string {
  return text.replace(/^"+|"+$/g, '').trim();
}

function sentenceSplit(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeWhitespace(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token))
      ?? []
  );
}

function scoreCandidate(candidate: string, queryTokens: Set<string>): number {
  const candidateTokens = tokenSet(candidate);
  let score = candidateTokens.size / 10;

  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      score += 2;
    }
  }

  if (candidate.includes(':')) {
    score -= 0.2;
  }

  return score;
}

function looksReadable(text: string): boolean {
  if (!text) {
    return false;
  }

  if (text.includes('|')) {
    return false;
  }

  const normalized = normalizeWhitespace(text);
  if (normalized.length < 30) {
    return false;
  }

  if (/^video:\s/i.test(normalized) || /https?:\/\/|youtu\.be/i.test(normalized)) {
    return false;
  }

  if (/\b(host|guest):\b/i.test(normalized)) {
    return false;
  }

  if (/\b(i said|i don't remember|let'?s just say|what do you think|go ahead|thank you)\b/i.test(normalized)) {
    return false;
  }

  if (/\bwhich video do you talk more about\b/i.test(normalized)) {
    return false;
  }

  return !/^(all right|alright|okay|ok|you know|so|well)\b/i.test(normalized);
}

function titleToQuestion(title: string): string {
  const normalized = normalizeWhitespace(title)
    .replace(/[.?!]+$/g, '')
    .replace(/^(the)\s+/i, '')
    .trim();

  if (!normalized) {
    return 'Which part of this lesson should I focus on first?';
  }

  return `How should I use ${normalized.toLowerCase()} in practice?`;
}

function buildLead(query: string, documents: TCMSearchResult[], transcripts: TCMSearchResult[]): string {
  for (const entry of BUILT_IN_LEADS) {
    if (entry.pattern.test(query)) {
      return entry.text;
    }
  }

  const candidates = [
    ...documents.flatMap((document) => sentenceSplit(document.content)),
    ...transcripts.flatMap((transcript) => sentenceSplit(transcript.content))
  ].filter(looksReadable);

  return candidates[0]
    || 'This concept is best understood by focusing on where orders become real liquidity, how price moves away from that liquidity, and what that says about the next likely objective.';
}

function buildBulletCandidates(context: CoachBriefContext): string[] {
  const skillBullets = context.skills.map((skill) => normalizeWhitespace(skill.content));
  const documentBullets = context.documents.flatMap((document) => sentenceSplit(document.content));
  const transcriptBullets = context.transcripts.flatMap((transcript) => sentenceSplit(transcript.content));

  return [...skillBullets, ...documentBullets, ...transcriptBullets]
    .map((candidate) => stripQuotes(candidate))
    .filter(looksReadable);
}

function dedupeByNormalizedText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of items) {
    const normalized = normalizeWhitespace(item).toLowerCase();
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

function cleanBulletText(text: string): string {
  const normalized = normalizeWhitespace(text)
    .replace(/^[-*]\s+/, '')
    .replace(/^[0-9]+\.\s+/, '')
    .replace(/^["']|["']$/g, '');

  if (normalized.length <= 190) {
    return normalized;
  }

  return `${normalized.slice(0, 187).trimEnd()}...`;
}

function buildBullets(context: CoachBriefContext): string[] {
  for (const entry of BUILT_IN_BULLETS) {
    if (entry.pattern.test(context.query)) {
      return entry.bullets;
    }
  }

  const prioritizedLessonDocuments = [
    ...context.documents.filter((document) => /tutor pack/i.test(document.source)),
    ...context.documents.filter((document) => !/tutor pack/i.test(document.source)),
  ];

  const lessonDocumentBullets = dedupeByNormalizedText(
    prioritizedLessonDocuments
      .filter((document) => /lesson/i.test(document.title) || document.source === 'Lesson guide' || /tutor pack/i.test(document.source))
      .flatMap((document) => sentenceSplit(document.content))
      .filter(looksReadable)
      .map(cleanBulletText),
    4
  );

  if (lessonDocumentBullets.length > 0) {
    return lessonDocumentBullets;
  }

  const queryTokens = tokenSet(context.query);
  const ranked = buildBulletCandidates(context)
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, queryTokens)
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => cleanBulletText(item.candidate));

  return dedupeByNormalizedText(ranked, 4);
}

function buildBroaderContext(context: CoachBriefContext, mode: 'knowledge' | 'lesson'): string | undefined {
  if (mode !== 'lesson') {
    return undefined;
  }

  const broaderSkill = context.skills[0];
  if (broaderSkill?.title) {
    return `Broader TCM lens: ${normalizeWhitespace(broaderSkill.title)} helps explain how this lesson fits into the larger order-fulfillment model.`;
  }

  const relatedDocument = context.documents[1];
  if (relatedDocument?.title) {
    return `Broader context: ${normalizeWhitespace(relatedDocument.title)} reinforces the same idea from another angle.`;
  }

  return undefined;
}

function buildBestClipReason(primaryClip?: VideoClipInfo): string | undefined {
  if (!primaryClip?.description) {
    return undefined;
  }

  const cleaned = cleanBulletText(stripQuotes(primaryClip.description));
  if (!looksReadable(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function buildSourceLabels(context: CoachBriefContext): string[] {
  const labels = [
    ...context.documents.map((document) => document.title),
    ...context.transcripts.map((transcript) => transcript.title),
    ...context.skills.map((skill) => skill.title)
  ]
    .map((label) => normalizeWhitespace(label))
    .filter(Boolean);

  return dedupeByNormalizedText(labels, 5);
}

export function buildStructuredCoachBrief(params: {
  context: CoachBriefContext;
  mode: 'knowledge' | 'lesson';
  primaryClip?: VideoClipInfo;
}): StructuredCoachBrief {
  const { context, mode, primaryClip } = params;
  const lead = buildLead(context.query, context.documents, context.transcripts);
  const bullets = buildBullets(context);

  return {
    lead,
    bullets: bullets.length > 0
      ? bullets
      : [
          'Start with where the orders were submitted.',
          'Then confirm whether the matching window actually traded through those prices.',
          'Use the resulting liquidity map to frame bias and objectives.'
        ],
    bestClipReason: buildBestClipReason(primaryClip),
    broaderContext: buildBroaderContext(context, mode),
    sources: buildSourceLabels(context),
  };
}

export function renderStructuredCoachBrief(brief: StructuredCoachBrief): string {
  const lines = [brief.lead];

  if (brief.bullets.length > 0) {
    lines.push('');
    for (const bullet of brief.bullets) {
      lines.push(`- ${bullet}`);
    }
  }

  if (brief.bestClipReason) {
    lines.push('', `Best clip: ${brief.bestClipReason}`);
  }

  if (brief.broaderContext) {
    lines.push('', brief.broaderContext);
  }

  if (brief.sources.length > 0) {
    lines.push('', `Sources: ${brief.sources.join(' | ')}`);
  }

  return lines.join('\n').trim();
}

export function buildSuggestedQuestionsFromTitles(titles: string[]): string[] {
  const questions = titles
    .map(titleToQuestion)
    .filter(Boolean);

  return dedupeByNormalizedText(questions, 6);
}
