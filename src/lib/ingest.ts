import { fetchRecentRecords, normalizeRecord } from "./amf";
import { rankAndSelect } from "./scoring";
import { getStore } from "./store";

export async function ingest(days = 5) {
  const records = await fetchRecentRecords(days);
  // The feed can return the same uin twice: keep the last occurrence.
  const byId = new Map(records.map((r) => [r.uin_idt_uin, normalizeRecord(r)]));
  const pubs = rankAndSelect([...byId.values()]);
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
