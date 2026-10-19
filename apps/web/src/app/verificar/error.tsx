'use client';

import { PublicError } from '@/components/signature/PublicError';

export default function VerificarError({ reset }: { error: Error; reset: () => void }) {
  return <PublicError reset={reset} />;
}
