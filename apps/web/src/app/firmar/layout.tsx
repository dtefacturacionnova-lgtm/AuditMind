import type { Metadata } from 'next';
import { PublicShell } from '@/components/signature/PublicShell';

// Página PÚBLICA para el firmante externo. Nunca debe indexarse, ni enviar Referer, ni guardarse en caché
// (los encabezados HTTP equivalentes se fijan en next.config.js).
export const metadata: Metadata = {
  title: 'Firma electrónica — AuditMind',
  description: 'Revisa y firma un documento de forma segura.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function FirmarLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell subtitle="Firma electrónica">{children}</PublicShell>;
}
