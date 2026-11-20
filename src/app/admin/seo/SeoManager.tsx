"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import ImageField from "@/components/ImageField";
import {
  GROUPS, ROBOTS_PRESETS, TEMPLATE_TYPES, applyTemplate, clip, jsonLdTemplate, resolveSeo, seoChecks,
  type Group, type PageDefaults, type PageField, type SeoData, type SiteSeo, type StoreInfo, type TemplateType,
} from "@/lib/seo";

export type RailPage = { path: string; label: string; group: Group; title: string; noindex: boolean; custom: boolean };
type Selected = { path: string; label: string; group: Group; defaults: PageDefaults; override: SeoData };
type Props = { pages: RailPage[]; store: StoreInfo; site: SiteSeo; siteStored: boolean; selected: Selected | null };

const SITE_PATH = "*";
const href = (path: string) => `/admin/seo?page=${path === SITE_PATH ? "*" : path.split("/").map(encodeURIComponent).join("/")}`;
const TEMPLATE_LABEL: Record<TemplateType, string> = { Organization: "Organization", WebSite: "WebSite", WebPage: "WebPage", SoftwareApplication: "Product / SoftwareApplication",
  BreadcrumbList: "BreadcrumbList", FAQPage: "FAQPage", Article: "Article" };

export default function SeoManager({ pages, store, site, siteStored, selected }: Props) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => pages.filter((p) => (group === "all" || p.group === group)
    && (!needle || `${p.label} ${p.path} ${p.title}`.toLowerCase().includes(needle)))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group)), [pages, group, needle]);
  const current = selected?.path ?? SITE_PATH;

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
    <aside className="rounded-xl border border-line bg-white lg:sticky lg:top-4" aria-label="Page selection">
      <div className="grid gap-2 border-b border-line p-4">
        <p className="flex items-baseline justify-between"><strong>Pages</strong><span className="text-xs text-ink-soft" data-testid="seo-count">{shown.length} of {pages.length}</span></p>
        <label className="sr-only" htmlFor="seo-search">Search pages</label>
        <input id="seo-search" type="search" className="field-input" placeholder="Search by title or URL" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="seo-group">Filter pages</label>
        <select id="seo-group" className="field-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">All page groups</option>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select>
      </div>
      <ul className="max-h-72 overflow-y-auto p-2 lg:max-h-[calc(100vh-17rem)]">
        <li><RailLink to={SITE_PATH} active={current === SITE_PATH} label="Site defaults" path="Applies to every page" title={site.titleTemplate || `%s | ${store.name}`} flag={siteStored ? "Customised" : ""} /></li>
        {shown.map((p, i) => <li key={p.path}>
          {(i === 0 || shown[i - 1].group !== p.group) && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-ink-soft">{p.group}</p>}
          <RailLink to={p.path} active={current === p.path} label={p.label} path={p.path} title={p.title} flag={p.noindex ? "noindex" : p.custom ? "Customised" : ""} warn={p.noindex} /></li>)}
        {!shown.length && <li className="p-4 text-center text-sm text-ink-soft">No pages match this filter.</li>}
      </ul>
    </aside>
    {selected ? <PageEditor key={selected.path} selected={selected} site={site} store={store} /> : <SiteEditor key="site" site={site} store={store} stored={siteStored} />}
  </div>;
}

function RailLink({ to, active, label, path, title, flag, warn }: { to: string; active: boolean; label: string; path: string; title: string; flag?: string; warn?: boolean }) {
  return <Link href={href(to)} scroll={false} aria-current={active ? "page" : undefined}
    className={`block rounded-2 px-3 py-2 text-sm ${active ? "bg-brand text-white" : "hover:bg-bg-2"}`}>
    <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{label}</span>
      {flag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/20" : warn ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"}`}>{flag}</span>}</span>
    <span className={`block truncate text-xs ${active ? "text-white/80" : "text-ink-soft"}`}>{path}</span>
    <span className={`block truncate text-xs ${active ? "text-white/80" : "text-ink-soft"}`}>{title}</span>
  </Link>;
}

function Counter({ name, length, min, max }: { name: string; length: number; min: number; max: number }) {
  const tone = !length || length > max ? "text-danger" : length < min ? "text-gold" : "text-brand";
  return <small className={`tabular-nums ${tone}`} data-counter={name}>{length} / {max}</small>;
}
const Label = ({ text, children, hint, count }: { text: string; children: ReactNode; hint?: string; count?: ReactNode }) =>
  <label className="grid gap-1 text-sm"><span className="flex items-baseline justify-between gap-2"><span>{text}{hint && <span className="ml-2 text-xs text-ink-soft">{hint}</span>}</span>{count}</span>{children}</label>;

function RobotsField({ value, onChange, placeholder, name = "robots", label = "Robots meta" }: { value: string; onChange: (v: string) => void; placeholder: string; name?: string; label?: string }) {
  return <Label text={label}><span className="flex gap-2">
    <input name={name} className="field-input min-w-0 flex-1" value={value} placeholder={placeholder} maxLength={200} onChange={(e) => onChange(e.target.value)} />
    <select className="field-input w-28 shrink-0 sm:w-40" aria-label="Robots presets" value="" onChange={(e) => e.target.value && onChange(e.target.value)}>
      <option value="">Presets</option>{ROBOTS_PRESETS.map((p) => <option key={p}>{p}</option>)}</select></span></Label>;
}

function JsonLdField({ value, onChange, types, ctx }: { value: string; onChange: (v: string) => void; types: readonly TemplateType[]; ctx: Parameters<typeof jsonLdTemplate>[1] }) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const validate = (format: boolean) => {
    if (!value.trim()) return setStatus({ ok: false, text: "Nothing to validate." });
    try {
      const parsed = JSON.parse(value);
      if (parsed === null || typeof parsed !== "object") throw new Error("JSON-LD must be an object or array.");
      if (format) onChange(JSON.stringify(parsed, null, 2));
      const type = Array.isArray(parsed) ? "list" : String(parsed["@type"] ?? "no @type");
      setStatus({ ok: true, text: `Valid JSON (${type}).` });
    } catch (e) { setStatus({ ok: false, text: e instanceof Error ? e.message : "Not valid JSON." }); }
  };
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <select className="field-input w-auto" aria-label="JSON-LD template" value="" onChange={(e) => { if (e.target.value) { onChange(jsonLdTemplate(e.target.value as TemplateType, ctx)); setStatus(null); } }}>
        <option value="">Insert a template…</option>{types.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}</select>
      <button type="button" className="btn btn-ghost min-h-10 px-4 py-2 text-sm" onClick={() => validate(true)}>Format &amp; validate</button>
      <a className="inline-flex items-center gap-1 text-sm text-brand underline" href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">Rich Results Test <ExternalLink size={13} aria-hidden="true" /></a>
      {status && <span role="status" className={`text-sm ${status.ok ? "text-brand" : "text-danger"}`}>{status.text}</span>}
    </div>
    <Label text="JSON-LD"><textarea name="jsonLd" rows={14} spellCheck={false} className="field-input font-mono text-[13px]" value={value} onChange={(e) => { onChange(e.target.value); setStatus(null); }} /></Label>
  </div>;
}

function useSubmit() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const body = new FormData(e.currentTarget, submitter);
    if (body.get("action") === "reset" && !window.confirm("Reset to defaults? This removes every SEO override for this page.")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/seo", { method: "POST", body, headers: { Accept: "application/json" } });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.to) { window.location.assign(out.to); return; }
      setError(out.error || "Could not save. Try again.");
    } catch { setError("Could not reach the server. Try again."); }
    setBusy(false);
  }
  return { error, busy, submit };
}
const ErrorNote = ({ error }: { error: string }) => error ? <p className="rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert"><strong>Not saved.</strong> {error} Your changes are still in the form.</p> : null;

const EMPTY: Record<PageField, string> = Object.fromEntries(["title", "description", "keywords", "focusKeyword", "canonical", "robots", "ogTitle", "ogType", "ogDescription", "ogImage",
  "twitterCard", "twitterTitle", "twitterDescription", "twitterImage", "sitemapExclude", "sitemapPriority", "sitemapChangefreq", "jsonLd"].map((k) => [k, ""])) as Record<PageField, string>;
const TABS = [["essentials", "Essentials"], ["social", "Social"], ["sitemap", "Sitemap"], ["schema", "Schema"]] as const;

function PageEditor({ selected, site, store }: { selected: Selected; site: SiteSeo; store: StoreInfo }) {
  const { path, label, defaults } = selected;
  const [v, setV] = useState<Record<PageField, string>>({ ...EMPTY, ...selected.override });
  const [tab, setTab] = useState<typeof TABS[number][0]>("essentials");
  const { error, busy, submit } = useSubmit();
  const set = (k: PageField) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const input = (k: PageField) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => set(k)(e.target.value) });
  const base = resolveSeo({ path, defaults, site, store });
  const r = resolveSeo({ path, defaults, site, override: v, store });
  const checks = seoChecks(r, v, defaults);
  const score = checks.filter((c) => c.ok).length;
  const crumbs = r.canonical.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\//g, " › ");
  const social = r.ogImage;
  const isCustom = Object.values(selected.override).some(Boolean);

  return <form onSubmit={submit} className="min-w-0 rounded-xl border border-line bg-white" id="seo-form">
    <input type="hidden" name="path" value={path} />
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-line bg-white p-4">
      <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{label} SEO</h2><p className="truncate text-xs text-ink-soft">{path} · {selected.group}{isCustom ? " · customised" : " · using defaults"}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="action" value="save" className="btn btn-primary min-h-10 px-4 py-2 text-sm" disabled={busy}>{busy ? "Saving…" : "Save SEO"}</button>
        <button type="submit" name="action" value="reset" className="btn btn-ghost min-h-10 px-4 py-2 text-sm" disabled={busy}>Reset to defaults</button>
        <a className="inline-flex items-center gap-1 text-sm text-brand underline" href={path} target="_blank" rel="noopener noreferrer">View page <ExternalLink size={13} aria-hidden="true" /></a>
      </div>
    </div>
    <div className="grid gap-5 p-4 sm:p-5">
      <ErrorNote error={error} />
      <div role="tablist" aria-label="SEO editor sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([key, name]) => <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`} onClick={() => setTab(key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${tab === key ? "border-brand font-medium text-brand" : "border-transparent text-ink-soft hover:text-ink"}`}>{name}</button>)}
      </div>

      <section role="tabpanel" id="panel-essentials" aria-labelledby="tab-essentials" hidden={tab !== "essentials"} className="grid gap-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2 border border-line p-4" aria-label="Google search result preview">
            <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">Search result preview</p>
            <p className="truncate text-[13px] text-ink-soft" data-testid="serp-url">{crumbs}</p>
            <p className="mt-0.5 text-lg leading-snug text-[#1a0dab]" data-testid="serp-title">{clip(r.title, 60)}</p>
            <p className="mt-0.5 text-sm text-ink-soft" data-testid="serp-desc">{clip(r.description, 160)}</p>
          </div>
          <div className="rounded-2 border border-line p-4" aria-label="SEO checks">
            <p className="mb-2 flex items-baseline justify-between text-sm"><span>SEO checks</span><strong data-testid="seo-score">{score}/{checks.length}</strong></p>
            <ul className="grid gap-1 text-sm">{checks.map((c) => <li key={c.label} className={`flex gap-2 ${c.ok ? "text-ink" : "text-ink-soft"}`}>
              <span aria-hidden="true" className={c.ok ? "text-brand" : "text-danger"}>{c.ok ? "✓" : "✗"}</span><span>{c.label}<span className="sr-only">{c.ok ? " (passed)" : " (to do)"}</span></span></li>)}</ul>
          </div>
        </div>
        <h3 className="text-base font-semibold">Page metadata</h3>
        <Label text="Focus keyword"><input {...input("focusKeyword")} maxLength={100} className="field-input" placeholder="e.g. TallyPrime GST add-on" /></Label>
        <Label text="Title tag" count={<Counter name="title" length={r.title.length} min={30} max={60} />}>
          <input {...input("title")} maxLength={120} className="field-input" placeholder={base.title} /></Label>
        <Label text="Meta description" count={<Counter name="description" length={r.description.length} min={120} max={160} />}>
          <textarea {...input("description")} maxLength={320} rows={3} className="field-input" placeholder={base.description} /></Label>
        <Label text="Keywords"><input {...input("keywords")} maxLength={300} className="field-input" placeholder="Comma separated" /></Label>
        <div className="grid gap-4 md:grid-cols-2">
          <Label text="Canonical URL"><input {...input("canonical")} maxLength={500} className="field-input" placeholder={base.canonical} /></Label>
          <RobotsField value={v.robots} onChange={set("robots")} placeholder={base.robots} />
        </div>
      </section>

      <section role="tabpanel" id="panel-social" aria-labelledby="tab-social" hidden={tab !== "social"} className="grid gap-4">
        <h3 className="text-base font-semibold">Social sharing</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Label text="OG title"><input {...input("ogTitle")} maxLength={120} className="field-input" placeholder={base.ogTitle} /></Label>
          <Label text="OG type"><select {...input("ogType")} className="field-input"><option value="">{base.ogType} (default)</option>
            <option value="website">website</option><option value="article">article</option><option value="product">product</option></select></Label>
        </div>
        <Label text="OG description"><textarea {...input("ogDescription")} maxLength={320} rows={2} className="field-input" placeholder={base.ogDescription} /></Label>
        <div className="grid gap-4 md:grid-cols-2">
          <ImageField name="ogImage" label="OG image" value={selected.override.ogImage ?? ""} ratio="1200 / 630" expect={{ width: 1200, height: 630 }} onChange={set("ogImage")}
            hint="1200 × 630 px recommended. JPEG, PNG or WebP, up to 5 MB. Empty uses the page or site default." />
          <ImageField name="twitterImage" label="Twitter image" value={selected.override.twitterImage ?? ""} ratio="1200 / 630" expect={{ width: 1200, height: 630 }} onChange={set("twitterImage")}
            hint="Empty uses the OG image." />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Label text="Twitter card"><select {...input("twitterCard")} className="field-input"><option value="">{base.twitterCard} (default)</option>
            <option value="summary_large_image">summary_large_image</option><option value="summary">summary</option></select></Label>
          <Label text="Twitter title"><input {...input("twitterTitle")} maxLength={120} className="field-input" placeholder={base.twitterTitle} /></Label>
        </div>
        <Label text="Twitter description"><textarea {...input("twitterDescription")} maxLength={320} rows={2} className="field-input" placeholder={base.twitterDescription} /></Label>
        <div className="max-w-md overflow-hidden rounded-2 border border-line" aria-label="Social share preview">
          <div className="grid aspect-[1200/630] place-items-center bg-bg-2 bg-cover bg-center text-xs text-ink-soft" data-testid="social-image"
            style={social ? { backgroundImage: `url("${social.replace(/"/g, "%22")}")` } : undefined}>{social ? "" : "No share image"}</div>
          <div className="grid gap-0.5 p-3 text-sm"><span className="text-xs uppercase text-ink-soft">{new URL(r.canonical, store.url).host}</span>
            <strong data-testid="social-title">{r.ogTitle}</strong><span className="text-ink-soft" data-testid="social-desc">{clip(r.ogDescription, 120)}</span></div>
        </div>
      </section>

      <section role="tabpanel" id="panel-sitemap" aria-labelledby="tab-sitemap" hidden={tab !== "sitemap"} className="grid gap-4">
        <h3 className="text-base font-semibold">Sitemap controls</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Label text="Include in sitemap.xml"><select {...input("sitemapExclude")} className="field-input"><option value="">Yes</option><option value="yes">No, leave out</option></select></Label>
          <Label text="Priority"><select {...input("sitemapPriority")} className="field-input"><option value="">Auto</option>
            {["1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1"].map((p) => <option key={p}>{p}</option>)}</select></Label>
          <Label text="Change frequency"><select {...input("sitemapChangefreq")} className="field-input"><option value="">Auto</option>
            {["daily", "weekly", "monthly", "yearly"].map((p) => <option key={p}>{p}</option>)}</select></Label>
        </div>
        {r.noindex && <p className="text-sm text-gold">This page is noindex, so it is left out of the sitemap whatever is chosen here.</p>}
      </section>

      <section role="tabpanel" id="panel-schema" aria-labelledby="tab-schema" hidden={tab !== "schema"} className="grid gap-4">
        <h3 className="text-base font-semibold">Structured data (JSON-LD)</h3>
        {defaults.hasJsonLd && <p className="text-sm text-ink-soft">This page already prints its own Product data. Anything added here is printed in addition.</p>}
        <JsonLdField value={v.jsonLd} onChange={set("jsonLd")} types={TEMPLATE_TYPES}
          ctx={{ store, path, label, title: r.title, description: r.description, canonical: r.canonical, image: r.ogImage }} />
      </section>
    </div>
  </form>;
}

function SiteEditor({ site, store, stored }: { site: SiteSeo; store: StoreInfo; stored: boolean }) {
  const [v, setV] = useState({ siteName: "", titleTemplate: "", description: "", ogImage: "", robots: "", twitterCard: "", jsonLd: "", ...site });
  const { error, busy, submit } = useSubmit();
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const input = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => set(k)(e.target.value) });
  const name = v.siteName || store.name;
  const template = v.titleTemplate || `%s | ${name}`;
  return <form onSubmit={submit} className="min-w-0 rounded-xl border border-line bg-white" id="seo-form">
    <input type="hidden" name="path" value={SITE_PATH} />
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-line bg-white p-4">
      <div><h2 className="text-lg font-semibold">Site defaults</h2><p className="text-xs text-ink-soft">Used by every page that does not set its own value{stored ? " · customised" : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="action" value="save" className="btn btn-primary min-h-10 px-4 py-2 text-sm" disabled={busy}>{busy ? "Saving…" : "Save SEO"}</button>
        <button type="submit" name="action" value="reset" className="btn btn-ghost min-h-10 px-4 py-2 text-sm" disabled={busy}>Reset to defaults</button>
        <a className="inline-flex items-center gap-1 text-sm text-brand underline" href="/" target="_blank" rel="noopener noreferrer">View page <ExternalLink size={13} aria-hidden="true" /></a>
      </div>
    </div>
    <div className="grid gap-5 p-4 sm:p-5">
      <ErrorNote error={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Label text="Site name"><input {...input("siteName")} maxLength={80} className="field-input" placeholder={store.name} /></Label>
        <Label text="Title suffix / template" hint="%s is the page title"><input {...input("titleTemplate")} maxLength={120} className="field-input" placeholder={`%s | ${store.name}`} /></Label>
      </div>
      <p className="rounded-2 bg-bg-2 px-3 py-2 text-sm text-ink-soft">A page titled “Terms of Use” shows as <strong data-testid="template-sample">{applyTemplate(template, "Terms of Use")}</strong>. A title typed on a page is used exactly as typed.</p>
      <Label text="Default meta description"><textarea {...input("description")} maxLength={320} rows={2} className="field-input" placeholder={store.tagline} /></Label>
      <ImageField name="ogImage" label="Default social image" value={site.ogImage ?? ""} ratio="1200 / 630" expect={{ width: 1200, height: 630 }} onChange={set("ogImage")}
        hint="1200 × 630 px recommended. Used when a page has no image of its own." />
      <div className="grid gap-4 md:grid-cols-2">
        <RobotsField value={v.robots} onChange={set("robots")} placeholder="index, follow" label="Default robots" />
        <Label text="Twitter card"><select {...input("twitterCard")} className="field-input"><option value="">summary_large_image (default)</option>
          <option value="summary_large_image">summary_large_image</option><option value="summary">summary</option></select></Label>
      </div>
      <h3 className="text-base font-semibold">Organization structured data</h3>
      <p className="text-sm text-ink-soft">Printed on the home page.</p>
      <JsonLdField value={v.jsonLd} onChange={set("jsonLd")} types={["Organization", "WebSite"]}
        ctx={{ store, path: "*", label: store.name, title: store.name, description: v.description || store.tagline, canonical: store.url, image: v.ogImage }} />
    </div>
  </form>;
}
