import type { LucideIcon } from 'lucide-react';
import {
  Combine,
  Droplets,
  EyeOff,
  Archive,
  Clock,
  Scissors,
  ShieldCheck,
  Minimize2,
  ScanText,
  Stamp,
} from 'lucide-react';

export type PdfToolFieldType = 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'color';

export interface PdfToolField {
  name: string;
  label: string;
  type: PdfToolFieldType;
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[]; // solo para type: 'select'
  placeholder?: string;
  help?: string;
  advanced?: boolean; // true = bajo "Opciones avanzadas"
  min?: number;
  max?: number;
  step?: number; // solo para type: 'number'
}

export interface PdfToolOperation {
  id: string; // debe calzar con el query param ?op=
  label: string;
  description: string;
  icon: LucideIcon;
  endpoint: string; // ej. '/pdf-tools/merge'
  fileFieldName: 'file' | 'files';
  multiFile: boolean;
  fields: PdfToolField[];
}

export const PDF_TOOL_ACCEPT = '.pdf,application/pdf';
export const PDF_TOOL_MAX_SIZE_SINGLE = 40 * 1024 * 1024; // 40MB — debe calzar con el backend
export const PDF_TOOL_MAX_SIZE_MERGE = 20 * 1024 * 1024; // 20MB por archivo en fusión

export const PDF_TOOL_OPERATIONS: PdfToolOperation[] = [
  {
    id: 'merge',
    label: 'Fusionar PDFs',
    description: 'Combina varios PDFs en un solo archivo, en el orden que elijas',
    icon: Combine,
    endpoint: '/pdf-tools/merge',
    fileFieldName: 'files',
    multiFile: true,
    fields: [
      {
        name: 'sortType',
        label: 'Orden',
        type: 'select',
        default: 'orderProvided',
        options: [
          { value: 'orderProvided', label: 'Orden en que se cargaron' },
          { value: 'byFileName', label: 'Por nombre de archivo' },
          { value: 'byDateModified', label: 'Por fecha de modificación' },
          { value: 'byDateCreated', label: 'Por fecha de creación' },
          { value: 'byPDFTitle', label: 'Por título del PDF' },
        ],
      },
      { name: 'generateToc', label: 'Generar índice (tabla de contenido)', type: 'checkbox', default: false, advanced: true },
    ],
  },
  {
    id: 'watermark',
    label: 'Marca de agua',
    description: 'Agrega texto de marca de agua (branding o confidencialidad)',
    icon: Droplets,
    endpoint: '/pdf-tools/watermark',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      { name: 'text', label: 'Texto de la marca de agua', type: 'text', required: true, placeholder: 'CONFIDENCIAL' },
      { name: 'fontSize', label: 'Tamaño de fuente', type: 'number', default: 30, min: 8, max: 100, advanced: true },
      { name: 'rotation', label: 'Rotación (grados)', type: 'number', default: 45, min: 0, max: 360, advanced: true },
      { name: 'opacity', label: 'Opacidad', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, advanced: true },
      { name: 'color', label: 'Color', type: 'color', default: '#d3d3d3', advanced: true },
    ],
  },
  {
    id: 'sanitize',
    label: 'Sanitizar',
    description: 'Quita JavaScript y contenido activo — defensa ante PDFs de terceros',
    icon: ShieldCheck,
    endpoint: '/pdf-tools/sanitize',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      { name: 'removeJavaScript', label: 'Quitar JavaScript', type: 'checkbox', default: true },
      { name: 'removeEmbeddedFiles', label: 'Quitar archivos incrustados', type: 'checkbox', default: true },
      { name: 'removeXMPMetadata', label: 'Quitar metadatos XMP', type: 'checkbox', default: false, advanced: true },
      { name: 'removeMetadata', label: 'Quitar metadatos', type: 'checkbox', default: false, advanced: true },
      { name: 'removeLinks', label: 'Quitar enlaces', type: 'checkbox', default: false, advanced: true },
      { name: 'removeFonts', label: 'Quitar fuentes incrustadas', type: 'checkbox', default: false, advanced: true },
    ],
  },
  {
    id: 'ocr',
    label: 'OCR',
    description: 'Agrega una capa de texto buscable a un PDF escaneado',
    icon: ScanText,
    endpoint: '/pdf-tools/ocr',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      {
        name: 'languages',
        label: 'Idioma',
        type: 'select',
        default: 'spa',
        options: [
          { value: 'spa', label: 'Español' },
          { value: 'eng', label: 'Inglés' },
        ],
      },
    ],
  },
  {
    id: 'sign-internal',
    label: 'Firmar (sello interno)',
    description: 'Sello de integridad con tu certificado interno de AuditMind',
    icon: Stamp,
    endpoint: '/pdf-tools/sign-internal',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      { name: 'reason', label: 'Motivo', type: 'text', placeholder: 'Aprobación en AuditMind', advanced: true },
      { name: 'location', label: 'Ubicación', type: 'text', placeholder: 'AuditMind', advanced: true },
      { name: 'pageNumber', label: 'Página a firmar', type: 'number', advanced: true },
    ],
  },
  {
    id: 'redact',
    label: 'Redactar',
    description: 'Censura texto específico antes de compartir el PDF externamente',
    icon: EyeOff,
    endpoint: '/pdf-tools/redact',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      {
        name: 'textToRedact',
        label: 'Texto a redactar (uno por línea)',
        type: 'textarea',
        required: true,
        placeholder: 'Nombre Apellido\n001-0001234-5',
      },
      { name: 'useRegex', label: 'Interpretar como expresión regular', type: 'checkbox', default: false, advanced: true },
      { name: 'wholeWordSearch', label: 'Solo palabra completa', type: 'checkbox', default: false, advanced: true },
      { name: 'color', label: 'Color de redacción', type: 'color', default: '#000000', advanced: true },
      { name: 'convertToImage', label: 'Convertir páginas a imagen (más seguro)', type: 'checkbox', default: true, advanced: true },
    ],
  },
  {
    id: 'pdfa',
    label: 'Convertir a PDF/A',
    description: 'Formato de archivo/conservación de largo plazo (ISO 19005)',
    icon: Archive,
    endpoint: '/pdf-tools/pdfa',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      {
        name: 'outputFormat',
        label: 'Formato de salida',
        type: 'select',
        default: 'pdfa-2b',
        options: ['pdfa', 'pdfa-1', 'pdfa-2', 'pdfa-2b', 'pdfa-3', 'pdfa-3b', 'pdfx'].map((v) => ({
          value: v,
          label: v.toUpperCase(),
        })),
      },
      { name: 'strict', label: 'Modo estricto', type: 'checkbox', default: false, advanced: true },
    ],
  },
  {
    id: 'timestamp',
    label: 'Sello de tiempo',
    description: 'Sello RFC 3161 de una autoridad de tiempo confiable',
    icon: Clock,
    endpoint: '/pdf-tools/timestamp',
    fileFieldName: 'file',
    multiFile: false,
    fields: [],
  },
  {
    id: 'split',
    label: 'Dividir',
    description: 'Divide un PDF en varios documentos por número de página',
    icon: Scissors,
    endpoint: '/pdf-tools/split',
    fileFieldName: 'file',
    multiFile: false,
    fields: [
      {
        name: 'pageNumbers',
        label: 'Páginas',
        type: 'text',
        default: 'all',
        placeholder: 'all  o  1,3,5-8',
        help: 'Formato Stirling: "all" o rangos como 1,3,5-8',
      },
    ],
  },
  {
    id: 'compress',
    label: 'Comprimir',
    description: 'Reduce el tamaño del PDF (útil para evidencia pesada)',
    icon: Minimize2,
    endpoint: '/pdf-tools/compress',
    fileFieldName: 'file',
    multiFile: false,
    fields: [{ name: 'optimizeLevel', label: 'Nivel de optimización (1-9)', type: 'number', default: 4, min: 1, max: 9 }],
  },
];

export function getPdfToolOperation(id: string | null | undefined): PdfToolOperation | undefined {
  return PDF_TOOL_OPERATIONS.find((op) => op.id === id);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
