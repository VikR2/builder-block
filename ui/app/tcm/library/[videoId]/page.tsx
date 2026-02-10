import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import { WatchContent } from './watch-content';

export const dynamic = 'force-dynamic';

interface WatchPageProps {
  params: Promise<{ videoId: string }>;
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { videoId } = await params;

  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/tcm/library/${videoId}`);
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl={`/tcm/library/${videoId}`}
      title="Premium Video"
      description="Subscribe to Premium to watch this video with synchronized transcripts and chapter navigation."
    />;
  }

  return <WatchContent videoId={videoId} />;
}
