import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Chat } from '@/components/chat/Chat';

export const metadata: Metadata = { title: 'Trợ lý AI' };

export default function ChatPage() {
  return (
    <div className="flex h-svh flex-col">
      <Header />
      <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-3 pb-3">
        <Chat />
      </main>
    </div>
  );
}
