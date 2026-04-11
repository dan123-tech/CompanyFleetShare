"use client";

import LandingSiteHeader from "@/components/landing/LandingSiteHeader";
import LandingSiteFooter from "@/components/landing/LandingSiteFooter";
import { LANDING_COL } from "@/components/landing/landingTheme";

/**
 * Marketing pages: dark shell, sticky header, footer.
 * @param {{ children: import('react').ReactNode, mainClassName?: string }} props
 */
export default function LandingPageShell({ children, mainClassName = "", logoPriority = false }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: LANDING_COL.base }}>
      <LandingSiteHeader logoPriority={logoPriority} />
      <main className={`flex-1 w-full max-w-6xl mx-auto px-4 sm:px-5 py-8 sm:py-10 ${mainClassName}`}>{children}</main>
      <LandingSiteFooter />
    </div>
  );
}
