import { redirect } from 'next/navigation';
import { getTCMSkills, getArchitectureDocuments, getLocalVideos } from "@/lib/tcm-db";
import { getCurrentUser } from "@/lib/auth";
import { PaywallOverlay } from "@/components/paywall";
import { TCMPageContent } from "./tcm-page-content";

export default async function TCMPage() {
  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/tcm');
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl="/tcm"
      title="Knowledge Bot"
      description="Subscribe to Premium to access the AI-powered Knowledge Bot and ask questions about trading concepts."
    />;
  }

  // Get stats for the sidebar
  const skills = getTCMSkills();
  const docs = getArchitectureDocuments();
  const videos = getLocalVideos();

  const stats = {
    skillCount: skills.length,
    docCount: docs.length,
    videoCount: videos.length,
  };

  return <TCMPageContent stats={stats} />;
}
