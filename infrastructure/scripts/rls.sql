-- ═══════════════════════════════════════════════════════════════════════
-- AuditMind — Row Level Security (RLS) Multi-Tenant
-- Columnas en camelCase (Prisma default, sin @@map en campos)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── FUNCIONES HELPER ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION get_current_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'READ_ONLY'
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT get_current_role() = 'SUPER_ADMIN';
$$;

CREATE OR REPLACE FUNCTION has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT get_current_role() = ANY(roles);
$$;

-- Backend (NestJS): inyecta tenant context con service_role
CREATE OR REPLACE FUNCTION set_current_tenant(org_id TEXT, user_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.current_org_id', org_id, TRUE);
  PERFORM set_config('app.current_role', user_role, TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_org_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_org_id', TRUE), ''),
    get_current_org_id()
  );
$$;

CREATE OR REPLACE FUNCTION get_tenant_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_role', TRUE), ''),
    get_current_role()
  );
$$;

-- ─── HABILITAR RLS ────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpe_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_paper_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tick_mark_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pbc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pbc_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_router_logs ENABLE ROW LEVEL SECURITY;

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────

CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (
    is_super_admin() OR id = get_tenant_org_id()
  );

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (
    is_super_admin() OR (id = get_tenant_org_id() AND has_role(ARRAY['ADMIN']))
  );

CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (is_super_admin());

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE POLICY "users_select" ON users
  FOR SELECT USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE'])
    )
  );

CREATE POLICY "users_update" ON users
  FOR UPDATE USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND (
        has_role(ARRAY['ADMIN', 'CAE'])
        OR "supabaseUserId" = auth.uid()::TEXT
      )
    )
  );

-- ─── USER CERTIFICATIONS / COMPETENCIES / CPE ─────────────────────────────────

CREATE POLICY "user_certs_all" ON user_certifications
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM users WHERE id = "userId" AND "organizationId" = get_tenant_org_id())
  );

CREATE POLICY "user_comp_all" ON user_competencies
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM users WHERE id = "userId" AND "organizationId" = get_tenant_org_id())
  );

CREATE POLICY "cpe_all" ON cpe_records
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM users WHERE id = "userId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── AUDIT ENTITIES ───────────────────────────────────────────────────────────

CREATE POLICY "audit_entities_all" ON audit_entities
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

-- ─── AUDIT PLANS ──────────────────────────────────────────────────────────────

CREATE POLICY "audit_plans_all" ON audit_plans
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "audit_plan_items_all" ON audit_plan_items
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM audit_plans WHERE id = "planId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── RISK REGISTERS ───────────────────────────────────────────────────────────

CREATE POLICY "risk_registers_all" ON risk_registers
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

-- ─── AUDITS ───────────────────────────────────────────────────────────────────

CREATE POLICY "audits_select" ON audits
  FOR SELECT USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id() AND (
        NOT "isInvestigationMode"
        OR has_role(ARRAY['CAE', 'ADMIN', 'SUPER_ADMIN'])
        OR EXISTS (
          SELECT 1 FROM audit_teams
          WHERE "auditId" = audits.id
          AND "userId" = (SELECT id FROM users WHERE "supabaseUserId" = auth.uid()::TEXT LIMIT 1)
        )
      )
    )
  );

CREATE POLICY "audits_insert" ON audits
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR'])
    )
  );

CREATE POLICY "audits_update" ON audits
  FOR UPDATE USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR'])
    )
  );

-- ─── AUDIT TEAMS / PROGRAMS ───────────────────────────────────────────────────

CREATE POLICY "audit_teams_all" ON audit_teams
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM audits WHERE id = "auditId" AND "organizationId" = get_tenant_org_id())
  );

CREATE POLICY "audit_programs_all" ON audit_programs
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM audits WHERE id = "auditId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── WORKING PAPERS ───────────────────────────────────────────────────────────

CREATE POLICY "working_papers_select" ON working_papers
  FOR SELECT USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM audits a
      WHERE a.id = "auditId"
      AND a."organizationId" = get_tenant_org_id()
      AND (
        has_role(ARRAY['CAE', 'AUDIT_MANAGER', 'ADMIN'])
        OR EXISTS (
          SELECT 1 FROM audit_teams at2
          WHERE at2."auditId" = a.id
          AND at2."userId" = (SELECT id FROM users WHERE "supabaseUserId" = auth.uid()::TEXT LIMIT 1)
        )
      )
    )
  );

CREATE POLICY "working_papers_modify" ON working_papers
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM audits a
      JOIN audit_teams at2 ON at2."auditId" = a.id
      WHERE a.id = "auditId"
      AND a."organizationId" = get_tenant_org_id()
      AND at2."userId" = (SELECT id FROM users WHERE "supabaseUserId" = auth.uid()::TEXT LIMIT 1)
    )
  );

CREATE POLICY "wp_versions_all" ON working_paper_versions
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM working_papers wp
      JOIN audits a ON a.id = wp."auditId"
      WHERE wp.id = "paperId" AND a."organizationId" = get_tenant_org_id()
    )
  );

CREATE POLICY "wp_comments_all" ON working_paper_comments
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM working_papers wp
      JOIN audits a ON a.id = wp."auditId"
      WHERE wp.id = "paperId" AND a."organizationId" = get_tenant_org_id()
    )
  );

CREATE POLICY "tick_marks_all" ON tick_mark_entries
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM working_papers wp
      JOIN audits a ON a.id = wp."auditId"
      WHERE wp.id = "paperId" AND a."organizationId" = get_tenant_org_id()
    )
  );

-- ─── EXTERNAL CONFIRMATIONS ───────────────────────────────────────────────────

CREATE POLICY "confirmations_all" ON external_confirmations
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM audits WHERE id = "auditId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── PBC REQUESTS ─────────────────────────────────────────────────────────────

CREATE POLICY "pbc_select" ON pbc_requests
  FOR SELECT USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id() AND (
        NOT has_role(ARRAY['AUDITEE'])
        OR "requestedToEmail" = (
          SELECT email FROM users WHERE "supabaseUserId" = auth.uid()::TEXT LIMIT 1
        )
      )
    )
  );

CREATE POLICY "pbc_insert" ON pbc_requests
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR'])
    )
  );

CREATE POLICY "pbc_update" ON pbc_requests
  FOR UPDATE USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "pbc_messages_all" ON pbc_messages
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM pbc_requests WHERE id = "requestId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── FINDINGS ─────────────────────────────────────────────────────────────────

CREATE POLICY "findings_select" ON findings
  FOR SELECT USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id() AND (
        NOT has_role(ARRAY['AUDITEE'])
        OR "responsibleId" = (
          SELECT id FROM users WHERE "supabaseUserId" = auth.uid()::TEXT LIMIT 1
        )
      )
    )
  );

CREATE POLICY "findings_insert" ON findings
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR'])
    )
  );

CREATE POLICY "findings_update" ON findings
  FOR UPDATE USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "finding_actions_all" ON finding_actions
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "finding_comments_all" ON finding_comments
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM findings WHERE id = "findingId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── ANALYTICS ────────────────────────────────────────────────────────────────

CREATE POLICY "analytics_jobs_all" ON data_analysis_jobs
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "data_flags_all" ON data_flags
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM data_analysis_jobs WHERE id = "jobId" AND "organizationId" = get_tenant_org_id())
  );

-- ─── REPORTS / TEMPLATES / KNOWLEDGE ─────────────────────────────────────────

CREATE POLICY "reports_all" ON audit_reports
  FOR ALL USING (is_super_admin() OR "organizationId" = get_tenant_org_id());

CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (
    is_super_admin() OR "isGlobal" = TRUE OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "templates_modify" ON templates
  FOR ALL USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR'])
    )
  );

CREATE POLICY "knowledge_select" ON knowledge_documents
  FOR SELECT USING (
    is_super_admin() OR scope = 'GLOBAL' OR "organizationId" = get_tenant_org_id()
  );

CREATE POLICY "knowledge_modify" ON knowledge_documents
  FOR ALL USING (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

-- ─── IA ───────────────────────────────────────────────────────────────────────

CREATE POLICY "ai_interactions_all" ON ai_interactions
  FOR ALL USING (is_super_admin() OR "organizationId" = get_tenant_org_id());

CREATE POLICY "llm_logs_select" ON llm_router_logs
  FOR SELECT USING (
    is_super_admin() OR (
      "organizationId" = get_tenant_org_id()
      AND has_role(ARRAY['SUPER_ADMIN', 'ADMIN', 'CAE'])
    )
  );

CREATE POLICY "llm_logs_insert" ON llm_router_logs
  FOR INSERT WITH CHECK (
    is_super_admin() OR "organizationId" = get_tenant_org_id()
  );

-- ═══════════════════════════════════════════════════════════════════════
-- Verificar: SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND rowsecurity = TRUE;
-- ═══════════════════════════════════════════════════════════════════════
