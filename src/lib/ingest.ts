import { fetchRange, fetchRecentRecords, normalizeRecord, type AmfRecord } from "./amf";
import { rankAndSelect } from "./scoring";
import { getStore } from "./store";

const dedupe = (records: AmfRecord[]) => [...new Map(records.map((r) => [r.uin_idt_uin, normalizeRecord(r)])).values()];

/** Sync the last `days` days and pick the publications that deserve a brief. */
export async function ingest(days = 5) {
  const records = await fetchRecentRecords(days);
  // The feed can return the same uin twice: keep one.
  const pubs = rankAndSelect(dedupe(records));
  const store = getStore();
  // Selection is relative to the latest sync window: un-select older picks outside it.
  const ids = new Set(pubs.map((p) => p.id));
  const stale = (await store.listPublications({ selectedOnly: true }))
    .filter((p) => !ids.has(p.id))
    .map((p) => ({ ...p, selected: false }));
  await store.upsertPublications([...pubs, ...stale]);
  return {
    fetched: records.length,
    stored: pubs.length,
    duplicatesFrEn: pubs.filter((p) => p.duplicateOf).length,
    selected: pubs.filter((p) => p.selected).map((p) => ({ id: p.id, company: p.company, title: p.title, score: p.score })),
  };
}

/**
 * Load history (for month / year summaries) month by month. Publications are scored and
 * de-duplicated, but the brief selection of the latest sync is left untouched.
 */
export async function backfill(from: string, to: string, log: (s: string) => void = () => {}) {
  const store = getStore();
  const keepSelected = new Set((await store.listPublications({ selectedOnly: true })).map((p) => p.id));
  let total = 0;
  for (let start = from; start <= to; ) {
    const d = new Date(start + "T00:00:00Z");
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    const pubs = rankAndSelect(dedupe(await fetchRange(start, end))).map((p) => ({ ...p, selected: keepSelected.has(p.id) }));
    await store.upsertPublications(pubs);
    total += pubs.length;
    log(`${start} → ${end} : ${pubs.length} publications`);
    start = new Date(Date.parse(monthEnd) + 86_400_000).toISOString().slice(0, 10);
  }
  return total;
}
