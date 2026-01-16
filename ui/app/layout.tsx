import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NinjaTrader Script Builder",
  description: "Build, organize, and learn from your NinjaTrader strategies",
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
          {/* Trading Terminal Header */}
          <header className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center space-x-3 group">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl group-hover:bg-primary/30 transition-all"></div>
                    <div className="relative h-8 w-8 rounded bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                      <span className="text-background font-bold text-sm">NT</span>
                    </div>
                  </div>
                  <span className="font-mono text-lg font-bold tracking-tight">
                    <span className="text-primary">ninja</span>
                    <span className="text-foreground">trader</span>
                    <span className="text-muted-foreground text-sm ml-1">/builder</span>
                  </span>
                </Link>
                <nav className="flex items-center space-x-1">
                  <Link
                    href="/skills"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all"
                  >
                    <span className="text-primary mr-1.5">○</span>
                    Skills
                  </Link>
                  <Link
                    href="/projects"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all"
                  >
                    <span className="text-accent mr-1.5">○</span>
                    Projects
                  </Link>
                  <Link
                    href="/tcm"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all"
                  >
                    <span className="text-yellow-500 mr-1.5">○</span>
                    TCM Bot
                  </Link>
                </nav>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded text-xs font-mono">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                  <span className="text-primary">LIVE</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 relative">
            <div className="absolute inset-0 metrics-grid opacity-20 pointer-events-none"></div>
            <div className="relative">{children}</div>
          </main>

          {/* Terminal Footer */}
          <footer className="border-t border-primary/20 bg-background/95">
            <div className="container flex items-center justify-between h-12">
              <p className="text-xs font-mono text-muted-foreground">
                <span className="text-primary">█</span> Next.js · SQLite · Claude Code
              </p>
              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                <span>v1.0.0</span>
                <span className="text-primary">●</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
