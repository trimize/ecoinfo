import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { storageKind } from "@/lib/store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EcoInfo · Brèves AMF",
  description: "Publications réglementées AMF (info-financiere.gouv.fr) et brèves vérifiées générées par IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Eco<span className="text-emerald-700">Info</span>
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">Publications</Link>
              <Link href="/briefs" className="hover:text-stone-900">Brèves</Link>
              <Link href="/methode" className="hover:text-stone-900">Méthode</Link>
            </nav>
            <span className="ml-auto text-xs text-stone-400">
              Source : info-financiere.gouv.fr (AMF) · stockage : {storageKind()}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
