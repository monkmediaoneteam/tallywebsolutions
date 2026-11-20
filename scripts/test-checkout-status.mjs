// Offline: the admin's "Checkout is off" panel says whether a setting never reached this deployment or arrived with a bad value.
import assert from 'node:assert/strict';
const names = ['COMMERCE_ENABLED', 'COMMERCE_POLICIES_APPROVED', 'MAIL_FROM', 'LEGAL_ENTITY_NAME', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_COMMIT_SHA'];
const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
try {
  const { checkoutProblems, deploymentInfo } = await import('../src/lib/razorpay.ts');
  for (const n of names) delete process.env[n];
  let problems = checkoutProblems();
  assert.ok(problems.includes('COMMERCE_ENABLED is not set in this deployment (it should be true)'));
  assert.ok(problems.includes('MAIL_FROM is not set in this deployment'));
  process.env.COMMERCE_ENABLED = ' "TRUE" ';
  process.env.COMMERCE_POLICIES_APPROVED = 'yes';
  process.env.MAIL_FROM = 'Store <your-name@change-this.test>';
  problems = checkoutProblems();
  assert.ok(!problems.some((p) => p.startsWith('COMMERCE_ENABLED')), 'quoted, spaced TRUE counts as on');
  assert.ok(problems.includes('COMMERCE_POLICIES_APPROVED is set, but not to true'));
  assert.ok(problems.includes('MAIL_FROM is set, but looks like a placeholder value'));
  assert.ok(problems.every((p) => !p.includes('your-name')), 'values are never shown');
  assert.deepEqual(deploymentInfo(), { environment: null, branch: null, commit: null });
  Object.assign(process.env, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' });
  assert.deepEqual(deploymentInfo(), { environment: 'production', branch: 'main', commit: 'abcdef1' });
} finally {
  for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n];
}
console.log('Checkout status checks passed: not set vs bad value, lenient true, no values shown, deployment info.');
