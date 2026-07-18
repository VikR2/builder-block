import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Library,
  LockKeyhole,
  Play,
  Radar,
  Sparkles,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getAdminPosts } from '@/lib/posts-db';
import { getStats } from '@/lib/db';
import { getLibraryVideos } from '@/lib/tcm-library';
import { PostCard } from '@/components/home/post-card';
import { PostComposer } from '@/components/home/post-composer';

export const dynamic = 'force-dynamic';

const EMPTY_STATS = {
  skills: 0,
  projects: 0,
  scripts: 0,
  journalEntries: 0,
};

function traderName(email?: string): string {
  if (!email) {
    return 'Trader';
  }

  const candidate = email.split('@')[0]?.split(/[._\d]/)[0]?.trim();
  if (!candidate || candidate.length < 3) {
    return 'Trader';
  }

  return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
}

export default async function HomePage() {
  const user = await getCurrentUser();
  let dataLoadFailed = false;

  const [posts, stats, videos] = await Promise.all([
    Promise.resolve()
      .then(() => getAdminPosts(6))
      .catch((error) => {
        dataLoadFailed = true;
        console.error('Home dashboard posts load failed:', error);
        return [];
      }),
    Promise.resolve()
      .then(() => getStats())
      .catch((error) => {
        dataLoadFailed = true;
        console.error('Home dashboard stats load failed:', error);
        return EMPTY_STATS;
      }),
    getLibraryVideos().catch((error) => {
      dataLoadFailed = true;
      console.error('Home dashboard videos load failed:', error);
      return [];
    }),
  ]);

  const featuredVideo = videos[0];
  const name = traderName(user?.email);

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0d10]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45 [background-image:radial-gradient(circle_at_18%_0%,rgba(201,151,79,.12),transparent_34%),radial-gradient(circle_at_85%_24%,rgba(55,116,92,.08),transparent_30%)]"
      />

      <div className="site-container relative py-8 sm:py-12">
        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="member-panel relative overflow-hidden p-6 sm:p-9">
            <div
              aria-hidden="true"
              className="absolute -right-16 -top-20 h-60 w-60 rounded-full border border-[#c9974f]/15"
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#a6a9af]">
                  <CircleDot className="h-3 w-3 text-emerald-400" />
                  Member workspace
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#62666e]">
                  Context before execution
                </span>
              </div>

              <h1 className="mt-7 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Welcome back, {name}.
                <span className="block text-[#8f9299]">
                  Start with the range, then build the idea.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-[#92959c]">
                Continue your TCM study, review the latest market note, or open
                the knowledge tools before the next chart session.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/tcm/library"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#c9974f] px-5 text-sm font-semibold text-[#15171a]"
                >
                  Open the library
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/tcm"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-sm font-semibold text-[#e6e1d9] transition-colors hover:bg-white/[0.05]"
                >
                  Ask the Knowledge Bot
                  <Bot className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <aside
            className={`relative overflow-hidden rounded-2xl border p-6 ${
              user?.isPremium
                ? 'border-emerald-400/20 bg-emerald-400/[0.055]'
                : 'border-[#c9974f]/20 bg-[#c9974f]/[0.055]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`grid h-11 w-11 place-items-center rounded-xl border ${
                  user?.isPremium
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                    : 'border-[#c9974f]/20 bg-[#c9974f]/10 text-[#e0b56d]'
                }`}
              >
                {user?.isPremium ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <LockKeyhole className="h-5 w-5" />
                )}
              </div>
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
                  user?.isPremium ? 'text-emerald-300' : 'text-[#c9974f]'
                }`}
              >
                {user?.isPremium ? 'Active' : 'Access required'}
              </span>
            </div>
            <p className="eyebrow mt-8 text-[#747881]">Indicator status</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              {user?.isPremium
                ? 'TCM Indicator Suite'
                : 'Unlock the indicator suite'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#92959c]">
              {user?.isPremium
                ? 'Your premium membership and learning workspace are available.'
                : 'Choose a billing cadence to activate TradingView access and premium education.'}
            </p>
            <Link
              href={user?.isPremium ? '/account/subscription' : '/pricing#plans'}
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#e0b56d]"
            >
              {user?.isPremium ? 'Manage access' : 'Compare plans'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </section>

        {dataLoadFailed && (
          <div className="mt-5 rounded-2xl border border-[#c9974f]/25 bg-[#c9974f]/10 px-5 py-4 text-sm text-[#e0b56d]">
            Some workspace data is temporarily unavailable. Available tools can
            still be opened from the navigation.
          </div>
        )}

        <section className="mt-6 grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
          <div className="grid gap-5">
            <article className="member-panel p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow text-[#c9974f]">Continue learning</p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {featuredVideo?.title || 'TCM video library'}
                  </h2>
                </div>
                <Play className="h-5 w-5 text-[#c9974f]" />
              </div>

              {featuredVideo ? (
                <>
                  <div className="relative mt-5 aspect-[16/8.7] overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                    <img
                      src={featuredVideo.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover opacity-75"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white">
                      <Clock3 className="h-3 w-3" />
                      Resume lesson
                    </div>
                  </div>
                  <Link
                    href={`/tcm/library/${encodeURIComponent(featuredVideo.id)}`}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#e0b56d]"
                  >
                    Continue watching
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[#8f9299]">
                  Published lessons will appear here when the library is ready.
                </p>
              )}
            </article>

            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  icon: BookOpen,
                  value: stats.skills,
                  label: 'Skills',
                  href: '/skills',
                },
                {
                  icon: Library,
                  value: videos.length,
                  label: 'Lessons',
                  href: '/tcm/library',
                },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="member-panel p-5 transition-colors hover:bg-white/[0.055]"
                >
                  <item.icon className="h-4 w-4 text-[#c9974f]" />
                  <p className="mt-7 font-mono text-2xl font-semibold">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs text-[#7f838b]">{item.label}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="member-panel p-6 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-[#c9974f]">Latest TCM notes</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  Market context and member updates
                </h2>
              </div>
              <span className="font-mono text-[10px] text-[#6f737b]">
                {posts.length} available
              </span>
            </div>

            {user?.isAdmin && <div className="mt-6"><PostComposer /></div>}

            <div className="mt-6 space-y-4">
              {posts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
                  <Radar className="mx-auto h-6 w-6 text-[#5f636b]" />
                  <p className="mt-3 text-sm text-[#8f9299]">
                    No market notes have been published yet.
                  </p>
                </div>
              ) : (
                posts.slice(0, 3).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: BarChart3,
              label: 'Skills library',
              copy: 'Review models, dependencies, and execution conditions.',
              href: '/skills',
            },
            {
              icon: Bot,
              label: 'Knowledge Bot',
              copy: 'Ask a lesson-grounded question and jump to the source.',
              href: '/tcm',
            },
            {
              icon: Sparkles,
              label: 'Indicator access',
              copy: 'Review billing, membership, and access status.',
              href: user?.isPremium ? '/account/subscription' : '/pricing#plans',
            },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="member-panel group flex items-start gap-4 p-5 transition-colors hover:bg-white/[0.055]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[#c9974f]">
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#7f838b]">
                  {item.copy}
                </p>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
