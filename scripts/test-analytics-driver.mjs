// Exercise the real installed Neon API and the repository proxy. Never opens a socket.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { neon, neonConfig } from '@neondatabase/serverless';

const require = createRequire(import.meta.url);
function load(path, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}
const fakeUrl = 'postgresql://offline:offline@analytics.invalid/test';
const actual = neon(fakeUrl);
assert.equal(typeof actual, 'function');
assert.equal(typeof actual.transaction, 'function');
let sent = [];
const oldFetch = neonConfig.fetchFunction;
const oldLocal = process.env.PGLITE_DATABASE_DIR;
delete process.env.PGLITE_DATABASE_DIR;
neonConfig.fetchFunction = async (_url, options) => {
  const body = JSON.parse(options.body); sent.push(body);
  const result = query => /as awaiting/.test(query.query)
    ? { fields: ['awaiting', 'email', 'payments'].map(name => ({ name, dataTypeID: 23 })), rows: [['0', '0', '0']] }
    : { fields: [{ name: 'n', dataTypeID: 23 }], rows: /select \$1::int as n/.test(query.query) ? [[query.params[0]]] : [] };
  return new Response(JSON.stringify(body.queries ? { results: body.queries.map(result) } : result(body)), { status: 200 });
};
try {
  let localCalls = 0;
  const db = load('../src/lib/db.ts', {
    '@neondatabase/serverless': { neon },
    './env': { requireEnv: () => fakeUrl },
    './bundles': { bundleSlugOf: () => null, overlayBundle: row => row },
    './local-db': { localDatabase: () => ({ query: async (statement, parameters) => { localCalls++; return { rows: [{ n: parameters[0] }] }; } }) },
  });
  const analytics = load('../src/lib/analytics.ts', { './db': db });
  await assert.doesNotReject(() => analytics.getAnalytics(analytics.parseRange({ range: '7d' }, '2026-11-21')), 'the remote driver must support analytics, not only the PGlite adapter');
  assert.equal(sent.length, 12, 'exactly twelve requests use the actual driver transport');
  assert.equal(sent.filter(x => x.params.length > 0).length, 11);
  assert.equal(typeof db.sql.query, 'function');
  assert.deepEqual(await db.sql.query('select $1::int as n', [7]), [{ n: 7 }]);
  assert.deepEqual(await db.sql`select ${8}::int as n`, [{ n: 8 }], 'tagged queries still work');
  assert.deepEqual(await db.sql.transaction([db.sql`select ${9}::int as n`]), [[{ n: 9 }]], 'transactions still work');
  process.env.PGLITE_DATABASE_DIR = 'test-only';
  assert.deepEqual(await db.sql.query('select $1::int as n', [10]), [{ n: 10 }]);
  assert.equal(localCalls, 1, 'local parameterised queries still use the isolated adapter');
  console.log('Analytics driver checks passed: actual Neon client/proxy, 12 remote queries, parameter binding, query compatibility, tagged calls, transactions, local adapter. No network or credentials used.');
} finally {
  neonConfig.fetchFunction = oldFetch;
  if (oldLocal === undefined) delete process.env.PGLITE_DATABASE_DIR; else process.env.PGLITE_DATABASE_DIR = oldLocal;
}
