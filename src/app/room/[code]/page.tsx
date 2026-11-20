'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { GameRoom } from '@/components/GameRoom';

function RoomInner() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = String(params.code ?? '').toUpperCase();
  return <GameRoom code={code} spectate={search.get('zuschauen') === '1'} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomInner />
    </Suspense>
  );
}
