import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { Toaster } from "@/components/Toaster";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Bloom CRM", template: "%s · Bloom CRM" },
  description: "CRM privé de l'agence pour le chatting OnlyFans.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#f8f3ee", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Backdrop />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
