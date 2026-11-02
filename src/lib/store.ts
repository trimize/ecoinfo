import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import type { Brief, Publication, PublicationFilters, Report } from "./types";

/**
 * Storage: Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise a local JSON file (.data/db.json) so the app runs with zero setup.
 */
export interface Store {
  upsertPublications(pubs: Publication[]): Promise<void>;
  listPublications(f: PublicationFilters): Promise<Publication[]>;
  getPublication(id: string): Promise<Publication | null>;
  facets(): Promise<{ companies: string[]; types: string[]; subtypes: string[] }>;
  saveBrief(b: Brief): Promise<void>;
  listBriefs(): Promise<Brief[]>;
  getBriefByPublication(id: string): Promise<Brief | null>;
  /** Most newsworthy, non-duplicate publications of [from, to] (YYYY-MM-DD, inclusive). */
  topPublications(from: string, to: string, minScore: number, limit: number): Promise<Publication[]>;
  countPublications(from: string, to: string): Promise<number>;
  /** Latest day (YYYY-MM-DD) that has publications, or null. */
  latestDay(): Promise<string | null>;
  saveReport(r: Report): Promise<void>;
  getReport(id: string): Promise<Report | null>;
  listReports(): Promise<Pick<Report, "id" | "period" | "key" | "headline" | "createdAt">[]>;
}

// ---------- shared filtering for the local store ----------
function matches(p: Publication, f: PublicationFilters) {
  if (f.company && p.company !== f.company) return false;
  if (f.type && p.type !== f.type) return false;
  if (f.subtype && p.subtype !== f.subtype) return false;
  if (f.from && p.publishedAt.slice(0, 10) < f.from) return false;
  if (f.to && p.publishedAt.slice(0, 10) > f.to) return false;
  if (f.selectedOnly && !p.selected) return false;
  if (f.hideDuplicates && p.duplicateOf) return false;
  return true;
}
const uniqSorted = (xs: (string | null)[]) =>
  [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "fr"));

// ---------- local JSON ----------
class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "db.json");
  private async read(): Promise<{
    publications: Record<string, Publication>;
    briefs: Record<string, Brief>;
    reports: Record<string, Report>;
  }> {
    try {
      const db = JSON.parse(await fs.readFile(this.file, "utf8"));
      return { publications: {}, briefs: {}, reports: {}, ...db };
    } catch {
      return { publications: {}, briefs: {}, reports: {} };
    }
  }
  private async write(db: Awaited<ReturnType<FileStore["read"]>>) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(db));
  }
  async upsertPublications(pubs: Publication[]) {
    const db = await this.read();
    for (const p of pubs) db.publications[p.id] = p;
    await this.write(db);
  }
  async listPublications(f: PublicationFilters) {
    const db = await this.read();
    return Object.values(db.publications)
      .filter((p) => matches(p, f))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async getPublication(id: string) {
    return (await this.read()).publications[id] ?? null;
  }
  async facets() {
    const ps = Object.values((await this.read()).publications);
    return {
      companies: uniqSorted(ps.map((p) => p.company)),
      types: uniqSorted(ps.map((p) => p.type)),
      subtypes: uniqSorted(ps.map((p) => p.subtype)),
    };
  }
  async saveBrief(b: Brief) {
    const db = await this.read();
    db.briefs[b.publicationId] = b;
    await this.write(db);
  }
  async listBriefs() {
    return Object.values((await this.read()).briefs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getBriefByPublication(id: string) {
    return (await this.read()).briefs[id] ?? null;
  }
  async topPublications(from: string, to: string, minScore: number, limit: number) {
    return (await this.listPublications({ from, to, hideDuplicates: true }))
      .filter((p) => p.score >= minScore)
      .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, limit);
  }
  async countPublications(from: string, to: string) {
    return (await this.listPublications({ from, to })).length;
  }
  async latestDay() {
    const ps = Object.values((await this.read()).publications);
    return ps.length ? ps.reduce((m, p) => (p.publishedAt > m ? p.publishedAt : m), "").slice(0, 10) : null;
  }
  async saveReport(r: Report) {
    const db = await this.read();
    db.reports[r.id] = r;
    await this.write(db);
  }
  async getReport(id: string) {
    return (await this.read()).reports[id] ?? null;
  }
  async listReports() {
    return Object.values((await this.read()).reports)
      .map(({ id, period, key, headline, createdAt }) => ({ id, period, key, headline, createdAt }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }
}

// ---------- Supabase ----------
type PubRow = {
  id: string;
  company: string;
  isin: string | null;
  lei: string | null;
  published_at: string;
  title: string;
  type: string | null;
  subtype: string | null;
  type_codes: string[];
  language: string | null;
  pdf_url: string | null;
  cac40: boolean;
  distribution_count: number;
  score: number;
  score_reasons: string[];
  selected: boolean;
  duplicate_of: string | null;
};
const toRow = (p: Publication): PubRow => ({
  id: p.id,
  company: p.company,
  isin: p.isin,
  lei: p.lei,
  published_at: p.publishedAt,
  title: p.title,
  type: p.type,
  subtype: p.subtype,
  type_codes: p.typeCodes,
  language: p.language,
  pdf_url: p.pdfUrl,
  cac40: p.cac40,
  distribution_count: p.distributionCount,
  score: p.score,
  score_reasons: p.scoreReasons,
  selected: p.selected,
  duplicate_of: p.duplicateOf,
});
const fromRow = (r: PubRow): Publication => ({
  id: r.id,
  company: r.company,
  isin: r.isin,
  lei: r.lei,
  publishedAt: new Date(r.published_at).toISOString(),
  title: r.title,
  type: r.type,
  subtype: r.subtype,
  typeCodes: r.type_codes ?? [],
  language: r.language,
  pdfUrl: r.pdf_url,
  cac40: r.cac40,
  distributionCount: r.distribution_count,
  score: r.score,
  scoreReasons: r.score_reasons ?? [],
  selected: r.selected,
  duplicateOf: r.duplicate_of,
});

class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.data;
  }
  async upsertPublications(pubs: Publication[]) {
    for (let i = 0; i < pubs.length; i += 500) {
      this.check(await this.db.from("publications").upsert(pubs.slice(i, i + 500).map(toRow)));
    }
  }
  async listPublications(f: PublicationFilters) {
    let q = this.db.from("publications").select("*").order("published_at", { ascending: false }).limit(2000);
    if (f.company) q = q.eq("company", f.company);
    if (f.type) q = q.eq("type", f.type);
    if (f.subtype) q = q.eq("subtype", f.subtype);
    if (f.from) q = q.gte("published_at", f.from);
    if (f.to) q = q.lt("published_at", new Date(Date.parse(f.to) + 86_400_000).toISOString());
    if (f.selectedOnly) q = q.eq("selected", true);
    if (f.hideDuplicates) q = q.is("duplicate_of", null);
    return (this.check(await q) as PubRow[]).map(fromRow);
  }
  async getPublication(id: string) {
    const r = this.check(await this.db.from("publications").select("*").eq("id", id).maybeSingle()) as PubRow | null;
    return r ? fromRow(r) : null;
  }
  async facets() {
    const rows = this.check(
      await this.db.from("publications").select("company,type,subtype").limit(10000),
    ) as Pick<PubRow, "company" | "type" | "subtype">[];
    return {
      companies: uniqSorted(rows.map((r) => r.company)),
      types: uniqSorted(rows.map((r) => r.type)),
      subtypes: uniqSorted(rows.map((r) => r.subtype)),
    };
  }
  async saveBrief(b: Brief) {
    this.check(
      await this.db.from("briefs").upsert(
        {
          publication_id: b.publicationId,
          id: b.id,
          data: b,
          status: b.status,
          created_at: b.createdAt,
        },
        { onConflict: "publication_id" },
      ),
    );
  }
  async listBriefs() {
    const rows = this.check(
      await this.db.from("briefs").select("data").order("created_at", { ascending: false }),
    ) as { data: Brief }[];
    return rows.map((r) => r.data);
  }
  async getBriefByPublication(id: string) {
    const r = this.check(
      await this.db.from("briefs").select("data").eq("publication_id", id).maybeSingle(),
    ) as { data: Brief } | null;
    return r?.data ?? null;
  }
  private range<Q extends { gte(column: string, value: string): Q; lt(column: string, value: string): Q }>(q: Q, from: string, to: string) {
    return q.gte("published_at", from).lt("published_at", new Date(Date.parse(to) + 86_400_000).toISOString());
  }
  async topPublications(from: string, to: string, minScore: number, limit: number) {
    const q = this.db.from("publications").select("*").is("duplicate_of", null).gte("score", minScore);
    const rows = this.check(
      await this.range(q, from, to).order("score", { ascending: false }).order("published_at", { ascending: false }).limit(limit),
    ) as PubRow[];
    return rows.map(fromRow);
  }
  async countPublications(from: string, to: string) {
    const res = await this.range(this.db.from("publications").select("id", { count: "exact", head: true }), from, to);
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.count ?? 0;
  }
  async latestDay() {
    const r = this.check(
      await this.db.from("publications").select("published_at").order("published_at", { ascending: false }).limit(1).maybeSingle(),
    ) as { published_at: string } | null;
    return r ? new Date(r.published_at).toISOString().slice(0, 10) : null;
  }
  async saveReport(r: Report) {
    this.check(
      await this.db.from("reports").upsert({ id: r.id, period: r.period, key: r.key, data: r, created_at: r.createdAt }),
    );
  }
  async getReport(id: string) {
    const r = this.check(await this.db.from("reports").select("data").eq("id", id).maybeSingle()) as { data: Report } | null;
    return r?.data ?? null;
  }
  async listReports() {
    const rows = this.check(
      await this.db.from("reports").select("id,period,key,data->>headline,created_at").order("key", { ascending: false }),
    ) as { id: string; period: Report["period"]; key: string; headline: string; created_at: string }[];
    return rows.map((r) => ({ id: r.id, period: r.period, key: r.key, headline: r.headline, createdAt: r.created_at }));
  }
}

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  // Accept the REST endpoint too ("https://x.supabase.co/rest/v1/"): supabase-js wants the project URL.
  const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })) : new FileStore();
  return store;
}
export const storageKind = () => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local");
