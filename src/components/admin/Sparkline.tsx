/** A tiny trend line drawn on the server. Decorative: the number beside it carries the meaning. */
export default function Sparkline({ values }: { values: number[] }) {
  const finite = values.map((v) => Number.isFinite(v) ? v : 0);
  const points = finite.length > 1 ? finite : [finite[0] ?? 0, finite[0] ?? 0];
  const W = 120, H = 32, max = Math.max(...points), min = Math.min(...points), span = max - min || 1;
  const pts = points.map((v, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(max === min ? H / 2 : H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--brand, #2e2e7e)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={max === min ? 0.35 : 1} />
    </svg>
  );
}
