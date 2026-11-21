import assert from 'node:assert/strict';
import sharp from 'sharp';

export async function checkCrop({ page, context, base, key, fixture, expect }) {
  const visit = path => page.goto(base + path, { waitUntil: 'networkidle' });
  // 9. Exercise the real canvas and real Blob client, intercepting only provider boundaries.
  const uploads = [];
  const actions = [];
  // Chromium may omit file-backed XHR bodies from intercepted request data.
  // Capture the real bytes passed to the SDK transport before forwarding unchanged.
  await context.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const address = input instanceof Request ? input.url : String(input);
      if (new URL(address, location.href).href.startsWith('https://vercel.com/api/blob')) {
        const request = new Request(input, init);
        window.__bannerUploadBytes = request.clone().arrayBuffer();
        return originalFetch.call(this, request);
      }
      return originalFetch.call(this, input, init);
    };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (body != null) window.__bannerUploadBytes = new Response(body).arrayBuffer();
      return send.call(this, body);
    };
  });
  const mediaKey = '12345678-1234-1234-1234-123456789abc';
  await context.route('**/api/admin/media', async route => {
    const body = route.request().postDataJSON(); actions.push(body.action);
    await route.fulfill({ json: body.action === 'ticket'
      ? { pathname: 'admin/media/' + mediaKey, token: 'vercel_blob_client_fixture_' + Buffer.from('{}').toString('base64') }
      : { url: '/api/media/' + mediaKey } });
  });
  await context.route('https://vercel.com/api/blob**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const bytes = route.request().postDataBuffer() ?? Buffer.from(await page.evaluate(async () => {
      if (!window.__bannerUploadBytes) throw Error('No upload bytes reached the transport');
      return Array.from(new Uint8Array(await window.__bannerUploadBytes));
    }));
    uploads.push(bytes);
    await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { url: 'https://fixture.private.blob.vercel-storage.com/admin/media/' + mediaKey,
      pathname: 'admin/media/' + mediaKey, contentType: 'image/png', contentDisposition: 'inline' } });
  });
  await context.route('**/api/media/' + mediaKey, route => route.fulfill({ contentType: 'image/png', body: uploads.at(-1) || fixture }));
  await visit('/admin/banners/new?section=' + key);
  const picker = page.locator('input[type="file"]').first();
  await picker.setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: fixture });
  const dialog = page.getByRole('dialog', { name: 'Crop banner image' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Skip crop' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Use crop', exact: true }).click();
  await expect(page.getByText('Image ready. Save to put it live.')).toBeVisible();
  assert.deepEqual(actions, ['ticket', 'finalize']);
  assert.equal(uploads.length, 1);
  const metadata = await sharp(uploads[0]).metadata();
  assert.equal(metadata.width, 1000); assert.equal(metadata.height, 1000); assert.equal(metadata.format, 'png');
  await picker.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert').filter({ hasText: 'JPEG, PNG or WebP' })).toBeVisible();
  await picker.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert').filter({ hasText: '5 MB' })).toBeVisible();
  assert.equal(actions.length, 2, 'Invalid files never request a ticket');
  // Right-shape files may skip cropping, and cancel closes without upload.
  await picker.setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: uploads[0] });
  await expect(dialog.getByRole('button', { name: 'Skip crop' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  assert.equal(actions.length, 2);
  console.log('PASS 9: wide-to-square exact crop bytes, ticket/finalise, invalid files, skip eligibility and Escape');
}
