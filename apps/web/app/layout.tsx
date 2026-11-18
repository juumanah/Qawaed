import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Qawaed | Compliance, with confidence",
  description: "A clear path from filing to verified compliance.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
