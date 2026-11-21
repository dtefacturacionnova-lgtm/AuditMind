import { Sidebar } from '@/components/layout/Sidebar';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { BillingProvider } from '@/contexts/BillingContext';
import { ContextualHelpProvider } from '@/contexts/ContextualHelpContext';
import { ContextualHelpWidget } from '@/components/layout/ContextualHelpWidget';
import { PlanBanner } from '@/components/billing/PlanBanner';
import { PlanGate } from '@/components/billing/PlanGate';
import { BillingNoticeHost } from '@/components/billing/BillingNoticeHost';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrganizationProvider>
      <BillingProvider>
        <ContextualHelpProvider>
          <div className="flex h-screen overflow-hidden bg-gray-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <PlanBanner />
              <PlanGate>{children}</PlanGate>
            </main>
          </div>
          <ContextualHelpWidget />
          <BillingNoticeHost />
        </ContextualHelpProvider>
      </BillingProvider>
    </OrganizationProvider>
  );
}
