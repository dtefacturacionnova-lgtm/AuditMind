'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Plug, RefreshCw, Play, Trash2, CheckCircle2,
  XCircle, Clock, AlertCircle, Database, Globe, FileSpreadsheet,
  ChevronRight, Loader2, Settings,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type DSType = 'SAP_RFC' | 'REST_API' | 'EXCEL_UPLOAD' | 'CSV_UPLOAD';
type DSStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'TESTING';

interface DataSource {
  id: string;
  name: string;
  type: DSType;
  status: DSStatus;
  config: Record<string, unknown>;
  lastTestedAt?: string;
  lastTestStatus?: string;
  lastTestError?: string;
  lastImportAt?: string;
  totalImports: number;
  createdBy: { id: string; name: string };
  _count: { imports: number };
}

// ─── Config fields by type ────────────────────────────────────────────────────

const TYPE_CONFIGS: Record<DSType, { label: string; icon: React.ElementType; fields: { key: string; label: string; type: string; placeholder: string }[] }> = {
  SAP_RFC: {
    label: 'SAP RFC/BAPI',
    icon: Database,
    fields: [
      { key: 'host',     label: 'Host / IP',        type: 'text',     placeholder: 'sap-prod.empresa.com' },
      { key: 'sysnr',    label: 'Número de sistema', type: 'text',     placeholder: '00' },
      { key: 'client',   label: 'Mandante (client)', type: 'text',     placeholder: '100' },
      { key: 'user',     label: 'Usuario SAP',       type: 'text',     placeholder: 'RFC_AUDIT' },
      { key: 'password', label: 'Contraseña',        type: 'password', placeholder: '••••••••' },
    ],
  },
  REST_API: {
    label: 'API REST',
    icon: Globe,
    fields: [
      { key: 'base_url',       label: 'URL Base',             type: 'text',     placeholder: 'https://api.quickbooks.com/v3' },
      { key: 'api_key',        label: 'API Key',              type: 'password', placeholder: 'sk-...' },
      { key: 'bearer_token',   label: 'Bearer Token',         type: 'password', placeholder: 'eyJ...' },
      { key: 'health_endpoint', label: 'Endpoint de prueba',  type: 'text',     placeholder: '/companyinfo/1 (opcional)' },
    ],
  },
  EXCEL_UPLOAD: {
    label: 'Excel Upload',
    icon: FileSpreadsheet,
    fields: [],
  },
  CSV_UPLOAD: {
    label: 'CSV Upload',
    icon: FileSpreadsheet,
    fields: [],
  },
};

const TYPE_LABELS: Record<DSType, string> = {
  SAP_RFC:      'SAP RFC/BAPI',
  REST_API:     'API REST',
  EXCEL_UPLOAD: 'Excel',
  CSV_UPLOAD:   'CSV',
};

const STATUS_STYLES: Record<DSStatus, { color: string; label: string; icon: React.ElementType }> = {
  ACTIVE:   { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Activo',    icon: CheckCircle2 },
  INACTIVE: { color: 'text-gray-500 bg-gray-50 border-gray-200',         label: 'Inactivo',  icon: Clock },
  ERROR:    { color: 'text-red-600 bg-red-50 border-red-200',             label: 'Error',     icon: XCircle },
  TESTING:  { color: 'text-amber-600 bg-amber-50 border-amber-200',       label: 'Probando',  icon: RefreshCw },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataSourcesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState<DSType>('REST_API');
  const [formName, setFormName] = useState('');
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [importingId, setImportingId] = useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery<DataSource[]>({
    queryKey: ['data-sources'],
    queryFn: () => apiClient.get('/data-sources'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; type: DSType; config: Record<string, unknown> }) =>
      apiClient.post('/data-sources', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-sources'] });
      setShowCreate(false);
      setFormName('');
      setFormConfig({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/data-sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-sources'] }),
  });

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await apiClient.post<{ ok: boolean; message: string }>(`/data-sources/${id}/test`, {});
      setTestResult(prev => ({ ...prev, [id]: res }));
      qc.invalidateQueries({ queryKey: ['data-sources'] });
    } finally {
      setTestingId(null);
    }
  }

  async function handleImport(id: string) {
    setImportingId(id);
    try {
      await apiClient.post(`/data-sources/${id}/import`, {
        options: { data_type: 'gl', max_records: 100 },
      });
      qc.invalidateQueries({ queryKey: ['data-sources'] });
    } finally {
      setImportingId(null);
    }
  }

  function handleCreate() {
    if (!formName.trim()) return;
    const cleanConfig: Record<string, unknown> = {};
    Object.entries(formConfig).forEach(([k, v]) => { if (v.trim()) cleanConfig[k] = v.trim(); });
    createMutation.mutate({ name: formName.trim(), type: selectedType, config: cleanConfig });
  }

  const typeInfo = TYPE_CONFIGS[selectedType];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <Header />

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-6xl mx-auto w-full">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conectores de Datos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Integración con SAP, APIs REST y carga de archivos para CAATs
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva conexión
          </button>
        </div>

        {/* Type cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {(Object.entries(TYPE_CONFIGS) as [DSType, typeof TYPE_CONFIGS[DSType]][]).map(([type, info]) => {
            const count = sources.filter(s => s.type === type).length;
            const Icon = info.icon;
            return (
              <div key={type} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Icon className="h-5 w-5 text-[#0F2D4A]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{info.label}</p>
                    <p className="text-xs text-gray-400">{count} {count === 1 ? 'conexión' : 'conexiones'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sources list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <Plug className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No hay conexiones configuradas</p>
            <p className="text-sm text-gray-400 mt-1">
              Conecta SAP, QuickBooks, Netsuite u otras fuentes para importar datos a CAATs
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-sm font-medium text-[#0F2D4A] hover:underline"
            >
              Crear primera conexión
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map(ds => {
              const status = STATUS_STYLES[ds.status];
              const StatusIcon = status.icon;
              const TypeIcon = TYPE_CONFIGS[ds.type]?.icon ?? Settings;
              const tr = testResult[ds.id];

              return (
                <div key={ds.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-gray-50 rounded-lg flex-shrink-0">
                      <TypeIcon className="h-5 w-5 text-[#0F2D4A]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900">{ds.name}</h3>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          {TYPE_LABELS[ds.type]}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        {ds.lastTestedAt && (
                          <span>
                            Último test: {new Date(ds.lastTestedAt).toLocaleDateString('es-CL')}
                          </span>
                        )}
                        {ds.lastImportAt && (
                          <span>Última importación: {new Date(ds.lastImportAt).toLocaleDateString('es-CL')}</span>
                        )}
                        <span>{ds.totalImports} imports totales</span>
                      </div>

                      {/* Test result inline */}
                      {tr && (
                        <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${tr.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tr.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {tr.message}
                        </div>
                      )}

                      {/* Last test error */}
                      {ds.status === 'ERROR' && ds.lastTestError && !tr && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{ds.lastTestError}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleTest(ds.id)}
                        disabled={testingId === ds.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        title="Probar conexión"
                      >
                        {testingId === ds.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                        }
                        Probar
                      </button>

                      {ds.type !== 'EXCEL_UPLOAD' && ds.type !== 'CSV_UPLOAD' && (
                        <button
                          onClick={() => handleImport(ds.id)}
                          disabled={importingId === ds.id || ds.status === 'INACTIVE'}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0F2D4A] text-white rounded-lg hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
                          title="Importar datos"
                        >
                          {importingId === ds.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Play className="h-3.5 w-3.5" />
                          }
                          Importar
                        </button>
                      )}

                      <button
                        onClick={() => deleteMutation.mutate(ds.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nueva fuente de datos</h2>
              <p className="text-sm text-gray-500">Conecta una fuente para importar datos a CAATs</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Nombre</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="SAP Producción, QuickBooks Online..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Tipo de conexión</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(TYPE_CONFIGS) as [DSType, typeof TYPE_CONFIGS[DSType]][]).map(([type, info]) => {
                    const Icon = info.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => { setSelectedType(type); setFormConfig({}); }}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                          selectedType === type
                            ? 'border-[#0F2D4A] bg-[#0F2D4A]/5 text-[#0F2D4A]'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="text-xs font-medium">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Config fields */}
              {typeInfo.fields.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-700">Configuración de conexión</p>
                  {typeInfo.fields.map(field => (
                    <div key={field.key}>
                      <label className="block text-xs text-gray-600 mb-1">{field.label}</label>
                      <input
                        type={field.type}
                        value={formConfig[field.key] ?? ''}
                        onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Los archivos {TYPE_LABELS[selectedType]} se suben directamente al importar.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowCreate(false); setFormConfig({}); setFormName(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white rounded-lg text-sm font-medium hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Crear conexión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
