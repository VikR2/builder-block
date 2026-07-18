import type { Metadata } from "next";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/auth";
import { SiteChrome } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: {
    default: "The Currency Merchant",
    template: "%s · The Currency Merchant",
  },
  description:
    "TCM TradingView indicators and education for reading participation, framing ranges, and trading with context.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProviderWrapper>
          <SiteChrome>{children}</SiteChrome>
        </AuthProviderWrapper>
      </body>
    </html>
  );
}
