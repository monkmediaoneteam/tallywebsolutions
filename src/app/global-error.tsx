'use client';

export default function GlobalError({ error, retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  const digest = error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;
  return <html lang="en"><body style={{ margin: 0, background: '#fff', color: '#20202a', fontFamily: 'system-ui, sans-serif' }}>
    <main style={{ maxWidth: 640, margin: '12vh auto', padding: 24 }}>
      <h1>We could not load this page.</h1>
      <p role="alert">Please try again in a moment. If a payment was interrupted, do not pay again until its status is confirmed.</p>
      {digest && <p style={{ fontSize: 14 }} data-error-digest>Support reference: {digest}</p>}
      <button onClick={retry ?? reset} style={{ padding: '12px 20px', cursor: 'pointer', font: 'inherit', borderRadius: 6 }}>Try again</button>
    </main></body></html>;
}
