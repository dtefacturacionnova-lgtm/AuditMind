-- REVERSA de 2026-10-18-cerrar-postgrest-publico.sql
-- ⚠ Reabre el acceso público (anon) a la base. Usar SOLO si el cierre rompió algo y
-- mientras se corrige — el estado que restaura es el inseguro.
-- Generado desde el respaldo exacto del catálogo tomado antes del cambio
-- (2026-10-18T01:41:41.094151Z): las 64 tablas que estaban SIN RLS y los grants ALL de anon/authenticated.
BEGIN;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- Solo las 64 que estaban sin RLS (las otras 29 ya lo tenían y se dejan igual).
ALTER TABLE public."_prisma_migrations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."acceptance_checks" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_tasks" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_charters" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_folders" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_phases" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_procedures" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_processes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_projects" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_request_documents" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_restore_logs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_steps" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_templates" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."auditable_unit_assessments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."auditable_units" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."bcp_audits" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."caats_auto_runs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."clients" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."committee_reports" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."committee_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."compliance_assessments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."connector_imports" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_library_items" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."data_sources" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."dgii_contribuyentes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."engagement_letters" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."engagement_quality_reviews" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."engagements" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."entity_type_configs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."field_evidence_findings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."field_evidences" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."graph_entities" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."graph_entity_mentions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."graph_relations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."holiday_configs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."independence_declarations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."index_templates" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."investigation_reports" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."normative_exceptions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."paper_links" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."paper_references" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."paper_sections" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."pbc_paper_links" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."process_category_configs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposals" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_assessment_items" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_assessments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_findings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_remediation_actions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_root_causes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."qaip_standards" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."rag_chunks" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."rag_documents" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."step_evidences" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."strategic_lines" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."strategic_objectives" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."time_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."trial_balance_paper_links" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."trial_balances" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_availability_profiles" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_cost_profiles" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."watchlist_syncs" DISABLE ROW LEVEL SECURITY;

COMMIT;
