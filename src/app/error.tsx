'use client';
import { RefreshCw } from 'lucide-react';
export default function ErrorPage({ error, retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  const digest = error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;
  return <div className="wrap section"><h1 className="title title-lg">We could not load this page.</h1>
    <p className="my-6" role="alert">Please try again in a moment. If a payment was interrupted, do not pay again until its status is confirmed.</p>
    {digest && <p className="text-sm" data-error-digest>Support reference: {digest}</p>}
    <button className="btn btn-primary" onClick={retry ?? reset}><RefreshCw size={18} aria-hidden />Try again</button></div>;
}
