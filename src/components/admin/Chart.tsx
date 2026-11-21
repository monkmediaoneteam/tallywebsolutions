"use client";

import { useEffect, useRef } from "react";
import { rupees as money } from "@/lib/money";

export type Format = "money" | "count" | "percent";
export type Series = {
  label: string; data: number[]; format?: Format;
  /** combo charts: draw this series as a line or as bars */
  as?: "bar" | "line"; axis?: "left" | "right"; colour?: string; dashed?: boolean; stack?: string;
};
export type ChartProps = {
  kind: "bar" | "line" | "doughnut" | "combo"; labels: string[]; series: Series[]; ariaLabel: string;
  height?: number; horizontal?: boolean; stacked?: boolean; heat?: boolean; legend?: boolean;
};

// Paise to rupees. Whole rupees print without decimals, like the rest of the admin.
const compact = (n: number) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const formatValue = (v: number, f: Format = "count") => f === "money" ? money(v) : f === "percent" ? `${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%` : v.toLocaleString("en-IN");
const axisValue = (v: number, f: Format = "count") => f === "money" ? money(v) : f === "percent" ? `${v}%` : compact(v);

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
const alpha = (hex: string, a: number) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Chart.js in a canvas, sized by its container. Needs plain JSON; screen readers get the same numbers as a table. */
export default function Chart({ kind, labels, series, ariaLabel, height = 280, horizontal = false, stacked = false, heat = false, legend = true }: ChartProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([kind, labels, series, horizontal, stacked, heat, legend]);

  useEffect(() => {
    let chart: { destroy(): void } | undefined, cancelled = false;
    (async () => {
      const C = await import("chart.js");
      if (cancelled || !canvas.current) return;
      C.Chart.register(C.BarController, C.LineController, C.DoughnutController, C.CategoryScale, C.LinearScale, C.BarElement, C.LineElement, C.PointElement, C.ArcElement, C.Tooltip, C.Legend, C.Filler);
      const brand = css("--brand", "#2e2e7e"), ink = css("--ink-soft", "#4a4a58"), line = css("--line", "#e4e5ee");
      const palette = [brand, css("--gold", "#299637"), css("--brand-glow", "#7d7fe0"), "#d98a1c", css("--danger", "#b3261e"), "#2b9bb5", "#8a5cc2", "#7a7a88"];
      const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const fmt = (i: number) => series[i]?.format ?? "count";
      const pie = kind === "doughnut";
      const maxOf = Math.max(1, ...(series[0]?.data ?? []));
      const rightAxis = (s: Series) => s.axis === "right" || (s.axis === undefined && kind === "combo" && s.format === "money");
      const datasets = series.map((s, i) => {
        const colour = s.colour ?? (kind === "combo" && s.format === "money" ? brand : palette[i % palette.length]);
        if (pie) return { label: s.label, data: s.data, backgroundColor: labels.map((_, j) => palette[j % palette.length]), borderColor: css("--bg", "#fff"), borderWidth: 2 };
        const asLine = s.as ? s.as === "line" : kind === "line" || (kind === "combo" && s.format === "money");
        return {
          type: asLine ? "line" : "bar", label: s.label, data: s.data, yAxisID: rightAxis(s) ? "y1" : "y", stack: s.stack, order: asLine ? 0 : 1,
          borderColor: colour, borderWidth: asLine ? 2 : 0, borderDash: s.dashed ? [5, 4] : undefined, pointRadius: asLine && s.data.length > 40 ? 0 : 3, pointHoverRadius: 4, tension: 0.25,
          fill: false, borderRadius: asLine ? 0 : 3, maxBarThickness: 36,
          backgroundColor: asLine ? colour : heat ? s.data.map((v) => alpha(colour, 0.15 + 0.85 * (v / maxOf))) : colour,
        };
      });
      const hasRight = series.some(rightAxis);
      const leftFormat = fmt(Math.max(0, series.findIndex((s) => !rightAxis(s))));
      const rightFormat = fmt(series.findIndex(rightAxis));
      const grid = { color: line }, ticks = { color: ink, font: { size: 11 } };
      chart = new C.Chart(canvas.current, {
        type: pie ? "doughnut" : kind === "line" ? "line" : "bar",
        data: { labels, datasets: datasets as never },
        options: {
          responsive: true, maintainAspectRatio: false, animation: still ? false : { duration: 350 },
          indexAxis: horizontal ? "y" : "x", interaction: { mode: pie ? "nearest" : "index", intersect: false }, cutout: pie ? "62%" : undefined,
          plugins: {
            legend: { display: legend && (pie || series.length > 1), position: pie ? "right" : "bottom", labels: { color: ink, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => {
              const i = pie ? 0 : c.datasetIndex, v = Number(pie ? c.raw : horizontal ? c.parsed.x : c.parsed.y);
              return `${pie ? c.label : c.dataset.label}: ${formatValue(v, fmt(i))}`;
            } } },
          },
          scales: pie ? {} : {
            [horizontal ? "y" : "x"]: { stacked, grid: { display: false }, ticks: { ...ticks, maxRotation: 0, autoSkip: !horizontal, maxTicksLimit: horizontal ? undefined : 10 }, border: { color: line } },
            [horizontal ? "x" : "y"]: { position: horizontal ? "bottom" : "left", stacked, beginAtZero: true, grid, ticks: { ...ticks, precision: 0, callback: (v: string | number) => axisValue(Number(v), leftFormat) }, border: { display: false } },
            ...(hasRight ? { y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { ...ticks, precision: 0, callback: (v: string | number) => axisValue(Number(v), rightFormat) }, border: { display: false } } } : {}),
          } as never,
        },
      });
    })();
    return () => { cancelled = true; chart?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="min-w-0">
      <div className="relative w-full" style={{ height }}>
        <canvas ref={canvas} role="img" aria-label={ariaLabel} data-chart-kind={kind} />
      </div>
      <div className="sr-only"><table>
        <caption>{ariaLabel}</caption>
        <thead><tr><th scope="col">{kind === "doughnut" ? "Item" : "Period"}</th>{series.map((s) => <th key={s.label} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={`${l}-${i}`}><th scope="row">{l}</th>{series.map((s) => <td key={s.label}>{formatValue(s.data[i] ?? 0, s.format)}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}
