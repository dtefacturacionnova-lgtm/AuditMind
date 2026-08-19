import { Sidebar } from '@/components/layout/Sidebar';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { ContextualHelpProvider } from '@/contexts/ContextualHelpContext';
import { ContextualHelpWidget } from '@/components/layout/ContextualHelpWidget';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrganizationProvider>
      <ContextualHelpProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <ContextualHelpWidget />
      </ContextualHelpProvider>
    </OrganizationProvider>
  );
}
