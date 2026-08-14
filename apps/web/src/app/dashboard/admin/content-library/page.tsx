'use client';

import { useState, useMemo } from 'react';
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Library, ClipboardList, ShieldCheck, Lock, X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useContentLibrary, useCreateContentLibraryItem, useUpdateContentLibraryItem,
  useDeleteContentLibraryItem, useReseedContentLibrary,
} from '@/hooks/useContentLibrary';
import type { ContentLibraryItem, ContentLibraryKind, CreateContentLibraryItemData } from '@/hooks/useContentLibrary';

// ─── Static config ──────────────────────────────────────────────────────────

const TECNICAS = ['Inspección', 'Confirmación', 'Cálculo', 'Indagación', 'Observación', 'Analítica'];

const PROCEDURE_GROUP_SUGGESTIONS = [
  { key: 'C-01', label: 'Caja y Bancos (NIA 505)' },
  { key: 'C-03', label: 'Inventarios (NIA 501)' },
  { key: 'C-04', label: 'Activo Fijo / PP&E (NIA 500 / NIC 16)' },
  { key: 'C-05', label: 'Inversiones y Valores (NIA 501 / NIIF 9)' },
  { key: 'C-06', label: 'Intangibles y Diferidos (NIC 38)' },
  { key: 'C-07', label: 'Cuentas por Pagar (NIA 505)' },
  { key: 'C-08', label: 'Obligaciones Bancarias y Financieras (NIA 505)' },
  { key: 'C-09', label: 'Pasivos de Largo Plazo (NIC 37, NIIF 16)' },
  { key: 'C-10', label: 'Capital, Reservas y Dividendos (NIA 500)' },
  { key: 'C-11', label: 'Ingresos (NIA 240 / NIIF 15)' },
  { key: 'C-12', label: 'Costos y Gastos' },
];

const COSO_GROUPS = [
  { key: 'S1', label: 'Entorno de Control (P1-P5)' },
  { key: 'S2', label: 'Evaluación de Riesgos (P6-P9)' },
  { key: 'S3', label: 'Actividades de Control (P10-P12)' },
  { key: 'S4', label: 'Información y Comunicación (P13-P15)' },
  { key: 'S5', label: 'Actividades de Monitoreo (P16-P17)' },
];

const TABS: { kind: ContentLibraryKind; label: string; icon: typeof ClipboardList; hint: string }[] = [
  { kind: 'SUBSTANTIVE_PROCEDURE', label: 'Procedimientos Sustantivos', icon: ClipboardList, hint: 'Botón "Cargar Procedimientos Sugeridos" en PT-FIN-C-SUST S3, por área (C-01..C-12).' },
  { kind: 'COSO_QUESTION',         label: 'Preguntas COSO',             icon: ShieldCheck,   hint: 'Botón "Cargar Preguntas Sugeridas" en PT-COSO S1-S5, por componente.' },
];

// ─── Item editor modal ──────────────────────────────────────────────────────

interface EditorState {
  mode: 'create' | 'edit';
  kind: ContentLibraryKind;
  item?: ContentLibraryItem;
  defaultGroupKey?: string;
}

function ItemEditorModal({
  state, onClose, onSave, saving,
}: {
  state: EditorState;
  onClose: () => void;
  onSave: (data: CreateContentLibraryItemData) => void;
  saving: boolean;
}) {
  const isCoso = state.kind === 'COSO_QUESTION';
  const item = state.item;

  const [groupKey, setGroupKey] = useState(item?.groupKey ?? state.defaultGroupKey ?? (isCoso ? COSO_GROUPS[0].key : ''));
  const [itemLabel, setItemLabel] = useState(item?.itemLabel ?? '');
  const [itemSubtitle, setItemSubtitle] = useState(item?.itemSubtitle ?? TECNICAS[0]);
  const [preguntas, setPreguntas] = useState<string[]>(item?.itemDetails?.length ? item.itemDetails : ['']);
  const [error, setError] = useState('');

  function handleSave() {
    if (!groupKey.trim()) { setError('Indique el grupo (área o componente).'); return; }
    if (!itemLabel.trim()) { setError(isCoso ? 'Indique el nombre del principio.' : 'Indique el procedimiento.'); return; }
    setError('');
    const groupLabel = isCoso
      ? COSO_GROUPS.find(g => g.key === groupKey)?.label
      : PROCEDURE_GROUP_SUGGESTIONS.find(g => g.key === groupKey)?.label;
    onSave({
      kind:         state.kind,
      groupKey:     groupKey.trim(),
      groupLabel,
      itemLabel:    itemLabel.trim(),
      ...(isCoso
        ? { itemDetails: preguntas.map(p => p.trim()).filter(Boolean) }
        : { itemSubtitle }),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">
            {state.mode === 'create' ? 'Nuevo ítem' : 'Editar ítem'} — {isCoso ? 'Pregunta COSO' : 'Procedimiento Sustantivo'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {isCoso ? 'Componente' : 'Área'}
            </label>
            {isCoso ? (
              <select
                value={groupKey}
                onChange={e => setGroupKey(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {COSO_GROUPS.map(g => <option key={g.key} value={g.key}>{g.key} — {g.label}</option>)}
              </select>
            ) : (
              <>
                <input
                  list="procedure-groups"
                  value={groupKey}
                  onChange={e => setGroupKey(e.target.value)}
                  placeholder="ej. C-01"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <datalist id="procedure-groups">
                  {PROCEDURE_GROUP_SUGGESTIONS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </datalist>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {isCoso ? 'Nombre del principio' : 'Procedimiento'}
            </label>
            <textarea
              value={itemLabel}
              onChange={e => setItemLabel(e.target.value)}
              rows={isCoso ? 1 : 3}
              placeholder={isCoso ? 'ej. P1 — Compromiso con la integridad y los valores éticos' : 'Describa el procedimiento completo, con referencia a la NIA/NIC aplicable'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {isCoso ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Preguntas de evaluación</label>
              <div className="space-y-2">
                {preguntas.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <textarea
                      value={p}
                      onChange={e => setPreguntas(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                      rows={2}
                      placeholder="¿Pregunta de evaluación?"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => setPreguntas(prev => prev.filter((_, j) => j !== i))}
                      disabled={preguntas.length === 1}
                      className="mt-1 text-gray-300 hover:text-red-500 disabled:opacity-30"
                      title="Quitar pregunta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPreguntas(prev => [...prev, ''])}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar pregunta
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Técnica</label>
              <select
                value={itemSubtitle}
                onChange={e => setItemSubtitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {TECNICAS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group card ─────────────────────────────────────────────────────────────

function GroupCard({
  groupKey, groupLabel, items, onEdit, onDelete, onAdd,
}: {
  groupKey: string;
  groupLabel?: string | null;
  items: ContentLibraryItem[];
  onEdit: (item: ContentLibraryItem) => void;
  onDelete: (item: ContentLibraryItem) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-left">
          <span className="text-xs font-mono font-bold text-gray-500">{groupKey}</span>
          <span className="text-sm font-semibold text-gray-700">{groupLabel ?? '—'}</span>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3 group hover:bg-gray-50/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{item.itemLabel}</p>
                {item.itemSubtitle && (
                  <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                    {item.itemSubtitle}
                  </span>
                )}
                {item.itemDetails && item.itemDetails.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {item.itemDetails.map((q, i) => (
                      <li key={i} className="text-xs text-gray-500">• {q}</li>
                    ))}
                  </ul>
                )}
                {item.isSystem && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                    <Lock className="w-2.5 h-2.5" /> Ítem de sistema — editable, no eliminable
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => onEdit(item)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!item.isSystem && (
                  <button onClick={() => onDelete(item)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-2.5">
            <button onClick={onAdd} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
              <Plus className="w-3.5 h-3.5" /> Agregar ítem a {groupKey}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ContentLibraryPage() {
  const [activeKind, setActiveKind] = useState<ContentLibraryKind>('SUBSTANTIVE_PROCEDURE');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: items = [], isLoading } = useContentLibrary(activeKind);
  const createItem = useCreateContentLibraryItem();
  const updateItem = useUpdateContentLibraryItem();
  const deleteItem = useDeleteContentLibraryItem();
  const reseed = useReseedContentLibrary();

  const groups = useMemo(() => {
    const byKey = new Map<string, ContentLibraryItem[]>();
    for (const item of items) {
      const arr = byKey.get(item.groupKey) ?? [];
      arr.push(item);
      byKey.set(item.groupKey, arr);
    }
    return Array.from(byKey.entries())
      .map(([groupKey, groupItems]) => ({
        groupKey,
        groupLabel: groupItems[0]?.groupLabel,
        items: groupItems.sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  }, [items]);

  const saving = createItem.isPending || updateItem.isPending;

  function handleSave(data: CreateContentLibraryItemData) {
    if (editor?.mode === 'edit' && editor.item) {
      updateItem.mutate({ id: editor.item.id, data }, { onSuccess: () => setEditor(null) });
    } else {
      createItem.mutate(data, { onSuccess: () => setEditor(null) });
    }
  }

  function handleDelete(item: ContentLibraryItem) {
    if (!confirm(`¿Eliminar este ítem de "${item.groupKey}"?\n\n${item.itemLabel.slice(0, 120)}`)) return;
    deleteItem.mutate(item.id);
  }

  const activeTab = TABS.find(t => t.kind === activeKind)!;

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Biblioteca de Contenido"
        breadcrumbs={[{ label: 'Administración' }, { label: 'Biblioteca de Contenido' }]}
      />

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3 gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.kind}
              onClick={() => setActiveKind(t.kind)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeKind === t.kind ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={reseed.isPending}
            onClick={() => {
              reseed.mutate(undefined, {
                onSuccess: (result) => alert(`Biblioteca restaurada: ${result.updated} actualizados, ${result.created} creados.`),
              });
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Actualiza los ítems de sistema con el catálogo más reciente — no toca los ítems propios de la organización"
          >
            {reseed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Restaurar biblioteca
          </button>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'create', kind: activeKind })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nuevo Ítem
          </button>
        </div>
      </div>

      <p className="px-6 pt-3 text-xs text-gray-400">{activeTab.hint}</p>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Library className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Biblioteca vacía</p>
              <p className="mt-1 text-sm text-slate-500">Restaure la biblioteca de sistema o agregue el primer ítem.</p>
            </div>
          </div>
        ) : (
          groups.map(g => (
            <GroupCard
              key={g.groupKey}
              groupKey={g.groupKey}
              groupLabel={g.groupLabel}
              items={g.items}
              onEdit={item => setEditor({ mode: 'edit', kind: activeKind, item })}
              onDelete={handleDelete}
              onAdd={() => setEditor({ mode: 'create', kind: activeKind, defaultGroupKey: g.groupKey })}
            />
          ))
        )}
      </div>

      {editor && (
        <ItemEditorModal
          state={editor}
          onClose={() => setEditor(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}
