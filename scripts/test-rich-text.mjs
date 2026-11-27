import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseBlocks, parseInline, plainText, safeHref } from '../src/lib/rich-text.ts';
import { renderRich } from '../src/lib/rich-text-render.ts';
import { overlayBundle } from '../src/lib/bundles.ts';

const html = (text) => renderToStaticMarkup(createElement('div', null, ...renderRich(text)));

// Formatting.
assert.equal(html('Hello **bold** and *italic* text'), '<div><p>Hello <strong>bold</strong> and <em>italic</em> text</p></div>');
assert.equal(html('One\n\nTwo'), '<div><p>One</p><p>Two</p></div>', 'a blank line starts a new paragraph');
assert.equal(html('Line one\nLine two'), '<div><p>Line one<br/>Line two</p></div>', 'a single line break stays a break');
assert.equal(html('## Why buy\n\nText'), '<div><h3 class="rich-h">Why buy</h3><p>Text</p></div>', 'headings');
assert.equal(html('- one\n- two'), '<div><ul><li>one</li><li>two</li></ul></div>', 'bullets');
assert.equal(html('1. one\n2. two'), '<div><ol><li>one</li><li>two</li></ol></div>', 'numbers');
assert.equal(html('* star bullet\n* another'), '<div><ul><li>star bullet</li><li>another</li></ul></div>', 'a star bullet is a bullet, not italics');
assert.equal(html('Before\n- a\n- b\nAfter'), '<div><p>Before</p><ul><li>a</li><li>b</li></ul><p>After</p></div>', 'a list ends where the text goes on');
assert.equal(html('5 * 3 and 4 * 2'), '<div><p>5 * 3 and 4 * 2</p></div>', 'a stray star is not italics');
assert.equal(html('**bold *and italic***'), '<div><p><strong>bold <em>and italic</em></strong></p></div>', 'nested marks');
assert.equal(html('Plain paragraph the way every old description is written.'), '<div><p>Plain paragraph the way every old description is written.</p></div>', 'old plain text is unchanged');
assert.equal(html(''), '<div></div>'); assert.equal(html(null), '<div></div>');

// Links: only https, mailto and links inside the store.
assert.equal(html('[Docs](https://example.com/a?b=1)'), '<div><p><a href="https://example.com/a?b=1" class="rich-link" target="_blank" rel="noopener noreferrer nofollow">Docs</a></p></div>');
assert.equal(html('[Packs](/collections)'), '<div><p><a href="/collections" class="rich-link">Packs</a></p></div>', 'a link inside the store opens in place');
assert.ok(!html('[x](javascript:alert(1))').includes('<a') && !html('[x](javascript:alert(1))').includes('href'), 'a javascript: link is never made into a link');
assert.equal(html('[x](data:text/html;base64,AAAA)'), '<div><p>x</p></div>', 'data: links become plain text');
assert.equal(html('[x](//evil.example/a)'), '<div><p>x</p></div>', 'protocol-relative links become plain text');
assert.equal(safeHref('http://plain.example'), null, 'plain http is refused');
assert.equal(safeHref('/ok'), '/ok');

// Text is always text: markup in a description can never become markup.
assert.equal(html('<script>alert(1)</script> & <b>x</b>'), '<div><p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;</p></div>', 'tags are shown as text');
assert.equal(html('<img src=x onerror=alert(1)>'), '<div><p>&lt;img src=x onerror=alert(1)&gt;</p></div>');
assert.equal(html('[<b>x</b>](https://e.example)').includes('<b>'), false, 'link text is text too');

// Plain text, for search, meta descriptions and the home row.
assert.equal(plainText('## Title\n\nSome **bold** [link](https://e.example) text.\n\n- a\n- b'), 'Title Some bold link text. a, b');
assert.equal(plainText(null), '');
assert.deepEqual(parseInline('a'), ['a']);
assert.equal(parseBlocks('').length, 0);

// A bundle keeps the formatted words for its page and a plain line everywhere else.
const book = (slug, price) => ({ slug, title: slug.toUpperCase(), price_inr: price, active: true, file_url: `private:${slug}.tdl`, release_approved: true, scan_status: 'clean', facts: {}, highlights: [], sale_price_inr: null, sale_starts_at: null, sale_ends_at: null });
const anchor = { ...book('sec', 100), file_url: null, facts: { _bundle_of: 'sec' } };
const live = overlayBundle(anchor, { slug: 'sec', title: 'Sec', description: '**Lock** every door.\n\n- one\n- two', image_url: null, book_slugs: ['a', 'b'], status: 'published', publish_at: null }, [book('a', 10000), book('b', 20000)], new Date(), 5);
assert.equal(live.long_description, '**Lock** every door.\n\n- one\n- two', 'the product page gets the formatted text');
assert.equal(live.description, 'Lock every door. one, two', 'meta, search and cards get the plain line');

console.log('Rich text checks passed: formatting, links, markup stays text, plain text, bundle description.');
