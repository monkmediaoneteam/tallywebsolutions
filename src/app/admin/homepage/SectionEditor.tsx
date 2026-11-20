"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import ImageField from "@/components/ImageField";
import { GROUPS, POSITIONS_3X3, newId, typeOf, visible, type Block, type FieldDef, type Settings, type Value } from "@/lib/home-sections";

const input = "field-input mt-1";
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function Field({ field, value, onChange, name, values }: { field: FieldDef; value: Value; onChange: (v: Value) => void; name: string; values: Settings }) {
  if (!visible(field, values)) return null;
  const help = field.help && <span className="mt-1 block text-xs text-ink-soft">{field.help}</span>;
  const wide = field.type === "textarea" || field.type === "image" || field.type === "position" || field.type === "color";
  const wrap = (body: React.ReactNode) => <div className={wide ? "sm:col-span-2" : ""}>{body}</div>;
  switch (field.type) {
    case "textarea":
      return wrap(<label className="text-sm">{field.label}<textarea name={name} rows={4} className={input} maxLength={field.maxLength ?? 2000} value={String(value)} onChange={(e) => onChange(e.target.value)} />{help}</label>);
    case "select":
      return wrap(<label className="text-sm">{field.label}<select name={name} className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {field.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{help}</label>);
    case "checkbox":
      return wrap(<label className="flex items-start gap-2 text-sm"><input name={name} type="checkbox" className="mt-1 h-4 w-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}{help}</span></label>);
    case "range":
      return wrap(<label className="text-sm"><span className="flex items-baseline justify-between">{field.label}<output className="tabular-nums text-ink-soft">{String(value)}{field.unit ? ` ${field.unit}` : ""}</output></span>
        <input name={name} type="range" className="mt-2 w-full" min={field.min} max={field.max} step={field.step ?? 1} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />{help}</label>);
    case "color": {
      const text = String(value);
      return wrap(<div className="text-sm"><label htmlFor={`${name}-hex`}>{field.label}</label>
        <div className="mt-1 flex items-center gap-2">
          <input type="color" aria-label={`${field.label} picker`} className="h-10 w-12 cursor-pointer rounded-1 border border-line bg-white p-1" value={HEX.test(text) && text.length === 7 ? text : "#000000"} onChange={(e) => onChange(e.target.value)} />
          <input id={`${name}-hex`} name={name} className="field-input w-32" maxLength={7} placeholder="Theme" spellCheck={false} value={text} onChange={(e) => onChange(e.target.value.trim())} aria-invalid={text !== "" && !HEX.test(text)} />
          {text && <button type="button" className="text-xs text-ink-soft underline" onClick={() => onChange("")}>Use theme colour</button>}
        </div>{help}</div>);
    }
    case "position":
      return wrap(<fieldset className="text-sm"><legend>{field.label}</legend>
        <div className="mt-1 grid w-40 grid-cols-3 gap-1 rounded-2 border border-line bg-bg-2 p-1" role="radiogroup" aria-label={field.label}>
          {POSITIONS_3X3.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={l} title={l} onClick={() => onChange(v)}
            className={`grid h-9 place-items-center rounded-1 ${value === v ? "bg-brand" : "bg-white hover:bg-bg-3"}`}><span className={`h-2.5 w-2.5 rounded-full ${value === v ? "bg-white" : "bg-ink-soft/50"}`} /></button>)}
        </div>{help}</fieldset>);
    case "image":
      return wrap(<ImageField name={name} label={field.label} value={String(value)} expect={field.expect} ratio={field.expect ? `${field.expect.width} / ${field.expect.height}` : "16 / 7"} hint={field.help} />);
    default:
      return wrap(<label className="text-sm">{field.label}<input name={name} className={input} maxLength={field.maxLength ?? 200} placeholder={field.placeholder} value={String(value)} onChange={(e) => onChange(e.target.value)} />{help}</label>);
  }
}

export default function SectionEditor({ id, type, settings: initial, blocks: initialBlocks }: { id: string; type: string; settings: Settings; blocks: Block[] }) {
  const t = typeOf(type)!;
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(initial);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (fieldId: string) => (v: Value) => setSettings((s) => ({ ...s, [fieldId]: v }));
  const setBlock = (blockId: string, fieldId: string) => (v: Value) => setBlocks((all) => all.map((b) => (b.id === blockId ? { ...b, settings: { ...b.settings, [fieldId]: v } } : b)));
  const move = (i: number, d: number) => setBlocks((all) => { const next = [...all]; const j = i + d; if (j < 0 || j >= next.length) return all; [next[i], next[j]] = [next[j], next[i]]; return next; });
  const bd = t.blocks;
  const blockDefaults = () => Object.fromEntries(bd!.fields.map((x) => [x.id, x.default])) as Settings;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    // Image fields keep their address in a hidden input managed by the uploader.
    const data = new FormData(event.currentTarget);
    const out: Settings = { ...settings };
    for (const x of t.fields) if (x.type === "image") out[x.id] = String(data.get(`s.${x.id}`) ?? "");
    const outBlocks = blocks.map((b) => ({ id: b.id, settings: Object.fromEntries(bd!.fields.map((x) => [x.id, x.type === "image" ? String(data.get(`b.${b.id}.${x.id}`) ?? "") : b.settings[x.id]])) }));
    try {
      const res = await fetch("/api/admin/homepage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", id, settings: out, ...(bd ? { blocks: outBlocks } : {}) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "Could not save. Reload and try again."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      router.push(body.to); router.refresh();
    } catch { setError("Could not reach the server. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  const fieldsIn = (group: string) => t.fields.filter((x) => x.group === group);
  return <form onSubmit={submit} className="grid gap-6" noValidate>
    {error && <p className="rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error} Your changes are still here; fix this and save again.</p>}
    {GROUPS.map((group) => {
      const list = fieldsIn(group).filter((x) => visible(x, settings));
      const showBlocks = group === "Content" && bd;
      if (!list.length && !showBlocks) return null;
      return <div key={group} className="grid gap-6">
        {list.length > 0 && <fieldset className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
          <legend className="px-1 text-base font-semibold">{group}</legend>
          {fieldsIn(group).map((x) => <Field key={x.id} field={x} name={`s.${x.id}`} value={settings[x.id] ?? x.default} onChange={set(x.id)} values={settings} />)}
        </fieldset>}
        {showBlocks && <fieldset className="grid gap-3 rounded-xl border border-line bg-white p-5">
          <legend className="px-1 text-base font-semibold">{bd.label}</legend>
          {blocks.length === 0 && <p className="text-sm text-ink-soft">No {bd.label.toLowerCase()} yet.</p>}
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3">{blocks.map((b, i) => <li key={b.id} data-block={b.id} className="rounded-2 border border-line bg-bg-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{bd.itemLabel} {i + 1}{b.settings[bd.titleField] ? `: ${String(b.settings[bd.titleField])}` : ""}</p>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="grid h-8 w-8 place-items-center rounded-1 hover:bg-bg-3 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${bd.itemLabel.toLowerCase()} ${i + 1} up`}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="grid h-8 w-8 place-items-center rounded-1 hover:bg-bg-3 disabled:opacity-30" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${bd.itemLabel.toLowerCase()} ${i + 1} down`}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="grid h-8 w-8 place-items-center rounded-1 text-danger hover:bg-danger/10" onClick={() => setBlocks((all) => all.filter((x) => x.id !== b.id))} aria-label={`Remove ${bd.itemLabel.toLowerCase()} ${i + 1}`}><X size={16} aria-hidden="true" /></button>
              </div></div>
            <div className="grid gap-3 sm:grid-cols-2">{bd.fields.map((x) => <Field key={x.id} field={x} name={`b.${b.id}.${x.id}`} value={b.settings[x.id] ?? x.default} onChange={setBlock(b.id, x.id)} values={b.settings} />)}</div>
          </li>)}</ol>
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-ghost min-h-10 px-4 py-2 text-sm" disabled={blocks.length >= bd.max} onClick={() => setBlocks((all) => [...all, { id: newId(), settings: blockDefaults() }])}><Plus size={15} aria-hidden="true" />Add {bd.itemLabel.toLowerCase()}</button>
            <span className="text-xs text-ink-soft">{blocks.length} of {bd.max}</span>
          </div>
        </fieldset>}
      </div>;
    })}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      <a className="btn btn-ghost" href="/admin/homepage">Cancel</a>
    </div>
  </form>;
}
