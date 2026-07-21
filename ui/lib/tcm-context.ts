import {
  searchTCMSkills,
  searchDocumentParagraphs,
  searchTranscripts,
  TCMSearchResult,
  formatTimestamp,
  getArchitectureDocuments,
  getTCMSkills,
} from './tcm-db';
import { buildStructuredCoachBrief, renderStructuredCoachBrief } from './tcm-coach-brief';

// Assembled context for answering a question
export interface AssembledContext {
  query: string;
  skills: TCMSearchResult[];
  documents: TCMSearchResult[];
  transcripts: TCMSearchResult[];
  totalResults: number;
}

// Assemble context from multiple sources for a query
export function assembleContext(query: string): AssembledContext {
  // Search each source
  const skillResults = searchTCMSkills(query, 5);
  const docResults = searchDocumentParagraphs(query, 5);
  const transcriptResults = searchTranscripts(query, 5);

  // Convert to TCMSearchResult format
  const skills: TCMSearchResult[] = skillResults.map(s => ({
    type: 'skill',
    id: `skill-${s.id}`,
    title: s.name,
    content: s.description,
    source: `Skill #${s.id}`,
  }));

  const documents: TCMSearchResult[] = docResults.map((d, i) => ({
    type: 'document',
    id: `doc-${i}`,
    title: d.doc,
    content: d.paragraph,
    source: 'Study Guide',
  }));

  const transcripts: TCMSearchResult[] = transcriptResults.map(t => ({
    type: 'transcript',
    id: `transcript-${t.videoId}-${t.segment.start}`,
    title: t.videoTitle,
    content: t.segment.text,
    source: `Video @ ${formatTimestamp(t.segment.start)}`,
    timestamp: t.segment.start,
    videoId: t.videoId,
  }));

  return {
    query,
    skills,
    documents,
    transcripts,
    totalResults: skills.length + documents.length + transcripts.length,
  };
}

// Get all available context (for general questions)
export function getFullContext(): {
  skillCount: number;
  docCount: number;
  topics: string[];
} {
  const skills = getTCMSkills();
  const docs = getArchitectureDocuments();

  // Extract main topics from skills
  const topics = [...new Set(skills.map(s => s.category))];

  return {
    skillCount: skills.length,
    docCount: docs.length,
    topics,
  };
}

// Built-in concept definitions for common TCM terms (used when no LLM)
const CONCEPT_DEFINITIONS: Record<string, string> = {
  'order matching': '**Order Matching** is the process where buy orders find their corresponding sell orders (counterparties). In TCM theory, this happens during the Asian session "matching window" when the previous day\'s submitted orders get paired up. Think of it like a dating app for orders - each buyer needs to find a seller, and vice versa.',
  'order fulfillment': '**Order Fulfillment** is the complete lifecycle of an institutional order: Submission → Matching → Filling → Distribution. Like Amazon delivering a package, orders go through stages from being placed to being completely filled.',
  'submission range': '**Submission Range (SR)** is the time window from 12:40 PM to 3:20 PM ET when large institutional orders get placed into the market. This is when "the book" starts building.',
  'book building': '**Book Building** is the process of orders accumulating on both the buy and sell side. The "book" represents the overlap between where orders were submitted (SR) and where they get matched (Asian session).',
  'matching window': '**Matching Window** is the Asian trading session when orders that were submitted during the previous day\'s SR find their counterparties. This is when order matching occurs.',
  'eq level': '**EQ Level** (Equilibrium) is the 50% midpoint of "the book" - essentially the average price where matched orders exist. Price tends to return to this level.',
  'bias': '**Bias** is the directional expectation determined by: Key Level + Delivery Type at Key Level = BIAS. A sweep at a key level suggests reversal, while a run suggests continuation.',
  'liquidity': '**Liquidity** in TCM refers to matched order pairs - places where both buyers and sellers have committed orders. Unmatched orders create "liquidity voids" that price may need to revisit.',
};

// Check if query matches a built-in concept
function getBuiltInDefinition(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  for (const [concept, definition] of Object.entries(CONCEPT_DEFINITIONS)) {
    if (lowerQuery.includes(concept) || concept.includes(lowerQuery.replace(/what is |explain |tell me about /gi, '').trim())) {
      return definition;
    }
  }
  return null;
}

// Generate a non-LLM response based on context
export function generateContextBasedResponse(context: AssembledContext): string {
  const { skills, documents, transcripts, query } = context;

  // Check if we have any results
  if (context.totalResults === 0) {
    return generateNoResultsResponse(query);
  }

  const brief = buildStructuredCoachBrief({
    context,
    mode: 'knowledge'
  });

  // Prefer the built-in definition when it is available because it gives the
  // cleanest top-line explanation for fallback answers.
  const builtInDef = getBuiltInDefinition(query);
  if (builtInDef) {
    return renderStructuredCoachBrief({
      ...brief,
      lead: builtInDef.replace(/\*\*/g, '')
    });
  }

  return renderStructuredCoachBrief(brief);
}

// Response when no results found
function generateNoResultsResponse(query: string): string {
  // Suggest related topics
  const suggestions = getSuggestions(query);

  let response = `I couldn't find specific information about "${query}" in the TCM knowledge base.\n\n`;
  response += '**Try searching for:**\n';

  for (const suggestion of suggestions) {
    response += `- ${suggestion}\n`;
  }

  response += '\n**Core TCM topics I can help with:**\n';
  response += '- Submission Range (SR)\n';
  response += '- Book Building\n';
  response += '- Order Matching & Filling\n';
  response += '- Liquidity concepts\n';
  response += '- Bias determination\n';

  return response;
}

// Get search suggestions based on the query
function getSuggestions(query: string): string[] {
  const suggestions: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Map common terms to better search terms
  const termMap: Record<string, string[]> = {
    'sr': ['Submission Range', 'SR levels'],
    'book': ['Book Building', 'order book'],
    'liquidity': ['liquidity', 'matched orders'],
    'bias': ['Bias Formula', 'directional bias'],
    'entry': ['entry rules', 'trade entry'],
    'stop': ['stop loss', 'risk management'],
    'target': ['profit target', 'take profit'],
    'session': ['trading sessions', 'Asian session'],
    'eq': ['EQ level', 'equilibrium'],
    'gap': ['gap days', 'unmatched orders'],
  };

  for (const [term, related] of Object.entries(termMap)) {
    if (lowerQuery.includes(term)) {
      suggestions.push(...related);
    }
  }

  // Default suggestions if none matched
  if (suggestions.length === 0) {
    suggestions.push('Submission Range', 'Book Building', 'Order Matching');
  }

  return [...new Set(suggestions)].slice(0, 4);
}
