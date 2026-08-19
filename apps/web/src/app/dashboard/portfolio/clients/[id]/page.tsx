'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ChevronRight, AlertTriangle, Info, Radar, FileSignature, FileText, Briefcase,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useClient, CLIENT_STATUS_CONFIG } from '@/hooks/usePortfolio';
import { ClientInfoTab } from '@/components/portfolio/ClientInfoTab';
import { AcceptanceRadarTab } from '@/components/portfolio/AcceptanceRadarTab';
import { ProposalTab } from '@/components/portfolio/ProposalTab';
import { EngagementLetterTab } from '@/components/portfolio/EngagementLetterTab';
import { EngagementsTab } from '@/components/portfolio/EngagementsTab';

type Tab = 'info' | 'radar' | 'proposal' | 'letter' | 'engagements';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('info');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t) setActiveTab(t as Tab);
  }, []);

  const { data: client, isLoading } = useClient(id);

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0F2D4A]" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <AlertTriangle className="h-12 w-12 text-gray-400" />
          <p className="text-gray-600">Cliente no encontrado</p>
          <Link href="/dashboard/portfolio" className="text-[#0F2D4A] font-medium hover:underline">
            Volver a Cartera
          </Link>
        </div>
      </div>
    );
  }

  const st = CLIENT_STATUS_CONFIG[client.status];
  const currentYear = new Date().getFullYear();
  const currentCheck = client.acceptanceChecks.find(c => c.year === currentYear);

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'info',        label: 'Info',                icon: Info },
    { key: 'radar',       label: 'Radar de Aceptación',  icon: Radar,          count: client.acceptanceChecks.length },
    { key: 'proposal',    label: 'Propuesta',            icon: FileSignature,  count: client.proposals.length },
    { key: 'letter',      label: 'Carta de Compromiso',  icon: FileText,       count: client.engagementLetters.length },
    { key: 'engagements', label: 'Encargos',             icon: Briefcase,      count: client.engagements.length },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/dashboard/portfolio" className="hover:text-gray-800">Cartera</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-gray-800 font-medium truncate max-w-[240px]">{client.legalName}</span>
            </nav>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <button onClick={() => router.back()} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 truncate">{client.legalName}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-gray-500">
                    {client.tradeName && <span>{client.tradeName}</span>}
                    {client.industry && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>{client.industry}</span>
                      </>
                    )}
                    {currentCheck && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>Radar {currentYear}: {currentCheck.overallResult === 'PENDING' ? 'en evaluación' : currentCheck.overallResult}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-sm font-medium flex-shrink-0 ${st.bg} ${st.color}`}>
                {st.label}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeTab === tab.key
                        ? 'text-[#0F2D4A] border-b-2 border-[#0F2D4A] bg-blue-50/30'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        activeTab === tab.key ? 'bg-[#0F2D4A] text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {activeTab === 'info'        && <ClientInfoTab client={client} />}
              {activeTab === 'radar'       && <AcceptanceRadarTab client={client} />}
              {activeTab === 'proposal'    && <ProposalTab client={client} />}
              {activeTab === 'letter'      && <EngagementLetterTab client={client} />}
              {activeTab === 'engagements' && <EngagementsTab client={client} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
