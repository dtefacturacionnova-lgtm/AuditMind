-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Biblioteca por papel EDITABLE por organización — 1 valor nuevo en un enum existente. Nada más.
-- Diseño: docs/ia-contexto-del-papel-propuesta.md §5 (catálogo en código + ajustes por organización).
-- Los ajustes de cada organización (ediciones de lo que trae el sistema, procedimientos propios, ocultar/restaurar) se guardan
-- en la tabla que YA existe (content_library_items) con kind = 'PAPER_PROCEDURE'. No hay tablas ni columnas nuevas.
-- Cambio ADITIVO: ninguna fila existente cambia. El código nuevo tolera que este valor aún no exista (cae a la biblioteca base),
-- pero conviene aplicarlo ANTES de desplegar para que las pantallas de administración funcionen.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-11-biblioteca-papel-1-editable.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

ALTER TYPE "ContentLibraryKind" ADD VALUE IF NOT EXISTS 'PAPER_PROCEDURE';
