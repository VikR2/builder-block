import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Currency Merchant Opus",
  description: "Master trading concepts with TCM's comprehensive learning platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          {/* Elegant Header */}
          <header className="sticky top-0 z-50 w-full border-b border-amber-500/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center space-x-3 group">
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/20 blur-xl group-hover:bg-amber-500/30 transition-all"></div>
                    <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                      <span className="text-background font-bold text-sm">TCM</span>
                    </div>
                  </div>
                  <span className="font-semibold text-lg tracking-tight">
                    <span className="text-amber-500">The Currency Merchant</span>
                    <span className="text-muted-foreground text-sm ml-2">Opus</span>
                  </span>
                </Link>
                <nav className="flex items-center space-x-1">
                  <Link
                    href="/tcm"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
                  >
                    <span className="text-amber-500 mr-1.5">●</span>
                    Knowledge Bot
                  </Link>
                  <Link
                    href="/tcm/library"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
                  >
                    <span className="text-rose-500 mr-1.5">▶</span>
                    Video Courses
                  </Link>
                  <Link
                    href="/skills"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
                  >
                    <span className="text-emerald-500 mr-1.5">◆</span>
                    Skills Library
                  </Link>
                  <Link
                    href="/tcm/guides"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
                  >
                    <span className="text-sky-500 mr-1.5">◎</span>
                    Study Guides
                  </Link>
                </nav>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs font-medium">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-amber-500">Learning Active</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] to-transparent pointer-events-none"></div>
            <div className="relative">{children}</div>
          </main>

          {/* Elegant Footer */}
          <footer className="border-t border-amber-500/20 bg-background/95">
            <div className="container flex items-center justify-between h-12">
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-500 font-medium">TCM Opus</span> · Trading Education Platform
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>v2.0</span>
                <span className="text-amber-500">●</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
