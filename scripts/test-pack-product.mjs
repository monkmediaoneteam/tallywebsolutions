import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { packPrice, zipEntryName, buildPackZip, packDescription } from '../src/lib/pack-product.ts';

// Price: the total less the percent, in whole rupees.
assert.equal(packPrice(100000, 5), 95000, '₹1,000 less 5% is ₹950');
assert.equal(packPrice(24300, 5), 23100, 'rounded to a whole rupee (₹243 → ₹231)');
assert.equal(packPrice(50000, 0), 50000, 'no percent, no change');
assert.equal(packPrice(0, 5), 0, 'nothing to sell');
assert.ok(packPrice(100, 5) >= 100 && packPrice(100, 5) <= 100, 'never below ₹1');
assert.equal(packPrice(100000, 99), 10000, 'a percent above 90 is held at 90');

// Names inside the ZIP: flat, safe and unique.
const taken = new Set();
assert.equal(zipEntryName('Folder/Sub\\Cheque No. Tracking.tdl', taken), 'Cheque No. Tracking.tdl', 'folders are dropped');
assert.equal(zipEntryName('cheque no. tracking.TDL', taken), 'cheque no. tracking (2).TDL', 'a repeat gets (2), ignoring case');
assert.equal(zipEntryName('..\\..\\evil.tdl', new Set()), 'evil.tdl', 'path tricks are dropped');
assert.equal(zipEntryName('a<b>:c.tdl', new Set()), 'abc.tdl', 'unsafe characters are removed');
assert.equal(zipEntryName('', new Set()), 'file', 'an empty name still gets one');

// The ZIP holds every file, byte for byte.
const a = new TextEncoder().encode('[#Menu: Gateway of Tally]\n; one'), b = new Uint8Array([0, 1, 2, 3, 250, 255]);
const out = unzipSync(buildPackZip([{ name: 'One.tdl', bytes: a }, { name: 'Two.tcp', bytes: b }, { name: 'one.tdl', bytes: a }]));
assert.deepEqual(Object.keys(out).sort(), ['One.tdl', 'Two.tcp', 'one (2).tdl'].sort());
assert.deepEqual([...out['Two.tcp']], [...b], 'binary files are unchanged');
assert.equal(new TextDecoder().decode(out['One.tdl']), '[#Menu: Gateway of Tally]\n; one');

assert.equal(packDescription(10, 5), 'All 10 add-ons in one download, 5% less than buying them one by one.');
assert.equal(packDescription(3, 0), 'All 3 add-ons in one download.');
console.log('Pack product checks passed: price, ZIP entry names, ZIP contents, description.');
