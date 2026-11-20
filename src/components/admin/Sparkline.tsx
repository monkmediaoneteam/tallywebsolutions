/** A tiny trend line drawn on the server. Decorative: the number beside it carries the meaning. */
export default function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="h-8 w-full" aria-hidden />;
  const W = 120, H = 32, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--brand, #2e2e7e)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={max === min ? 0.35 : 1} />
    </svg>
  );
}
