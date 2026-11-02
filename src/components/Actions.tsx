"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const btn =
  "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

/** What a visitor on the free plan sees instead of an action button. */
export function LockedButton({ label }: { label: string }) {
  return (
    <Link
      href="/abonnement"
      className={`${btn} border border-dashed border-stone-300 text-stone-500 hover:border-emerald-600 hover:text-emerald-700`}
      title="Fonctionnalité du plan Pro Recruteur"
    >
      🔒 {label} <span className="text-xs">· Pro</span>
    </Link>
  );
}

async function errorOf(res: Response) {
  try {
    return (await res.json()).error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function SyncButton({ pro }: { pro: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!pro) return <LockedButton label="Synchroniser" />;
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
          className="w-14 rounded border border-stone-300 bg-white px-1 py-0.5"
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
          if (res.ok) {
            const json = await res.json();
            setMsg(`${json.stored} publications, ${json.selected.length} retenues`);
          } else setMsg(`Erreur : ${await errorOf(res)}`);
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
export function GenerateButton({ ids, label, pro }: { ids: string[]; label: string; pro: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!pro) return <LockedButton label={label} />;
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
            if (!res.ok) errors.push(await errorOf(res));
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

export function ReportButton({ period, periodKey, label, pro }: { period: string; periodKey: string; label: string; pro: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!pro) return <LockedButton label={label} />;
  return (
    <div className="flex items-center gap-2">
      <button
        className={`${btn} bg-emerald-700 text-white hover:bg-emerald-600`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("Analyse des publications de la période… (jusqu'à une minute)");
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ period, key: periodKey }),
          });
          setMsg(res.ok ? null : `Erreur : ${await errorOf(res)}`);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Rédaction en cours…" : label}
      </button>
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
    </div>
  );
}

export function UnlockForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        setBusy(false);
        if (res.ok) {
          setPassword("");
          router.refresh();
        } else setError(await errorOf(res));
      }}
    >
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Code d'accès"
        autoComplete="current-password"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
      />
      <button className={`${btn} w-full bg-emerald-700 text-white hover:bg-emerald-600`} disabled={busy || !password}>
        {busy ? "Vérification…" : "Activer le plan Pro"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-xs text-stone-500 underline hover:text-stone-800"
      onClick={async () => {
        await fetch("/api/auth", { method: "DELETE" });
        router.refresh();
      }}
    >
      Résilier (sans frais, sans préavis, sans rancune)
    </button>
  );
}
