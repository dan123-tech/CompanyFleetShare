import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
/* UI depth / polish — remove this import + delete ui-polish.css to revert */
import "./ui-polish.css";
import { DatabaseOrchestratorProvider } from "@/orchestrator";
import AiChatBubble from "@/components/AiChatBubble";
import { I18nProvider } from "@/i18n/I18nProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Canonical URL for metadata (Open Graph, favicon discovery). Prefer NEXT_PUBLIC_APP_URL in production. */
function metadataBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw.includes("://") ? raw : `https://${raw}`);
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  // Local dev: resolve icon/OG URLs on the host you use (avoids tab icon pointing at production while testing).
  if (process.env.NODE_ENV === "development") {
    return new URL("http://localhost:3100");
  }
  return new URL("https://companyfleetshare.com");
}

export const metadata = {
  metadataBase: metadataBaseUrl(),
  title: "Company Car Sharing",
  description: "Company car sharing – login, reserve cars, manage fleet",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "FleetShare",
    title: "Company Car Sharing",
    description: "Company car sharing – login, reserve cars, manage fleet",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "FleetShare" }],
  },
  twitter: {
    card: "summary",
    title: "Company Car Sharing",
    description: "Company car sharing – login, reserve cars, manage fleet",
    images: ["/icon-512.png"],
  },
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Google Search favicon: ≥48×48 PNG, stable URL; list before ICO/SVG. */}
        <link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon.png" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className={`${inter.variable} ${geistMono.variable} antialiased font-sans`}>
        <I18nProvider>
          <DatabaseOrchestratorProvider>
            {children}
            <AiChatBubble />
          </DatabaseOrchestratorProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
