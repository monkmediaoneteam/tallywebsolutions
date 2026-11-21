import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorPage from '../src/app/error.tsx';

const incident = Object.assign(new Error('private database detail'), { digest: 'support-123' });
const html = renderToStaticMarkup(createElement(ErrorPage, { error: incident, retry() {}, reset() {} }));
assert.ok(html.includes('support-123'), 'support can correlate the server digest');
assert.ok(!html.includes('private database detail'), 'internal errors are never exposed');
assert.ok(html.includes('do not pay again'));
const { default: GlobalError } = await import('../src/app/global-error.tsx');
const global = renderToStaticMarkup(createElement(GlobalError, { error: incident, retry() {}, reset() {} }));
assert.match(global, /<html[^>]*>/);
assert.match(global, /<body[^>]*>/);
assert.ok(global.includes('support-123'));
assert.ok(global.includes('Try again'));
for (const error of [null, 'unexpected throw', {}]) {
  assert.ok(renderToStaticMarkup(createElement(ErrorPage, { error, retry() {}, reset() {} })).includes('Try again'));
}
console.log('Error boundaries: safe digest, payment guidance, global document and unknown errors passed.');
