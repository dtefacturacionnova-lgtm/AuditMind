export const metadata = {
  title: 'Portal del Auditado — AuditMind',
  description: 'Portal seguro para respuesta de solicitudes de auditoría',
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Branded header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-none">AuditMind</p>
              <p className="text-[10px] text-gray-400">Portal del Auditado</p>
            </div>
            <div className="ml-auto">
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Conexión segura
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-gray-400">
          © {new Date().getFullYear()} AuditMind — Plataforma de auditoría inteligente
        </footer>
      </div>
    </>
  );
}
