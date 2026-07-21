'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Layers3,
  LockKeyhole,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import {
  type BillingPeriod,
  PRICING_PLANS,
  isBillingPeriod,
} from '@/lib/pricing';

type ActivationStatus = 'checking' | 'active' | 'delayed';

interface Feature {
  id: string;
  label: string;
  title: string;
  description: string;
  image: string;
  eyebrow: string;
  callouts: string[];
}

const FEATURES: Feature[] = [
  {
    id: 'range',
    label: 'Range context',
    title: 'See the range price is actually working through.',
    description:
      'Frame the active auction before looking for execution. TCM organizes the surrounding range, key boundaries, and the areas where participation changes.',
    image: '/images/tcm-suite/range-context-4k.webp',
    eyebrow: 'Market structure',
    callouts: ['Working range', 'External liquidity', 'Midpoint context'],
  },
  {
    id: 'orderflow',
    label: 'Pseudo order flow',
    title: 'Read participation without adding more chart noise.',
    description:
      'Track where buyers and sellers are showing initiative, where price is being accepted, and where the auction begins to lose efficiency.',
    image: '/images/tcm-suite/pseudo-order-flow-4k.webp',
    eyebrow: 'Participation',
    callouts: ['Initiative move', 'Responsive activity', 'Order-flow shift'],
  },
  {
    id: 'absorption',
    label: 'Absorption',
    title: 'Identify effort that is no longer producing progress.',
    description:
      'TCM highlights the context around repeated tests and stalled delivery so absorption can be judged inside the larger range.',
    image: '/images/tcm-suite/absorption-levels-4k.webp',
    eyebrow: 'Reaction quality',
    callouts: ['Repeated test', 'Stalled delivery', 'Responsive zone'],
  },
  {
    id: 'reaction',
    label: 'Reaction zones',
    title: 'Keep the areas that matter visible at decision time.',
    description:
      'Map reaction zones and potential execution areas without turning the chart into a collection of disconnected levels.',
    image: '/images/tcm-suite/reaction-zones-4k.webp',
    eyebrow: 'Execution context',
    callouts: ['Reaction zone', 'Invalidation area', 'Delivery objective'],
  },
  {
    id: 'bias',
    label: 'Bias and sessions',
    title: 'Align the intraday idea with the higher-timeframe auction.',
    description:
      'Use session structure and directional context as filters. The indicator supports a thesis; it does not replace one.',
    image: '/images/tcm-suite/session-bias-4k.webp',
    eyebrow: 'Directional filter',
    callouts: ['Session range', 'Higher-timeframe bias', 'Execution window'],
  },
];

const PLAN_FEATURES = [
  'Invite-only TradingView indicator access',
  'All TCM indicator updates while subscribed',
  'Trade ideas, chart walkthroughs, and practical guides',
  'TCM video library with chapters and transcripts',
  'Lesson-grounded Knowledge Bot',
  'Cancel anytime from your account',
];

const FAQS = [
  {
    question: 'How is TradingView access delivered?',
    answer:
      'Enter your TradingView username during Whop checkout. After payment is confirmed, the membership is connected to the invite-only indicator access flow.',
  },
  {
    question: 'Does the indicator generate trade signals?',
    answer:
      'No. The TCM Indicator Suite organizes range, participation, bias, and reaction context. It is designed to support analysis, not replace risk management or independent decision-making.',
  },
  {
    question: 'What is included with every plan?',
    answer:
      'All billing periods include the same indicator access, updates, chart walkthroughs, video education, and TCM member tools. Only the billing cadence and effective monthly rate change.',
  },
  {
    question: 'Can I cancel?',
    answer:
      'Yes. Paid memberships can be managed from the account subscription page. Access remains subject to the terms shown during Whop checkout.',
  },
  {
    question: 'Is a TradingView subscription included?',
    answer:
      'No. The TCM membership grants access to the invite-only indicator. A compatible TradingView account is still required.',
  },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function ActivationPanel({
  status,
}: {
  status: ActivationStatus;
}) {
  const content = {
    checking: {
      title: 'Confirming indicator access',
      copy: 'Payment is complete. Whop is confirming your membership and TradingView access details.',
    },
    active: {
      title: 'Indicator access is active',
      copy: 'Your membership is active. Redirecting you to your subscription workspace.',
    },
    delayed: {
      title: 'Payment received',
      copy: 'Whop confirmed payment, but the membership sync is taking longer than expected.',
    },
  }[status];

  return (
    <section className="bg-[#0b0d10] px-5 py-24 text-[#f4efe7]">
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center sm:p-12">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#c9974f]/30 bg-[#c9974f]/10 text-[#e0b56d]">
          {status === 'checking' ? (
            <RefreshCw className="h-7 w-7 animate-spin" />
          ) : (
            <BadgeCheck className="h-8 w-8" />
          )}
        </div>
        <p className="eyebrow mt-7 text-[#c9974f]">Membership status</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {content.title}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#9da0a7]">
          {content.copy}
        </p>

        {status === 'delayed' && (
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-12 rounded-full bg-[#c9974f] px-5 text-sm font-semibold text-[#15171a]"
            >
              Refresh status
            </button>
            <Link
              href="/account/subscription"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-semibold text-white"
            >
              View account
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default function PricingPageClient() {
  const [activeFeature, setActiveFeature] = useState(FEATURES[0].id);
  const [loadingPlan, setLoadingPlan] = useState<BillingPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationStatus, setActivationStatus] =
    useState<ActivationStatus>('checking');
  const { user, loading: authLoading, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSuccess = searchParams.get('success') === 'true';
  const isCanceled = searchParams.get('canceled') === 'true';
  const requestedPlan = searchParams.get('plan');
  const selectedPlan: BillingPeriod = isBillingPeriod(requestedPlan)
    ? requestedPlan
    : 'quarterly';

  const feature =
    FEATURES.find((candidate) => candidate.id === activeFeature) ?? FEATURES[0];

  const handleSubscribe = async (billingPeriod: BillingPeriod) => {
    if (!user) {
      const redirect = `/pricing?plan=${billingPeriod}#plans`;
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    if (user.isPremium) {
      router.push('/account/subscription');
      return;
    }

    setLoadingPlan(billingPeriod);
    setError(null);

    try {
      const response = await fetch('/api/whop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingPeriod }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoadingPlan(null);
    }
  };

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    let canceled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const verifyPremiumAccess = async () => {
      setActivationStatus('checking');

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        if (canceled) {
          return;
        }

        try {
          const response = await fetch('/api/auth/me', { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            if (data.user?.isPremium) {
              await refresh();
              if (canceled) {
                return;
              }
              setActivationStatus('active');
              redirectTimer = setTimeout(() => {
                router.push('/account/subscription');
              }, 1200);
              return;
            }
          }
        } catch (verificationError) {
          console.error(
            'Failed to verify premium activation:',
            verificationError
          );
        }
      }

      if (!canceled) {
        setActivationStatus('delayed');
      }
    };

    verifyPremiumAccess();

    return () => {
      canceled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [isSuccess, refresh, router]);

  if (isSuccess) {
    return <ActivationPanel status={activationStatus} />;
  }

  return (
    <div className="overflow-hidden bg-[#f7f3eb] text-[#17191d]">
      <section className="relative isolate overflow-hidden bg-[#0b0d10] px-5 pb-20 pt-16 text-[#f4efe7] sm:pt-20 lg:pb-28 lg:pt-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <div className="site-container grid items-center gap-14 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c9974f]/30 bg-[#c9974f]/10 px-3 py-2 text-[#e0b56d]">
              <Radar className="h-3.5 w-3.5" />
              <span className="eyebrow">TCM Indicator Suite</span>
            </div>
            <h1 className="mt-7 max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
              Read participation.
              <span className="block text-[#c9974f]">Frame the range.</span>
              Trade with context.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#a7a9ae] sm:text-lg">
              A TradingView toolkit for experienced traders who want to organize
              range, order flow, absorption, and reaction context before making
              an execution decision.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#plans"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c9974f] px-6 text-sm font-semibold text-[#15171a] transition-transform hover:-translate-y-0.5"
              >
                Get indicator access
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]"
              >
                Explore the model
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#858991]">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#c9974f]" />
                Invite-only TradingView access
              </span>
              <span className="inline-flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#c9974f]" />
                Education included
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[16/10] overflow-hidden rounded-[26px] border border-white/10 bg-[#15181c] shadow-2xl shadow-black/40">
              <img
                src="/images/tcm-suite/hero-market-context-4k.webp"
                alt="TCM pseudo order-flow indicator organizing range and reaction zones on a TradingView chart"
                width={3840}
                height={2160}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d10]/80 via-transparent to-transparent" />
              <div className="absolute left-[8%] top-[18%] rounded-full border border-[#c9974f]/45 bg-[#0b0d10]/85 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#e0b56d] backdrop-blur">
                Working range
              </div>
              <div className="absolute right-[7%] top-[42%] rounded-full border border-emerald-400/35 bg-[#0b0d10]/85 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300 backdrop-blur">
                Responsive activity
              </div>
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow text-[#c9974f]">Live chart context</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Pseudo order flow · XAUUSD
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 font-mono text-[10px] text-[#c4c6cb] backdrop-blur sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Context active
                </div>
              </div>
            </div>

            <div className="absolute -bottom-7 -left-5 hidden w-52 rounded-2xl border border-white/10 bg-[#15181c]/95 p-4 shadow-xl backdrop-blur md:block">
              <p className="eyebrow text-[#7f8289]">Decision sequence</p>
              <div className="mt-3 space-y-2 font-mono text-[10px] text-[#c5c6ca]">
                <p>01 · Locate the range</p>
                <p>02 · Read participation</p>
                <p>03 · Define invalidation</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isCanceled && (
        <div className="site-container pt-8">
          <div
            role="status"
            className="rounded-2xl border border-[#b9853e]/30 bg-[#b9853e]/10 px-5 py-4 text-sm text-[#704a19]"
          >
            Checkout was canceled. Your account was not charged.
          </div>
        </div>
      )}

      {user?.isPremium && (
        <div className="site-container pt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-emerald-700/20 bg-emerald-700/[0.08] px-5 py-4 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 font-semibold">
              <BadgeCheck className="h-4 w-4" />
              Your TCM indicator membership is active.
            </span>
            <Link
              href="/account/subscription"
              className="inline-flex items-center gap-2 font-semibold underline decoration-emerald-800/30 underline-offset-4"
            >
              Manage subscription
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <section id="features" className="scroll-mt-24 px-5 py-20 sm:py-28">
        <div className="site-container">
          <div className="max-w-3xl">
            <p className="eyebrow text-[#8c5c20]">Everything in context</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              A cleaner chart is only useful when it improves the decision.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#67645e]">
              Each tool is designed to answer a specific question about the
              auction—not to stack another signal on the screen.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
            <div
              role="tablist"
              aria-label="Indicator feature examples"
              className="grid content-start gap-2"
            >
              {FEATURES.map((item, index) => {
                const active = item.id === feature.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="feature-panel"
                    onClick={() => setActiveFeature(item.id)}
                    className={`group flex min-h-16 items-center justify-between rounded-2xl border px-4 text-left transition-all ${
                      active
                        ? 'border-[#9a692b]/35 bg-[#17191d] text-white shadow-lg shadow-black/10'
                        : 'border-black/10 bg-white/45 text-[#454541] hover:bg-white/80'
                    }`}
                  >
                    <span className="flex items-center gap-4">
                      <span
                        className={`font-mono text-[10px] ${
                          active ? 'text-[#c9974f]' : 'text-[#8f8a81]'
                        }`}
                      >
                        0{index + 1}
                      </span>
                      <span className="text-sm font-semibold">{item.label}</span>
                    </span>
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${
                        active
                          ? 'translate-x-0 text-[#c9974f]'
                          : '-translate-x-1 text-[#8f8a81] group-hover:translate-x-0'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div
              id="feature-panel"
              role="tabpanel"
              className="marketing-panel overflow-hidden"
            >
              <div className="relative aspect-[16/9] overflow-hidden border-b border-black/10 bg-[#101216]">
                <img
                  key={feature.image}
                  src={feature.image}
                  alt={`${feature.label} shown on a TCM TradingView chart`}
                  width={3840}
                  height={2160}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                  {feature.callouts.map((callout) => (
                    <span
                      key={callout}
                      className="rounded-full border border-white/15 bg-black/55 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.13em] text-white backdrop-blur"
                    >
                      {callout}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-6 sm:p-8">
                <p className="eyebrow text-[#8c5c20]">{feature.eyebrow}</p>
                <h3 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-[#67645e]">
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="method"
        className="scroll-mt-24 bg-[#111317] px-5 py-20 text-[#f4efe7] sm:py-28"
      >
        <div className="site-container">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="max-w-lg">
              <p className="eyebrow text-[#c9974f]">The TCM method</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Follow the order lifecycle, not the latest candle.
              </h2>
              <p className="mt-5 text-base leading-7 text-[#999da5]">
                TCM treats price as an auction. The indicator helps keep each
                stage visible so execution remains tied to a coherent market
                thesis.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/10 sm:grid-cols-2">
              {[
                {
                  icon: Layers3,
                  step: '01',
                  title: 'Order lifecycle',
                  copy: 'Start with where the current auction sits inside the larger delivery sequence.',
                },
                {
                  icon: Radar,
                  step: '02',
                  title: 'Submission range',
                  copy: 'Define the area where price is searching for acceptance and participation.',
                },
                {
                  icon: BarChart3,
                  step: '03',
                  title: 'Book building',
                  copy: 'Read the balance, repeated testing, and inventory developing inside the range.',
                },
                {
                  icon: Target,
                  step: '04',
                  title: 'Order fulfillment',
                  copy: 'Judge the reaction and delivery toward the objective with invalidation already defined.',
                },
              ].map((item) => (
                <article key={item.title} className="bg-[#15181c] p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <item.icon className="h-5 w-5 text-[#c9974f]" />
                    <span className="font-mono text-[10px] text-[#6f737b]">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#92959c]">
                    {item.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="education"
        className="scroll-mt-24 px-5 py-20 sm:py-28"
      >
        <div className="site-container">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <p className="eyebrow text-[#8c5c20]">Education included</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Learn the reasoning behind the overlay.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#67645e]">
              The suite is paired with the TCM library so every chart feature
              connects back to a trading concept and practical example.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Play,
                label: 'Chart walkthroughs',
                title: 'Watch the full decision unfold.',
                copy: 'Curated lessons with chapters, synchronized transcripts, and chart-specific examples.',
              },
              {
                icon: BookOpen,
                label: 'Trading models',
                title: 'Study the concepts in isolation.',
                copy: 'Review the skills, dependencies, and conditions that make a setup coherent.',
              },
              {
                icon: Bot,
                label: 'TCM Knowledge Bot',
                title: 'Ask a precise follow-up.',
                copy: 'Get lesson-grounded answers linked back to the closest clip and teaching context.',
              },
            ].map((item) => (
              <article
                key={item.label}
                className="marketing-panel flex min-h-[270px] flex-col p-6 sm:p-8"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#8c5c20]/20 bg-[#8c5c20]/10 text-[#8c5c20]">
                  <item.icon className="h-5 w-5" />
                </div>
                <p className="eyebrow mt-8 text-[#8c5c20]">{item.label}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.025em]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#67645e]">
                  {item.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="plans"
        className="scroll-mt-24 border-y border-black/10 bg-[#efe8dc] px-5 py-20 sm:py-28"
      >
        <div className="site-container">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow text-[#8c5c20]">Choose your cadence</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              One suite. Three ways to access it.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#67645e]">
              Every plan includes the complete indicator and education
              experience. Longer billing periods lower the effective monthly
              rate.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-700/20 bg-red-700/[0.08] px-5 py-4 text-center text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
            {PRICING_PLANS.map((plan) => {
              const emphasized = plan.id === selectedPlan;
              const isLoading = loadingPlan === plan.id;

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col overflow-hidden rounded-[24px] border p-6 sm:p-8 ${
                    emphasized
                      ? 'border-[#9a692b]/40 bg-[#17191d] text-white shadow-2xl shadow-black/15'
                      : 'border-black/10 bg-[#f8f5ef] text-[#17191d]'
                  }`}
                >
                  {plan.badge && (
                    <div
                      className={`absolute right-5 top-5 rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                        emphasized
                          ? 'bg-[#c9974f] text-[#17191d]'
                          : 'bg-[#17191d] text-white'
                      }`}
                    >
                      {plan.badge}
                    </div>
                  )}
                  <p
                    className={`eyebrow ${
                      emphasized ? 'text-[#c9974f]' : 'text-[#8c5c20]'
                    }`}
                  >
                    {plan.name}
                  </p>
                  <div className="mt-7 flex items-end gap-2">
                    <span className="font-mono text-5xl font-semibold tracking-[-0.06em]">
                      {formatCurrency(plan.price)}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-sm ${
                      emphasized ? 'text-[#a5a8ae]' : 'text-[#67645e]'
                    }`}
                  >
                    {plan.billingLabel}
                  </p>
                  <div
                    className={`mt-6 rounded-2xl border p-4 ${
                      emphasized
                        ? 'border-white/10 bg-white/[0.04]'
                        : 'border-black/10 bg-black/[0.025]'
                    }`}
                  >
                    <p className="font-mono text-sm font-semibold">
                      {formatCurrency(plan.equivalentMonthly)}/month
                    </p>
                    <p
                      className={`mt-1 text-xs ${
                        emphasized ? 'text-[#8e9299]' : 'text-[#77726a]'
                      }`}
                    >
                      {plan.savingsPercent
                        ? `Save ${plan.savingsPercent}% against monthly billing`
                        : 'Maximum billing flexibility'}
                    </p>
                  </div>
                  <p
                    className={`mt-6 text-sm leading-6 ${
                      emphasized ? 'text-[#a5a8ae]' : 'text-[#67645e]'
                    }`}
                  >
                    {plan.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={authLoading || loadingPlan !== null}
                    className={`mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                      emphasized
                        ? 'bg-[#c9974f] text-[#15171a]'
                        : 'bg-[#17191d] text-white'
                    }`}
                  >
                    {isLoading
                      ? 'Opening checkout…'
                      : user?.isPremium
                        ? 'Manage access'
                        : `Choose ${plan.name.toLowerCase()}`}
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLAN_FEATURES.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 text-sm text-[#5f5c56]"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8c5c20]" />
                {item}
              </div>
            ))}
          </div>
          {!user && (
            <p className="mt-8 text-center text-sm text-[#77726a]">
              Already have an account?{' '}
              <Link
                href="/login?redirect=%2Fpricing%23plans"
                className="font-semibold text-[#8c5c20] underline decoration-[#8c5c20]/25 underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 px-5 py-20 sm:py-28">
        <div className="site-container grid gap-12 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="eyebrow text-[#8c5c20]">Before you subscribe</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">
              Clear answers. No performance promises.
            </h2>
            <p className="mt-5 text-sm leading-6 text-[#67645e]">
              The indicator is a decision-support tool. It cannot predict
              outcomes or remove the risk involved in trading.
            </p>
            <div className="mt-7 flex items-center gap-3 rounded-2xl border border-black/10 bg-white/50 p-4 text-sm text-[#5f5c56]">
              <LockKeyhole className="h-5 w-5 shrink-0 text-[#8c5c20]" />
              Checkout and subscription management are handled through Whop.
            </div>
          </div>

          <div className="divide-y divide-black/10 border-y border-black/10">
            {FAQS.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-base font-semibold">
                  {item.question}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/10 text-[#8c5c20] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-2 pr-12 text-sm leading-6 text-[#67645e]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-24">
        <div className="site-container">
          <div className="relative overflow-hidden rounded-[28px] bg-[#17191d] px-6 py-12 text-[#f4efe7] sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[#c9974f]/20"
            />
            <div className="relative max-w-2xl">
              <div className="inline-flex items-center gap-2 text-[#c9974f]">
                <Sparkles className="h-4 w-4" />
                <span className="eyebrow">Context before execution</span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Build a repeatable process around what price is showing.
              </h2>
            </div>
            <Link
              href="#plans"
              className="relative mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c9974f] px-6 text-sm font-semibold text-[#15171a] lg:mt-0"
            >
              Compare access plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
