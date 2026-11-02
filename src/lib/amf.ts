import type { Publication } from "./types";

/**
 * Client for the info-financiere.gouv.fr Opendatasoft API (Explore v2.1),
 * referenced on data.gouv.fr as "API Info-Financière".
 * Dataset: flux-amf-new-prod - one record per regulated publication filed with the AMF.
 */
const BASE =
  "https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records";
const PAGE_SIZE = 100; // Opendatasoft maximum per request

/** Raw record shape (only the fields we use). */
export interface AmfRecord {
  uin_idt_uin: string;
  uin_dat_amf: string | null;
  identificationsociete_iso_nom_soc: string | null;
  identificationsociete_iso_cd_isi: string | null;
  identificationsociete_iso_cd_lei: string | null;
  informationdeposee_inf_tit_inf: string | null;
  informationdeposee_inf_stp_inf: string | null;
  informationdeposee_inf_lng_inf: string | null;
  informationdeposee_inf_lst_dif: string[] | null;
  url_de_recuperation: string | null;
  cac40: string | null;
  type_d_information: string | null;
  sous_type_d_information: string | null;
}

const FIELDS = [
  "uin_idt_uin",
  "uin_dat_amf",
  "identificationsociete_iso_nom_soc",
  "identificationsociete_iso_cd_isi",
  "identificationsociete_iso_cd_lei",
  "informationdeposee_inf_tit_inf",
  "informationdeposee_inf_stp_inf",
  "informationdeposee_inf_lng_inf",
  "informationdeposee_inf_lst_dif",
  "url_de_recuperation",
  "cac40",
  "type_d_information",
  "sous_type_d_information",
].join(",");

export async function fetchRecentRecords(days: number): Promise<AmfRecord[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const out: AmfRecord[] = [];
  for (let offset = 0; offset < 10_000; offset += PAGE_SIZE) {
    const url = new URL(BASE);
    url.searchParams.set("select", FIELDS);
    url.searchParams.set("where", `uin_dat_amf >= date'${since}'`);
    url.searchParams.set("order_by", "uin_dat_amf desc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`AMF API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { total_count: number; results: AmfRecord[] };
    out.push(...json.results);
    if (json.results.length < PAGE_SIZE || out.length >= json.total_count) break;
  }
  return out;
}

/** "["005002", "001007"]" (stringified array) or "005002" -> ["005002","001007"] */
export function parseTypeCodes(raw: string | null): string[] {
  if (!raw) return [];
  const t = raw.trim();
  if (t.startsWith("[")) {
    try {
      return (JSON.parse(t) as unknown[]).map(String);
    } catch {
      /* fall through */
    }
  }
  return t.match(/\d{6}/g) ?? [];
}

const PLACEHOLDER_ISIN = /^9{12}$/;

export function normalizeRecord(r: AmfRecord): Omit<Publication, "score" | "scoreReasons" | "selected" | "duplicateOf"> {
  const isin = r.identificationsociete_iso_cd_isi?.trim() || null;
  return {
    id: r.uin_idt_uin,
    company: (r.identificationsociete_iso_nom_soc ?? "Inconnu").trim().replace(/\s+/g, " "),
    isin: isin && !PLACEHOLDER_ISIN.test(isin) ? isin : null,
    lei: r.identificationsociete_iso_cd_lei?.trim() || null,
    publishedAt: r.uin_dat_amf ?? new Date(0).toISOString(),
    title: (r.informationdeposee_inf_tit_inf ?? "(sans titre)").replace(/\s+/g, " ").trim(),
    type: r.type_d_information,
    subtype: r.sous_type_d_information,
    typeCodes: parseTypeCodes(r.informationdeposee_inf_stp_inf),
    language: r.informationdeposee_inf_lng_inf,
    pdfUrl: r.url_de_recuperation,
    cac40: r.cac40 === "1",
    distributionCount: r.informationdeposee_inf_lst_dif?.length ?? 0,
  };
}
