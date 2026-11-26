-- Reversa de 2026-11-biblioteca-papel-1-editable.sql
-- BORRA los ajustes de biblioteca por papel de TODAS las organizaciones (ediciones, procedimientos propios y ocultamientos).
-- Postgres no permite quitar un valor de un enum: 'PAPER_PROCEDURE' queda en el tipo, sin filas, y es inofensivo.
-- Las demás filas de content_library_items (procedimientos sustantivos y preguntas COSO) NO se tocan.
DELETE FROM "content_library_items" WHERE "kind" = 'PAPER_PROCEDURE';
