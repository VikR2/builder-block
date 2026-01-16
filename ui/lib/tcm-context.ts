import {
  searchTCMSkills,
  searchDocumentParagraphs,
  searchTranscripts,
  TCMSearchResult,
  formatTimestamp,
  getArchitectureDocuments,
  getTCMSkills,
} from './tcm-db';

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

// Generate a non-LLM response based on context
export function generateContextBasedResponse(context: AssembledContext): string {
  const { skills, documents, transcripts, query } = context;

  // Check if we have any results
  if (context.totalResults === 0) {
    return generateNoResultsResponse(query);
  }

  let response = '';

  // Primary answer from skills (most authoritative)
  if (skills.length > 0) {
    const primarySkill = skills[0];
    response += `**${primarySkill.title}**\n\n${primarySkill.content}\n`;

    // Add secondary skills if relevant
    if (skills.length > 1) {
      response += '\n**Related Concepts:**\n';
      for (let i = 1; i < Math.min(skills.length, 3); i++) {
        response += `- **${skills[i].title}**: ${skills[i].content.substring(0, 100)}...\n`;
      }
    }
  }

  // Add document excerpts for more detail
  if (documents.length > 0) {
    response += '\n---\n\n**From the Study Materials:**\n\n';
    response += `> ${documents[0].content.substring(0, 400)}${documents[0].content.length > 400 ? '...' : ''}\n`;
    response += `\n*Source: ${documents[0].title}*\n`;
  }

  // Add transcript references
  if (transcripts.length > 0 && skills.length === 0 && documents.length === 0) {
    response += '\n**From Video Discussions:**\n\n';
    response += `"${transcripts[0].content}"\n`;
    response += `\n*${transcripts[0].source} - ${transcripts[0].title}*\n`;
  }

  // If we only have transcripts and nothing else, provide them
  if (!response && transcripts.length > 0) {
    response = `This concept is discussed in the TCM videos:\n\n`;
    response += `"${transcripts[0].content}"\n`;
    response += `\n*${transcripts[0].source}*`;
  }

  return response || generateNoResultsResponse(query);
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
