import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

import { AppHeader } from "@/components/layout/app-header";
import { LowBalanceBanner } from "@/components/layout/low-balance-banner";
import { StoreHydrationDriver } from "@/components/data/store-hydration-driver";
import { TatNotificationDriver } from "@/components/reports/tat-notification-driver";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "RakshSetu Labs — Diagnostic Reports Portal",
  description: "Lab management portal for owners and technicians",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="bg-app min-h-screen text-neutral-800 antialiased">
        <TooltipProvider>
          <AppHeader />
          <LowBalanceBanner />
          <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </TooltipProvider>
        <StoreHydrationDriver />
        <TatNotificationDriver />
        <Toaster />
      </body>
    </html>
  );
}
