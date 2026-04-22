import type { Metadata } from "next";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/auth";
import { UserMenu } from "@/components/auth/user-menu";
import { MainNav } from "@/components/main-nav";

export const metadata: Metadata = {
  title: "The Currency Merchant",
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
        <AuthProviderWrapper>
          <div className="relative flex min-h-screen flex-col">
            {/* Elegant Header */}
            <header className="sticky top-0 z-50 w-full border-b border-amber-500/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container flex h-16 items-center">
                <MainNav />
                <div className="ml-auto flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs font-medium">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-amber-500">Learning Active</span>
                  </div>
                  <UserMenu />
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
              <div className="container flex items-center justify-between h-14">
                <p className="text-xs text-muted-foreground">
                  <span className="text-amber-500 font-medium">TCM</span> · Trading Education Platform
                </p>
                <nav className="flex items-center gap-6 text-xs">
                  <a href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
                  <a href="/account" className="text-muted-foreground hover:text-foreground transition-colors">Account</a>
                  <a href="/skills" className="text-muted-foreground hover:text-foreground transition-colors">Skills Library</a>
                  <span className="text-muted-foreground/50">|</span>
                  <span className="text-muted-foreground">v2.0</span>
                  <span className="text-amber-500">●</span>
                  <span className="text-muted-foreground">{new Date().getFullYear()}</span>
                </nav>
              </div>
            </footer>
          </div>
        </AuthProviderWrapper>
      </body>
    </html>
  );
}
