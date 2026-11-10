import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import Header, { AppProvider } from '@/components/Header';
import Footer from '@/components/Footer';
import { getLocalStore, LocalError } from '@/lib/data';
import type { Action, ActionResult } from '@/lib/types';
import './globals.css';

export const metadata: Metadata = {
  title: 'Birge — Жақсылық жаныңда',
  description: 'Birge: зат алмасу, көмек, оқу орындары, адамдар және хабарламалар.',
};
export const viewport: Viewport = { themeColor: '#393185' };

async function localAction(command?: Action): Promise<ActionResult | { error: string }> {
  'use server';
  try {
    const requestHeaders = await headers();
    const origin = new URL(requestHeaders.get('origin') || 'about:blank');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== requestHeaders.get('host')
      || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) return { error: 'Сұрауды осы жергілікті сайттан жіберіңіз.' };
    const jar = await cookies();
    const store = getLocalStore();
    const session = store.session(jar.get('birge_session')?.value);
    if (session.token) jar.set('birge_session', session.token, {
      path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000, secure: origin.protocol === 'https:',
    });
    return command === undefined ? { snapshot: store.snapshot(session.userId) } : store.act(session.userId, command);
  } catch (failure) {
    return { error: failure instanceof LocalError ? failure.message : 'Деректерді сақтау мүмкін болмады. Қайта көріңіз.' };
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="kk"><body><AppProvider action={localAction}><Header /><main id="content">{children}<Footer /></main></AppProvider></body></html>;
}
