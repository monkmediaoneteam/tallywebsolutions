import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}
const Sparkline = load('../src/components/admin/Sparkline.tsx').default;
for (const values of [[], [7], [0, 0], [1, 4, 2], [NaN, Infinity, 3]]) {
  const markup = renderToStaticMarkup(React.createElement(Sparkline, { values }));
  assert.match(markup, /polyline/, 'empty and single-day trends remain visible');
  assert.doesNotMatch(markup, /NaN|Infinity/, 'SVG coordinates must be finite');
}

let effects = [], configs = [], destroyed = 0;
class FakeChart {
  static register() {}
  constructor(canvas, config) { configs.push(config); }
  destroy() { destroyed++; }
}
const { default: Chart, formatValue } = load('../src/components/admin/Chart.tsx', {
  react: { useRef: () => ({ current: {} }), useEffect: effect => effects.push(effect) },
  'chart.js': { Chart: FakeChart },
  '@/lib/money': load('../src/lib/money.ts'),
});
const cleanups = [];
const draw = async props => {
  Chart({ labels: ['Day one', 'Day two'], ariaLabel: 'Test chart', ...props });
  const effect = effects.shift(); cleanups.push(effect());
  await new Promise(resolve => setImmediate(resolve));
  return configs.at(-1);
};
const combo = await draw({ kind: 'combo', series: [
  { label: 'Revenue', data: [12345, 23456], format: 'money' },
  { label: 'Orders', data: [1, 2] },
  { label: 'Revenue, previous period', data: [10000, 20000], format: 'money', dashed: true },
] });
assert.deepEqual(combo.data.datasets.map(d => [d.type, d.yAxisID]), [['line', 'y1'], ['bar', 'y'], ['line', 'y1']], 'combo infers bars/counts left and revenue lines right regardless of series order');
assert.deepEqual(combo.data.datasets[2].borderDash, [5, 4]);
assert.equal(combo.options.scales.y.position, 'left');
assert.equal(combo.options.scales.y1.position, 'right');
assert.equal(combo.options.scales.y.ticks.callback(4), '4');
assert.match(combo.options.scales.y1.ticks.callback(10000), /₹100/);
assert.equal(formatValue(12345, 'money'), '₹123.45');
const ordered = await draw({ kind: 'combo', series: [
  { label: 'Orders', data: [1, 2], colour: '#299637' },
  { label: 'Revenue', data: [10000, 20000], format: 'money' },
] });
assert.notEqual(ordered.data.datasets[0].borderColor, ordered.data.datasets[1].borderColor, 'bars and revenue remain distinguishable when orders come first');
const horizontal = await draw({ kind: 'bar', horizontal: true, series: [{ label: 'Revenue', data: [10000, 20000], format: 'money' }] });
assert.equal(horizontal.options.indexAxis, 'y');
assert.equal(horizontal.options.plugins.tooltip.callbacks.label({ datasetIndex: 0, parsed: { x: 12345 }, dataset: { label: 'Revenue' } }), 'Revenue: ₹123.45');
const stacked = await draw({ kind: 'bar', stacked: true, series: [{ label: 'New', data: [1, 2], stack: 'customers' }] });
assert.equal(stacked.options.scales.x.stacked, true);
assert.equal(stacked.options.scales.y.stacked, true);
await draw({ kind: 'bar', series: [] });
cleanups.forEach(cleanup => cleanup());
assert.equal(destroyed, configs.length, 'every created chart is destroyed on cleanup');
console.log('Analytics chart checks passed: visible finite trends, mixed dataset types/axes, dashed comparison, money, horizontal tooltips, stacking, empty series and cleanup.');
