import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f]">
      {/* Simple header */}
      <header className="p-6">
        <Link
          href="/"
          className="text-xl font-bold text-white hover:text-indigo-400 transition-colors"
        >
          The Currency Merchant
        </Link>
      </header>

      {/* Centered content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Simple footer */}
      <footer className="p-6 text-center text-sm text-neutral-500">
        &copy; {new Date().getFullYear()} The Currency Merchant. All rights reserved.
      </footer>
    </div>
  );
}
