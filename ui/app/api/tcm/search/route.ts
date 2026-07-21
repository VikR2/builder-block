import { NextRequest, NextResponse } from 'next/server';
import { searchTCM, searchTCMSkills, searchDocumentParagraphs, searchTranscripts, TCMSearchResult } from '@/lib/tcm-db';
import { getVideoLinkedSkillsByFolderId, skillMatchesQuery } from '@/lib/tcm-video-skill-sync';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const source = searchParams.get('source'); // 'all', 'skills', 'docs', 'transcripts'
  const limit = parseInt(searchParams.get('limit') || '10');
  const preferredVideoId = searchParams.get('preferredVideoId');

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    let results: TCMSearchResult[] = [];

    switch (source) {
      case 'skills':
        const linkedSkills = preferredVideoId
          ? getVideoLinkedSkillsByFolderId(preferredVideoId, limit).filter((skill) => skillMatchesQuery(skill, query))
          : [];
        const searchedSkills = searchTCMSkills(query, limit);
        const mergedSkills = Array.from(
          new Map(
            [
              ...searchedSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                category: skill.category,
                description: skill.description,
                linked: false,
              })),
              ...linkedSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                category: skill.category,
                description: skill.description,
                linked: true,
              })),
            ].map((skill) => [skill.id, skill])
          ).values()
        ).slice(0, limit);

        results = mergedSkills.map(s => ({
          type: 'skill' as const,
          id: `skill-${s.id}`,
          title: s.name,
          content: s.description,
          source: s.linked ? `Linked skill - ${s.category}` : `Skill #${s.id} - ${s.category}`
        }));
        break;

      case 'docs':
        const docs = searchDocumentParagraphs(query, limit);
        results = docs.map(d => ({
          type: 'document' as const,
          id: `doc-${d.doc}`,
          title: d.doc,
          content: d.paragraph,
          source: 'Architecture Document'
        }));
        break;

      case 'transcripts':
        const transcripts = searchTranscripts(query, limit);
        results = transcripts.map(t => ({
          type: 'transcript' as const,
          id: `transcript-${t.videoId}-${t.segment.start}`,
          title: t.videoTitle,
          content: t.segment.text,
          source: `Video @ ${formatTimestamp(t.segment.start)}`,
          timestamp: t.segment.start,
          videoId: t.videoId
        }));
        break;

      case 'all':
      default:
        results = searchTCM(query);
        break;
    }

    return NextResponse.json({
      query,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
