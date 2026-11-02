import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle, themeInitScript } from "@/components/ThemeToggle";
import { isPro } from "@/lib/auth";
import { storageKind } from "@/lib/store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EcoInfo · Synthèses AMF",
  description: "Synthèses et résumés vérifiés des publications réglementées AMF (info-financiere.gouv.fr)",
};

const NAV = [
  ["/", "Synthèses"],
  ["/publications", "Publications"],
  ["/resumes", "Résumés"],
  ["/methode", "Méthode"],
] as const;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pro = await isPro();
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Eco<span className="text-emerald-700">Info</span>
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-stone-900">
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/abonnement"
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pro ? "bg-emerald-100 text-emerald-800" : "border border-stone-300 text-stone-600 hover:border-emerald-600 hover:text-emerald-700"}`}
              >
                {pro ? "✦ Pro Recruteur" : "Plan Découverte · Passer Pro"}
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-stone-400">
          Source : info-financiere.gouv.fr (AMF), open data · stockage : {storageKind()} · Les synthèses sont générées par IA à partir des seuls documents cités ; vérifiez toujours la source avant de décider.
        </footer>
      </body>
    </html>
  );
}
