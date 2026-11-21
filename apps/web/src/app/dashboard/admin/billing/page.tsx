import { redirect } from 'next/navigation';

/** /dashboard/admin/billing → la pantalla de uso diario: Suscripciones. */
export default function BillingAdminIndex() {
  redirect('/dashboard/admin/billing/suscripciones');
}
