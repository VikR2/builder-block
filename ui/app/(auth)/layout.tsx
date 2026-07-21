import { BarChart3, Check, Radar } from 'lucide-react';

const INDICATOR_VIDEO_ID =
  'how_to_use_the_tcm_pseudo_orderflow_indicator_u8gs_f377c33e';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100vh-76px)] bg-[#0b0d10] text-[#f4efe7] lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.08] lg:block">
        <img
          src={`/api/tcm/frames/${INDICATOR_VIDEO_ID}/10`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d10] via-[#0b0d10]/72 to-[#0b0d10]/30" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#c9974f]/30 bg-[#0b0d10]/60 px-3 py-2 text-[#e0b56d] backdrop-blur">
            <Radar className="h-3.5 w-3.5" />
            <span className="eyebrow">TCM member access</span>
          </div>

          <div className="max-w-xl">
            <p className="eyebrow text-[#c9974f]">Context before execution</p>
            <h2 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.05em]">
              Your indicator, education, and market notes in one workspace.
            </h2>
            <div className="mt-8 grid gap-3 text-sm text-[#c0c2c7]">
              {[
                'Invite-only TradingView access',
                'Chaptered chart walkthroughs',
                'Lesson-grounded Knowledge Bot',
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-[#c9974f]/25 bg-[#c9974f]/10 text-[#e0b56d]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#777b83]">
            <BarChart3 className="h-4 w-4 text-[#c9974f]" />
            Built for experienced discretionary traders
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-8 lg:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
