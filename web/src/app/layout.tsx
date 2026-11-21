import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { Toaster } from "@/components/Toaster";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Bloom CRM", template: "%s · Bloom CRM" },
  description: "CRM privé de l'agence pour le chatting OnlyFans.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#060607", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Backdrop />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
