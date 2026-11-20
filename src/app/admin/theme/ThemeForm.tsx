"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { THEME_FIELDS, themeWarnings, type Theme } from "@/lib/theme";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function ThemeForm({ initial, customised }: { initial: Theme; customised: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Theme>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = THEME_FIELDS.filter((f) => f.type === "color").every((f) => HEX.test(values[f.id]));
  const warnings = valid ? themeWarnings(values) : [];

  async function post(body: object) {
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/admin/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || "Could not save. Reload and try again."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      router.push(out.to); router.refresh();
      if ((body as { action?: string }).action === "reset") setValues(Object.fromEntries(THEME_FIELDS.map((f) => [f.id, f.default])));
    } catch { setError("Could not reach the server. Try again."); }
    finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); post({ action: "save", theme: values }); };
  const groups = [...new Set(THEME_FIELDS.map((f) => f.group))];

  return <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
    {error && <p className="rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error} Your changes are still here.</p>}
    {warnings.length > 0 && <div className="rounded-2 border border-gold/40 bg-bg-2 px-4 py-3 text-[15px]" role="status"><strong>Low contrast.</strong>
      <ul className="mt-1 list-disc pl-5 text-sm">{warnings.map((w) => <li key={w}>{w}</li>)}</ul><p className="mt-1 text-xs text-ink-soft">Hard-to-read text is a problem for many visitors. You can still save.</p></div>}
    {groups.map((group) => <fieldset key={group} className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
      <legend className="px-1 text-base font-semibold">{group}</legend>
      {THEME_FIELDS.filter((f) => f.group === group).map((f) => f.type === "color"
        ? <div key={f.id} className="text-sm"><label htmlFor={`t-${f.id}`}>{f.label}</label>
          <div className="mt-1 flex items-center gap-2">
            <input type="color" aria-label={`${f.label} picker`} className="h-10 w-12 cursor-pointer rounded-1 border border-line bg-white p-1" value={HEX.test(values[f.id]) && values[f.id].length === 7 ? values[f.id] : "#000000"} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} />
            <input id={`t-${f.id}`} className="field-input w-32" maxLength={7} spellCheck={false} value={values[f.id]} aria-invalid={!HEX.test(values[f.id])} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value.trim() }))} />
          </div>{f.help && <span className="mt-1 block text-xs text-ink-soft">{f.help}</span>}</div>
        : <label key={f.id} className="text-sm">{f.label}<select className="field-input mt-1" value={values[f.id]} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}>
          {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>)}
    </fieldset>)}
    <div className="rounded-xl border border-line p-5" style={{ background: values.bg, color: values.ink }} aria-label="Preview">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: .7 }}>Preview</p>
      <p className="mt-1 text-xl font-medium">A heading in your text colour</p>
      <p className="mt-1 text-sm">Body text, and a <span style={{ color: values.link, textDecoration: "underline" }}>link in your link colour</span>.</p>
      <span className="mt-3 inline-block px-5 py-2.5 text-sm font-medium text-white" style={{ background: values.brand, borderRadius: values.button === "pill" ? 999 : values.button === "square" ? 2 : 12 }}>Button</span>
      <span className="ml-3 inline-block h-3 w-3 rounded-full align-middle" style={{ background: values.accent }} aria-hidden="true" />
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-primary" disabled={busy || !valid}>{busy ? "Saving..." : "Save theme"}</button>
      <button type="button" className="btn btn-ghost" disabled={busy || !customised} onClick={() => { if (window.confirm("Put the theme back to the store's default colours and shapes?")) post({ action: "reset" }); }}><RotateCcw size={16} aria-hidden="true" />Reset to defaults</button>
    </div>
  </form>;
}
