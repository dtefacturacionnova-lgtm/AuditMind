import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PricingCatalog } from '@/components/pricing/PricingCatalog';
import { PricingHeader, PricingPage } from '@/components/pricing/PricingChrome';
import { PricingUnavailable } from '@/components/pricing/PricingUnavailable';
import { loadPublicCatalog } from '@/lib/billing/load-public-catalog';
import { contactHref, contactMessage } from '@/lib/billing/public-catalog';

/**
 * Página PÚBLICA de planes y precios (sin sesión). Lee el catálogo del API (`GET /public/plans`), que responde 404 mientras la página no esté
 * publicada (`PUBLIC_PRICING_ENABLED` en el API): en ese caso aquí también se ve un 404 normal, como si la página no existiera.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planes y precios — AuditMind',
  description: 'Planes de AuditMind para auditores independientes y equipos de auditoría interna y externa: módulos, espacio, asistentes de IA y precios.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default async function PreciosPage() {
  const result = await loadPublicCatalog(API_BASE);
  if (result === 'DISABLED') notFound();

  if (result === null || result.plans.length === 0) {
    const href = result ? contactHref(result.contact, contactMessage('DEMO')) : null;
    return (
      <PricingPage header={<PricingHeader demoHref={href} />}>
        <PricingUnavailable reason={result === null ? 'error' : 'empty'} contactHref={href} />
      </PricingPage>
    );
  }

  return (
    <PricingPage header={<PricingHeader demoHref={contactHref(result.contact, contactMessage('DEMO'))} />}>
      <PricingCatalog catalog={result} />
    </PricingPage>
  );
}
