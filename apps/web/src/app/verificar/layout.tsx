import type { Metadata } from 'next';
import { PublicShell } from '@/components/signature/PublicShell';

export const metadata: Metadata = {
  title: 'Verificar documento firmado — AuditMind',
  description: 'Comprueba la autenticidad de un documento firmado electrónicamente.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function VerificarLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell subtitle="Verificación de documentos">{children}</PublicShell>;
}
