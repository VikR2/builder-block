import { redirect } from 'next/navigation';
import { getLocalVideos, getTCMSkills } from "@/lib/tcm-db";
import { getCurrentUser } from "@/lib/auth";
import { PaywallOverlay } from "@/components/paywall";
import { TCMPageContent } from "./tcm-page-content";

export default async function TCMPage() {
  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/tcm');
  }

  if (!user.hasChatAccess) {
    return <PaywallOverlay
      returnUrl="/tcm"
      title="Knowledge Bot"
      description="Subscribe to Premium or add chat credits to access the AI-powered Knowledge Bot and ask questions about trading concepts."
    />;
  }

  // Get stats for the sidebar
  const skills = getTCMSkills();
  const videos = getLocalVideos();

  const stats = {
    skillCount: skills.length,
    videoCount: videos.length,
  };

  return <TCMPageContent stats={stats} />;
}
