import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { zipEntryName, buildZip } from '../src/lib/zip.ts';

const taken = new Set();
assert.equal(zipEntryName('Folder/Sub\\Cheque No. Tracking.tdl', taken), 'Cheque No. Tracking.tdl', 'folders are dropped');
assert.equal(zipEntryName('cheque no. tracking.TDL', taken), 'cheque no. tracking (2).TDL', 'a repeat gets (2), ignoring case');
assert.equal(zipEntryName('..\\..\\evil.tdl', new Set()), 'evil.tdl', 'path tricks are dropped');
assert.equal(zipEntryName('a<b>:c.tdl', new Set()), 'abc.tdl', 'unsafe characters are removed');
assert.equal(zipEntryName('', new Set()), 'file', 'an empty name still gets one');

const a = new TextEncoder().encode('[#Menu: Gateway of Tally]\n; one'), b = new Uint8Array([0, 1, 2, 3, 250, 255]);
const out = unzipSync(buildZip([{ name: 'One.tdl', bytes: a }, { name: 'Two.tcp', bytes: b }, { name: 'one.tdl', bytes: a }]));
assert.deepEqual(Object.keys(out).sort(), ['One.tdl', 'Two.tcp', 'one (2).tdl'].sort());
assert.deepEqual([...out['Two.tcp']], [...b], 'binary files are unchanged');
assert.equal(new TextDecoder().decode(out['One.tdl']), '[#Menu: Gateway of Tally]\n; one');

console.log('ZIP checks passed: safe unique names, contents unchanged.');
