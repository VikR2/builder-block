import { NextRequest, NextResponse } from 'next/server';
import {
  getAllStudyGuides,
  getStudyGuideBySlug,
  searchStudyGuides,
  createStudyGuide,
  deleteStudyGuide,
  searchTCMSkills,
  searchDocumentParagraphs,
} from '@/lib/tcm-db';

// GET: List all guides or get by slug
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slug = searchParams.get('slug');
  const query = searchParams.get('q');

  try {
    if (slug) {
      const guide = getStudyGuideBySlug(slug);
      if (!guide) {
        return NextResponse.json({ error: 'Guide not found' }, { status: 404 });
      }
      return NextResponse.json(guide);
    }

    if (query) {
      const guides = searchStudyGuides(query);
      return NextResponse.json({ count: guides.length, guides });
    }

    const guides = getAllStudyGuides();
    return NextResponse.json({ count: guides.length, guides });
  } catch (error) {
    console.error('Guides GET error:', error);
    return NextResponse.json({ error: 'Failed to get guides' }, { status: 500 });
  }
}

// POST: Create a new study guide
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, title: customTitle } = body as {
      topic: string;
      title?: string;
    };

    if (!topic || topic.trim().length === 0) {
      return NextResponse.json(
        { error: 'Topic is required' },
        { status: 400 }
      );
    }

    // Generate study guide content
    const guide = generateStudyGuide(topic, customTitle);

    // Create slug from title
    const slug = guide.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug already exists
    const existing = getStudyGuideBySlug(slug);
    if (existing) {
      return NextResponse.json(
        { error: 'A guide with this title already exists', existingId: existing.id },
        { status: 409 }
      );
    }

    // Save to database
    const id = createStudyGuide(
      guide.title,
      slug,
      guide.content,
      guide.skillIds,
      topic
    );

    return NextResponse.json({
      id,
      slug,
      title: guide.title,
      message: 'Study guide created successfully',
    });
  } catch (error) {
    console.error('Guides POST error:', error);
    return NextResponse.json({ error: 'Failed to create guide' }, { status: 500 });
  }
}

// DELETE: Remove a study guide
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  try {
    const success = deleteStudyGuide(parseInt(id));
    if (!success) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Guides DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete guide' }, { status: 500 });
  }
}

// Generate a study guide from a topic
function generateStudyGuide(
  topic: string,
  customTitle?: string
): { title: string; content: string; skillIds: number[] } {
  // Search for related content
  const skills = searchTCMSkills(topic, 10);
  const docs = searchDocumentParagraphs(topic, 10);

  // Generate title
  const title = customTitle || `TCM Study Guide: ${capitalizeWords(topic)}`;

  // Build content
  let content = `# ${title}\n\n`;
  content += `*Generated from topic: "${topic}"*\n\n`;
  content += `---\n\n`;

  // Add overview section
  content += `## Overview\n\n`;
  if (skills.length > 0) {
    content += `This guide covers ${skills.length} related TCM concepts:\n\n`;
    for (const skill of skills.slice(0, 5)) {
      content += `- **${skill.name}**: ${skill.description.substring(0, 100)}...\n`;
    }
    content += `\n`;
  }

  // Add detailed sections from skills
  if (skills.length > 0) {
    content += `## Key Concepts\n\n`;
    for (const skill of skills) {
      content += `### ${skill.name}\n\n`;
      content += `${skill.description}\n\n`;
      if (skill.code_snippet) {
        content += `**Code Pattern:**\n\`\`\`csharp\n${skill.code_snippet.substring(0, 500)}\n\`\`\`\n\n`;
      }
    }
  }

  // Add material from study documents
  if (docs.length > 0) {
    content += `## From Study Materials\n\n`;
    for (const doc of docs.slice(0, 5)) {
      content += `> ${doc.paragraph}\n\n`;
      content += `*Source: ${doc.doc}*\n\n`;
    }
  }

  // Add summary
  content += `## Summary\n\n`;
  content += `This guide covered the following TCM concepts related to "${topic}":\n\n`;
  for (const skill of skills.slice(0, 5)) {
    content += `1. ${skill.name}\n`;
  }
  content += `\n`;

  // Add study tips
  content += `## Study Tips\n\n`;
  content += `- Review the video transcripts for visual examples\n`;
  content += `- Practice identifying these patterns on historical charts\n`;
  content += `- Use the chat bot to ask follow-up questions\n`;

  return {
    title,
    content,
    skillIds: skills.map(s => s.id),
  };
}

function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
