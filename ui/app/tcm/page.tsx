import { redirect } from 'next/navigation';
import { getLocalVideos, getTCMSkills } from "@/lib/tcm-db";
import { getCurrentUser } from "@/lib/auth";
import { PaywallOverlay } from "@/components/paywall";
import { TCMPageContent } from "./tcm-page-content";

const EMPTY_STATS = {
  skillCount: 0,
  videoCount: 0,
};

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
  const stats = { ...EMPTY_STATS };

  try {
    stats.skillCount = getTCMSkills().length;
  } catch (error) {
    console.error('TCM page skill stats load failed:', error);
  }

  try {
    stats.videoCount = getLocalVideos().length;
  } catch (error) {
    console.error('TCM page video stats load failed:', error);
  }

  return <TCMPageContent stats={stats} />;
}
