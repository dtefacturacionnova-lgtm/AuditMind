'use client';

import { Header } from '@/components/layout/Header';
import { RiskCatalogView } from '@/components/RiskCatalogView';

export default function PlanRisksPage() {
  return (
    <div className="flex flex-col h-full">
      <Header breadcrumbs={[
        { label: 'Planificación Anual', href: '/dashboard/plans' },
        { label: 'Catálogo de Riesgos' },
      ]} />
      <RiskCatalogView />
    </div>
  );
}
