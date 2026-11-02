"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "ecoinfo-theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "◐ Auto", light: "☀ Clair", dark: "☾ Sombre" };

/** Runs before paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try {
      saved = (localStorage.getItem(KEY) as Theme) || "system";
    } catch {}
    setTheme(saved);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let t: Theme = "system";
      try {
        t = (localStorage.getItem(KEY) as Theme) || "system";
      } catch {}
      if (t === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const t = NEXT[theme];
        setTheme(t);
        try {
          localStorage.setItem(KEY, t);
        } catch {}
        apply(t);
      }}
      className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
      title="Thème : automatique, clair ou sombre"
    >
      {LABEL[theme]}
    </button>
  );
}
