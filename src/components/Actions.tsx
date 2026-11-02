"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const btn =
  "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

export function SyncButton() {
  const router = useRouter();
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-stone-600">
        Derniers{" "}
        <input
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-14 rounded border border-stone-300 px-1 py-0.5"
        />{" "}
        jours
      </label>
      <button
        className={`${btn} bg-stone-900 text-white hover:bg-stone-700`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetch(`/api/ingest?days=${days}`, { method: "POST" });
          const json = await res.json();
          setMsg(res.ok ? `${json.stored} publications, ${json.selected.length} retenues` : `Erreur : ${json.error}`);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Synchronisation…" : "Synchroniser"}
      </button>
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
    </div>
  );
}

/** Generates briefs one publication per request (keeps each serverless call short). */
export function GenerateButton({ ids, label }: { ids: string[]; label: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button
        className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`}
        disabled={busy || ids.length === 0}
        onClick={async () => {
          setBusy(true);
          const errors: string[] = [];
          for (let i = 0; i < ids.length; i++) {
            setProgress(`${i + 1}/${ids.length}…`);
            const res = await fetch("/api/briefs", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ publicationId: ids[i] }),
            });
            if (!res.ok) errors.push((await res.json()).error);
            router.refresh();
          }
          setProgress(errors.length ? `Erreurs : ${errors.join(" / ")}` : "Terminé");
          setBusy(false);
        }}
      >
        {busy ? "Génération…" : label}
      </button>
      {progress && <span className="text-xs text-stone-500">{progress}</span>}
    </div>
  );
}
