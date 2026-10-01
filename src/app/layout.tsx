import type { Metadata } from "next";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { EntryGate } from "@/components/EntryGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civicly Chennai",
  applicationName: "Civicly Chennai",
  description: "Report potholes and road issues in Chennai and see them live on the map.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Fixed to the viewport, not min-height: SessionProvider can render a Turnstile
          widget/error banner above `children` as a sibling in this flex column. If
          body could grow past 100dvh, that banner's height would push the full-height
          map down and off the bottom of the screen instead of shrinking it. */}
      <body className="h-dvh flex flex-col overflow-hidden">
        {/* EntryGate holds `children` (the real app) unmounted until the gate is
            passed, so the live homepage and its controls never render underneath the
            gate — only EntryGate's own decorative background map does. Nested inside
            SessionProvider so anonymous auth bootstraps in the background while the
            gate is up, not after. */}
        <SessionProvider>
          <EntryGate>{children}</EntryGate>
        </SessionProvider>
      </body>
    </html>
  );
}
