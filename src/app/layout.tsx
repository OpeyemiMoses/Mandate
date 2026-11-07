import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MandateProvider } from "@/context/MandateContext";
import { NearWalletSelectorProvider } from "@/context/NearWalletSelectorContext";
import { NearWalletSelectorSync } from "@/components/NearWalletSelectorSync";
import { RainbowKitProviders } from "@/components/RainbowKitProviders";
import { ThemeProvider } from "@/context/ThemeContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mandate — Your rules. Our execution. | NEAR Autonomous Spending Firewall",
  description:
    "Mandate is a deterministic spending firewall and policy-enforced custody layer for autonomous AI agents on the NEAR ecosystem.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#0B0B0B] text-[#E5E7EB] antialiased`}
      >
        <ThemeProvider>
          <MandateProvider>
            <NearWalletSelectorProvider>
              <NearWalletSelectorSync />
              <RainbowKitProviders>{children}</RainbowKitProviders>
            </NearWalletSelectorProvider>
          </MandateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
