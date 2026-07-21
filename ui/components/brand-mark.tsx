import Link from 'next/link';

interface BrandMarkProps {
  href?: string;
  compact?: boolean;
  inverse?: boolean;
}

export function BrandMark({
  href = '/',
  compact = false,
  inverse = false,
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      aria-label="The Currency Merchant"
      className={`group inline-flex items-center ${compact ? 'gap-2.5' : 'gap-3'}`}
    >
      <span
        className={`relative grid shrink-0 place-items-center border ${
          compact ? 'h-9 w-9 rounded-[11px]' : 'h-11 w-11 rounded-[13px]'
        } ${
          inverse
            ? 'border-[#c9974f]/55 bg-[#111317] text-[#e0b56d]'
            : 'border-[#a77634]/45 bg-[#f5efe4] text-[#8c5c20]'
        } transition-colors group-hover:border-[#c9974f]`}
      >
        <span className="font-mono text-[10px] font-semibold tracking-[-0.08em]">
          TCM
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-x-2 bottom-1.5 h-px bg-current opacity-55"
        />
      </span>

      <span className={compact ? 'hidden sm:block' : 'block'}>
        <span
          className={`block text-sm font-semibold leading-none tracking-[-0.02em] ${
            inverse ? 'text-[#f4efe7]' : 'text-[#17191d]'
          }`}
        >
          The Currency Merchant
        </span>
        {!compact && (
          <span
            className={`mt-1 block font-mono text-[9px] uppercase tracking-[0.24em] ${
              inverse ? 'text-[#8f9299]' : 'text-[#77726a]'
            }`}
          >
            Context before execution
          </span>
        )}
      </span>
    </Link>
  );
}
