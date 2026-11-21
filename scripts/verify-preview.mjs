import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const port = Number(process.argv[2] || 3300);
const base = 'http://localhost:' + port;
const token = randomBytes(32).toString('hex');
const env = { ...process.env, ADMIN_TOKEN: token, PREVIEW_URL: base, EXPECT_TIMEOUT: '40000', PREVIEW_WEBPACK: '1', NEXT_DIST_DIR: '.next-verification-' + port };
await mkdir('artifacts', { recursive: true });
let log = '';
const preview = spawn(process.execPath, ['scripts/dev-preview.mjs', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const capture = chunk => { const safe = String(chunk).replaceAll(token, '[preview-token]'); log += safe; };
preview.stdout.on('data', capture); preview.stderr.on('data', capture);
let exited = false;
preview.on('exit', () => { exited = true; });
try {
  const deadline = Date.now() + 240000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try { const response = await fetch(base + '/admin/login', { signal: AbortSignal.timeout(30000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Isolated preview must return 200: ' + log.slice(-3000));
  for (const script of process.argv.slice(3).length ? process.argv.slice(3) : ['scripts/check-admin.mjs', 'scripts/check-production-preview.mjs']) {
    console.log('Browser verification: ' + script + ' at ' + base);
    const code = await new Promise((resolve, reject) => {
      const check = spawn(process.execPath, [script], { env, stdio: 'inherit' });
      check.on('error', reject); check.on('exit', resolve);
    });
    assert.equal(code, 0, script + ' must pass');
  }
} finally {
  if (process.platform === 'win32') {
    await new Promise(resolve => { const stop = spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' }); stop.on('exit', resolve); stop.on('error', resolve); });
  } else preview.kill('SIGTERM');
  await writeFile('artifacts/preview-' + port + '.log', log);
}
