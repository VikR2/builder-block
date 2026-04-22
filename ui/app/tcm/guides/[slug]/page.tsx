import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export default async function GuidePage({ params }: GuidePageProps) {
  await params;
  redirect('/tcm');
}
