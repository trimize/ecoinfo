export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

export const shortSubtype = (s: string | null) => s ?? "— (non renseigné)";
