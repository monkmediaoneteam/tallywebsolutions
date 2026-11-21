import LoginForm from './LoginForm';
import { env } from '@/lib/env';
import { seoMetadata } from "@/lib/seo-meta";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return seoMetadata("/login"); }
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') && !params.next.includes('\\') ? params.next : '/library';
  return <section className="wrap max-w-[560px] py-16"><p className="eyebrow mb-4">Customer sign in</p>
    <h1 className="title title-lg mb-5">Your add-ons, together.</h1>
    <p className="text-ink-soft mb-8">Sign in to your library.</p>
    <LoginForm next={next} googleEnabled={!!env('GOOGLE_CLIENT_ID') && !!env('GOOGLE_CLIENT_SECRET')} /></section>;
}
