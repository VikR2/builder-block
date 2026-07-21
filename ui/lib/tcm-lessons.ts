import fs from 'fs';
import path from 'path';

export interface LessonSection {
  title: string;
  timestamp: number;
  timestampLabel: string;
  startTime: number;
  endTime: number;
  summary: string;
  citation: string;
  transcriptExcerpt: string;
}

export interface LessonQuality {
  score: number;
  flags: string[];
}

export interface RecommendedMoment {
  title: string;
  timestamp: number;
  timestampLabel: string;
  reason: string;
}

export interface TutorPackCoreConcept {
  title: string;
  summary: string;
  timestampLabel?: string;
}

export interface TutorPackRule {
  ifYouSee: string;
  thenExpect: string;
  because: string;
}

export interface TutorPackGlossaryItem {
  term: string;
  definition: string;
}

export interface VideoTutorPack {
  mentorApproach: string;
  prerequisites: string[];
  teachingSequence: string[];
  coreConcepts: TutorPackCoreConcept[];
  commonMisconceptions: string[];
  chartReadingRules: string[];
  ifYouSeeThisThenThat: TutorPackRule[];
  diagnosticQuestions: string[];
  practicePrompts: string[];
  glossary: TutorPackGlossaryItem[];
}

export interface VideoLesson {
  videoId: string;
  videoTitle: string;
  generatedAt?: string;
  status: 'ready' | 'fallback' | 'needs_review';
  generationMode: 'hybrid-ai' | 'deterministic-fallback';
  quality: LessonQuality;
  summary: string;
  keyTakeaways: string[];
  recommendedMoments: RecommendedMoment[];
  suggestedQuestions: string[];
  sections: LessonSection[];
  tutorPack?: VideoTutorPack;
}

const LOW_SIGNAL_PREFIXES = [
  /^(all right|alright)\b/i,
  /^you know\b/i,
  /^so\b/i,
  /^well\b/i,
  /^okay\b/i,
  /^ok\b/i,
  /^um\b/i,
  /^uh\b/i,
];

function normalizeText(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLowSignalPrefix(text: string): boolean {
  const normalized = normalizeText(text);
  return LOW_SIGNAL_PREFIXES.some((pattern) => pattern.test(normalized));
}

function isConceptTitle(title: string): boolean {
  const normalized = normalizeText(title);
  if (!normalized || normalized.length < 6 || normalized.length > 80) {
    return false;
  }

  if (/[.?!]$/.test(normalized)) {
    return false;
  }

  if (normalized.split(/\s+/).length > 10) {
    return false;
  }

  return !hasLowSignalPrefix(normalized);
}

function inferLegacyLessonQuality(rawLesson: Partial<VideoLesson>): LessonQuality {
  const flags: string[] = [];

  if (hasLowSignalPrefix(rawLesson.summary || '')) {
    flags.push('summary_low_signal');
  }

  const takeaways = rawLesson.keyTakeaways || [];
  if (takeaways.some((item) => hasLowSignalPrefix(item))) {
    flags.push('takeaway_low_signal');
  }

  const questions = rawLesson.suggestedQuestions || [];
  if (questions.some((question) => hasLowSignalPrefix(question))) {
    flags.push('question_low_signal');
  }

  const sections = rawLesson.sections || [];
  if (sections.some((section) => !isConceptTitle(section.title))) {
    flags.push('section_title_fragment');
  }

  const score = Math.max(0, 1 - flags.length * 0.22);
  return { score, flags };
}

function coerceTutorPack(rawTutorPack: Partial<VideoTutorPack> | null | undefined): VideoTutorPack | undefined {
  if (!rawTutorPack) {
    return undefined;
  }

  const rawCoreConcepts = Array.isArray(rawTutorPack.coreConcepts) ? rawTutorPack.coreConcepts : [];
  const rawRules = Array.isArray(rawTutorPack.ifYouSeeThisThenThat) ? rawTutorPack.ifYouSeeThisThenThat : [];
  const rawGlossary = Array.isArray(rawTutorPack.glossary) ? rawTutorPack.glossary : [];
  const rawPrerequisites = Array.isArray(rawTutorPack.prerequisites) ? rawTutorPack.prerequisites : [];
  const rawTeachingSequence = Array.isArray(rawTutorPack.teachingSequence) ? rawTutorPack.teachingSequence : [];
  const rawMisconceptions = Array.isArray(rawTutorPack.commonMisconceptions) ? rawTutorPack.commonMisconceptions : [];
  const rawChartRules = Array.isArray(rawTutorPack.chartReadingRules) ? rawTutorPack.chartReadingRules : [];
  const rawDiagnosticQuestions = Array.isArray(rawTutorPack.diagnosticQuestions) ? rawTutorPack.diagnosticQuestions : [];
  const rawPracticePrompts = Array.isArray(rawTutorPack.practicePrompts) ? rawTutorPack.practicePrompts : [];

  const coreConcepts = rawCoreConcepts
    .map((concept) => ({
      title: normalizeText(concept.title || ''),
      summary: normalizeText(concept.summary || ''),
      timestampLabel: normalizeText(concept.timestampLabel || '') || undefined,
    }))
    .filter((concept) => concept.title && concept.summary);

  const rules = rawRules
    .map((rule) => ({
      ifYouSee: normalizeText(rule.ifYouSee || ''),
      thenExpect: normalizeText(rule.thenExpect || ''),
      because: normalizeText(rule.because || ''),
    }))
    .filter((rule) => rule.ifYouSee && rule.thenExpect && rule.because);

  const glossary = rawGlossary
    .map((item) => ({
      term: normalizeText(item.term || ''),
      definition: normalizeText(item.definition || ''),
    }))
    .filter((item) => item.term && item.definition);

  const tutorPack: VideoTutorPack = {
    mentorApproach: normalizeText(rawTutorPack.mentorApproach || ''),
    prerequisites: rawPrerequisites.map(normalizeText).filter(Boolean),
    teachingSequence: rawTeachingSequence.map(normalizeText).filter(Boolean),
    coreConcepts,
    commonMisconceptions: rawMisconceptions.map(normalizeText).filter(Boolean),
    chartReadingRules: rawChartRules.map(normalizeText).filter(Boolean),
    ifYouSeeThisThenThat: rules,
    diagnosticQuestions: rawDiagnosticQuestions.map(normalizeText).filter(Boolean),
    practicePrompts: rawPracticePrompts.map(normalizeText).filter(Boolean),
    glossary,
  };

  const hasContent = Boolean(tutorPack.mentorApproach)
    || tutorPack.prerequisites.length > 0
    || tutorPack.teachingSequence.length > 0
    || tutorPack.coreConcepts.length > 0
    || tutorPack.commonMisconceptions.length > 0
    || tutorPack.chartReadingRules.length > 0
    || tutorPack.ifYouSeeThisThenThat.length > 0
    || tutorPack.diagnosticQuestions.length > 0
    || tutorPack.practicePrompts.length > 0
    || tutorPack.glossary.length > 0;

  return hasContent ? tutorPack : undefined;
}

function coerceLesson(rawLesson: Partial<VideoLesson>): VideoLesson {
  const inferredQuality = rawLesson.quality || inferLegacyLessonQuality(rawLesson);
  const inferredStatus = rawLesson.status
    || (inferredQuality.score >= 0.76 ? 'ready' : inferredQuality.score >= 0.5 ? 'fallback' : 'needs_review');
  const generationMode = rawLesson.generationMode || 'deterministic-fallback';

  return {
    videoId: rawLesson.videoId || '',
    videoTitle: rawLesson.videoTitle || rawLesson.videoId || 'Lesson',
    generatedAt: rawLesson.generatedAt,
    status: inferredStatus,
    generationMode,
    quality: inferredQuality,
    summary: normalizeText(rawLesson.summary || ''),
    keyTakeaways: (rawLesson.keyTakeaways || []).map(normalizeText).filter(Boolean),
    recommendedMoments: (rawLesson.recommendedMoments || []).map((moment) => ({
      ...moment,
      title: normalizeText(moment.title),
      reason: normalizeText(moment.reason),
    })),
    suggestedQuestions: (rawLesson.suggestedQuestions || []).map(normalizeText).filter(Boolean),
    sections: (rawLesson.sections || []).map((section) => ({
      ...section,
      title: normalizeText(section.title),
      summary: normalizeText(section.summary),
      citation: normalizeText(section.citation),
      transcriptExcerpt: normalizeText(section.transcriptExcerpt),
    })),
    tutorPack: coerceTutorPack(rawLesson.tutorPack),
  };
}

export function isLessonPresentationReady(lesson: VideoLesson | null): boolean {
  return Boolean(lesson && lesson.status === 'ready' && lesson.quality.score >= 0.76);
}

export function isLessonUsableForChat(lesson: VideoLesson | null): boolean {
  return Boolean(lesson && lesson.status === 'ready' && lesson.quality.score >= 0.7);
}

export function getLessonPath(videoDir: string): string {
  return path.join(videoDir, 'lesson.json');
}

export function readVideoLesson(videoDir: string): VideoLesson | null {
  const lessonPath = getLessonPath(videoDir);
  if (!fs.existsSync(lessonPath)) {
    return null;
  }

  try {
    return coerceLesson(JSON.parse(fs.readFileSync(lessonPath, 'utf-8')) as Partial<VideoLesson>);
  } catch {
    return null;
  }
}
