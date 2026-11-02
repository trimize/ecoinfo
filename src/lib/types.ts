/** A publication as stored by the app (normalised from the AMF flux record). */
export interface Publication {
  id: string; // uin_idt_uin, e.g. "652916_20261102"
  company: string;
  isin: string | null; // null when the feed gives the "999999999999" placeholder
  lei: string | null;
  publishedAt: string; // ISO, from uin_dat_amf (date the AMF received it)
  title: string;
  type: string | null; // type_d_information (FR label)
  subtype: string | null; // sous_type_d_information (FR label)
  typeCodes: string[]; // informationdeposee_inf_stp_inf, can hold several LOV codes
  language: string | null; // "Français" | "Anglais"
  pdfUrl: string | null;
  cac40: boolean;
  distributionCount: number; // number of wires the release was sent to
  score: number;
  scoreReasons: string[];
  selected: boolean;
  duplicateOf: string | null; // id of the preferred version (FR/EN pair)
}

export type FigureStatus = "verified" | "rounded" | "not_found";

export interface FigureCheck {
  raw: string; // as written in the summary, e.g. "1,2 Md€"
  normalized: number;
  status: FigureStatus;
  evidence: string | null; // excerpt of the source around the match
  matchedAs: string | null; // which source token / conversion matched
}

export interface Summary {
  id: string;
  publicationId: string;
  title: string;
  body: string;
  keyFacts: string[];
  sourceUrl: string;
  wordCount: number;
  figures: FigureCheck[];
  status: "verified" | "needs_review" | "unverifiable";
  statusReason: string;
  model: string;
  sourceChars: number;
  sourceTruncated: boolean;
  createdAt: string;
}

export interface PublicationFilters {
  company?: string;
  type?: string;
  subtype?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  selectedOnly?: boolean;
  hideDuplicates?: boolean;
}

export type Period = "day" | "month" | "year";

export interface ReportSource {
  id: string;
  company: string;
  title: string;
  publishedAt: string;
  pdfUrl: string | null;
  score: number;
  subtype: string | null;
  hasBrief: boolean;
}

export interface ReportEvent {
  title: string;
  summary: string;
  whyItMatters: string;
  tone: "positif" | "négatif" | "neutre" | "mixte";
  companies: string[];
  sourceIds: string[];
  figures: FigureCheck[];
  status: "verified" | "needs_review";
}

export interface Report {
  id: string; // `${period}:${key}`
  period: Period;
  key: string; // 2026-11-02 | 2026-11 | 2026
  from: string;
  to: string;
  headline: string;
  overview: string;
  overviewFigures: FigureCheck[];
  events: ReportEvent[];
  sources: ReportSource[]; // candidates given to the model (all backed by an AMF document)
  publicationsInPeriod: number;
  droppedEvents: number; // events rejected because they cited no valid source
  status: "verified" | "needs_review";
  statusReason: string;
  model: string;
  createdAt: string;
}
