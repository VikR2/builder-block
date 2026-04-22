import { getCurrentUser } from '@/lib/auth';
import { getAdminPosts } from '@/lib/posts-db';
import { getStats } from '@/lib/db';
import { getLibraryVideos } from '@/lib/tcm-library';
import { WelcomeBanner } from '@/components/home/welcome-banner';
import { StatsSidebar } from '@/components/home/stats-sidebar';
import { PostCard } from '@/components/home/post-card';
import { PostComposer } from '@/components/home/post-composer';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Get current user (already authenticated via layout)
  const user = await getCurrentUser();

  // Fetch data in parallel
  const [posts, stats, videos] = await Promise.all([
    Promise.resolve(getAdminPosts(20)),
    Promise.resolve(getStats()),
    getLibraryVideos(),
  ]);

  const statsData = {
    skillsCount: stats.skills,
    videosCount: videos.length,
  };

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-rose-500/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container py-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main content area */}
          <div className="lg:col-span-3 space-y-8">
            {/* Welcome banner */}
            <WelcomeBanner userName={user?.email} />

            {/* Post composer stays available for admins without cluttering learner home */}
            {user?.isAdmin ? <PostComposer /> : null}

            {/* Posts feed */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-amber-500 text-xl">&#10070;</span>
                  <h2 className="text-xl font-semibold text-foreground">Latest Updates</h2>
                </div>
                <span className="text-sm text-muted-foreground">
                  {posts.length} post{posts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {posts.length === 0 ? (
                <div className="text-center py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
                  <span className="text-4xl mb-4 block">&#128240;</span>
                  <p className="text-muted-foreground">No updates yet. Check back soon!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Stats widget */}
              <StatsSidebar stats={statsData} />

              {/* Warm accent card */}
              <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-transparent p-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <span className="text-amber-500 font-medium">Trading Tip:</span> Consistency beats intensity.
                  Small daily progress compounds into mastery over time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
