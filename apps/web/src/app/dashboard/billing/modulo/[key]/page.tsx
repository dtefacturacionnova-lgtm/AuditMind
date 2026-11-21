'use client';

import { useParams } from 'next/navigation';
import { ModuleNotIncluded } from '@/components/billing/ModuleNotIncluded';
import { parseEntitlementKey } from '@/lib/billing/access';

/** «Este módulo no está en tu plan» para un módulo o función (la clave viene de la dirección; solo se aceptan claves conocidas). */
export default function ModuleNotIncludedPage() {
  const params = useParams<{ key: string }>();
  let raw = String(params?.key ?? '');
  try { raw = decodeURIComponent(raw); } catch { /* clave mal codificada: se trata como desconocida */ }
  return <ModuleNotIncluded moduleKey={parseEntitlementKey(raw)} />;
}
