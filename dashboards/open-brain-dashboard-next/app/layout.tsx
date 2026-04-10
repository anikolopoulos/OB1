import type { Metadata } from "next";
import { Noto_Serif, Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["300"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Open Brain",
  description: "Second brain dashboard",
};

// Static dark-mode bootstrap — runs before first paint to prevent flash.
// This is a hardcoded string literal with no user input (safe, no XSS risk).
// Same pattern used by next-themes, Tailwind docs, and Vercel templates.
const themeScript = [
  "(function(){",
  "var t=localStorage.getItem('theme');",
  "if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){",
  "document.documentElement.classList.add('dark')",
  "}",
  "})()",
].join("");

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const brainName = session.brainName;

  return (
    <html
      lang="en"
      className={`${notoSerif.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex bg-bg-primary text-text-primary font-sans font-light">
        <Sidebar brainName={brainName} />
        <main className="flex-1 ml-56 min-h-screen">
          <div className="max-w-6xl mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
