import {
  getAllProjectsWithDetails,
  getAllJournalEntriesWithProject,
  type ProjectWithDetails,
  type JournalEntryWithProject,
} from "@/lib/db";
import { ProjectsPageClient } from "@/components/projects-page-client";

export const dynamic = 'force-dynamic';

// Server Component - fetches data from database
export default function ProjectsPage() {
  // Get all projects with counts
  const projects = getAllProjectsWithDetails();

  // Get all journal entries with project info
  const journalEntries = getAllJournalEntriesWithProject();

  return (
    <ProjectsPageClient projects={projects} journalEntries={journalEntries} />
  );
}
