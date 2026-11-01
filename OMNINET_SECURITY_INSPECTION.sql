BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

-- Manual inspection only. This script reads catalogs, not customer records.
-- Compatible with PostgreSQL 14+. View options are reported as stored; the
-- security_invoker view option is available on PostgreSQL 15 and later.
-- Definitions can contain hard-coded sensitive literals. Review results locally
-- and redact any such literals before sharing. No connection credentials are read.
-- Effective ACL privileges do not by themselves establish RLS row access or
-- remote API exposure. Review policies, role inheritance and exposed schemas.

SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('server_version') AS server_version;

-- 1. Relevant functions: every overload, across all schemas. LEFT JOIN preserves
-- a missing-function result. Missing roles produce NULL rather than an error.
WITH wanted(name) AS (
  VALUES ('create_block_autopause'), ('claim_availability_block'),
         ('confirm_availability_action'), ('transition_owner_acknowledged'),
         ('transition_owner_contacted'), ('transition_owner_closed'),
         ('transition_checkout_created'), ('transition_action_claimed'),
         ('transition_payment_confirmed'), ('delete_tag_cascade'),
         ('admin_delete_tag_cascade_by_uuid'), ('get_ranked_blocks_mix_v2'),
         ('generate_availability_action_public_ref')
), roles AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname = 'anon') AS anon_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') AS auth_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'service_role') AS service_oid
)
SELECT w.name AS requested_function, n.nspname AS schema_name,
       p.oid IS NOT NULL AS function_exists,
       p.oid::regprocedure::text AS signature,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       p.proconfig AS function_settings, p.proacl AS explicit_acl,
       has_schema_privilege(r.anon_oid, n.oid, 'USAGE') AS anon_schema_usage,
       has_schema_privilege(r.auth_oid, n.oid, 'USAGE') AS authenticated_schema_usage,
       has_function_privilege(r.anon_oid, p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege(r.auth_oid, p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege(r.service_oid, p.oid, 'EXECUTE') AS service_execute,
       pg_get_functiondef(p.oid) AS definition
FROM wanted w
LEFT JOIN pg_proc p ON p.proname = w.name AND p.prokind = 'f'
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN roles r
ORDER BY w.name, n.nspname, signature;

-- 2. All non-system SECURITY DEFINER functions, including unexpected helpers.
SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       owner_role.rolsuper AS owner_superuser,
       owner_role.rolbypassrls AS owner_bypasses_rls,
       p.proconfig AS function_settings, p.proacl AS explicit_acl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner_role ON owner_role.oid = p.proowner
WHERE p.prokind = 'f' AND p.prosecdef
  AND n.nspname <> 'information_schema'
  AND n.nspname !~ '^pg_'
ORDER BY n.nspname, signature;

-- Expanded effective function ACL defaults, including PUBLIC (grantee OID 0).
-- This is the object's ACL, not a substitute for inherited privilege checks.
SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS signature,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee) END AS grantee,
       pg_get_userbyid(a.grantor) AS grantor,
       a.privilege_type, a.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl, acldefault('f', p.proowner))
) a
WHERE p.prokind = 'f' AND n.nspname <> 'information_schema'
  AND n.nspname !~ '^pg_'
ORDER BY n.nspname, signature, grantee, a.privilege_type;

-- 3. Relevant table existence, RLS, ownership and effective table privileges.
WITH wanted(name) AS (
  VALUES ('messages'), ('tags'), ('availability_blocks'),
         ('availability_actions'), ('bookings'), ('admin_user_ids'),
         ('email_events'), ('notification_logs'), ('operational_events'),
         ('donations'), ('commitment_waitlist'), ('users')
), roles AS (
  SELECT oid, rolname FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT w.name AS relation_name, c.oid IS NOT NULL AS relation_exists,
       c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       c.relacl AS explicit_acl, r.rolname AS role_name,
       has_schema_privilege(r.oid, n.oid, 'USAGE') AS schema_usage,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate,
       has_table_privilege(r.oid, c.oid, 'REFERENCES') AS can_reference,
       has_table_privilege(r.oid, c.oid, 'TRIGGER') AS can_create_trigger
FROM wanted w CROSS JOIN roles r
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = w.name
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY w.name, r.rolname;

-- All public policies, including administrative membership and helper tables.
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check AS with_check_expression
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. Effective column privileges include table-wide grants.
SELECT c.relname AS relation_name, a.attname AS column_name,
       r.rolname AS role_name, a.attacl AS explicit_column_acl,
       has_column_privilege(r.oid, c.oid, a.attnum, 'SELECT') AS can_select,
       has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT') AS can_insert,
       has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') AS can_update,
       has_column_privilege(r.oid, c.oid, a.attnum, 'REFERENCES') AS can_reference
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND c.relname IN (
    'messages', 'tags', 'availability_blocks', 'availability_actions',
    'bookings', 'admin_user_ids', 'email_events', 'notification_logs',
    'operational_events', 'donations', 'commitment_waitlist', 'users'
  )
  AND a.attnum > 0 AND NOT a.attisdropped
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY c.relname, r.rolname, a.attnum;

-- 5. Administrative role capabilities and membership metadata only.
-- pg_roles masks passwords; do not query pg_authid or administrative user rows.
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls
FROM pg_roles ORDER BY rolname;

SELECT parent.rolname AS granted_role, member.rolname AS member_role,
       m.admin_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
ORDER BY parent.rolname, member.rolname;

SELECT pg_get_userbyid(d.defaclrole) AS grant_owner,
       n.nspname AS schema_name, d.defaclobjtype, d.defaclacl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY grant_owner, schema_name, d.defaclobjtype;

-- Schema CREATE matters when evaluating SECURITY DEFINER search paths.
SELECT n.nspname AS schema_name, r.rolname AS role_name,
       pg_get_userbyid(n.nspowner) AS schema_owner, n.nspacl AS explicit_acl,
       has_schema_privilege(r.oid, n.oid, 'USAGE') AS can_use,
       has_schema_privilege(r.oid, n.oid, 'CREATE') AS can_create
FROM pg_namespace n CROSS JOIN pg_roles r
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY n.nspname, r.rolname;

-- 6. Public views/materialized views: options, owner and effective read access.
-- Materialized views need their own access review; base-table RLS is not enough.
SELECT n.nspname AS schema_name, c.relname AS view_name, c.relkind,
       pg_get_userbyid(c.relowner) AS owner,
       c.reloptions AS security_options, c.relacl AS explicit_acl,
       r.rolname AS role_name,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY c.relname, r.rolname;

-- 7. Claim-related column types/defaults/nullability (no application rows).
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, a.attidentity AS identity_kind,
       a.attgenerated AS generated_kind,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND c.relname IN ('availability_blocks', 'availability_actions', 'bookings', 'donations')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

SELECT c.relname AS table_name, con.conname, con.contype,
       con.convalidated, con.condeferrable, con.condeferred,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('messages', 'tags', 'availability_blocks',
                   'availability_actions', 'bookings', 'donations')
ORDER BY c.relname, con.conname;

SELECT c.relname AS table_name,
       i.indexrelid::regclass::text AS index_name,
       i.indisunique, i.indisprimary, i.indisexclusion,
       i.indisvalid, i.indisready,
       pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('availability_blocks', 'availability_actions', 'bookings', 'donations')
ORDER BY c.relname, index_name;

SELECT c.relname AS table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid, true) AS trigger_definition,
       p.oid::regprocedure::text AS trigger_function,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS function_owner,
       p.proconfig AS function_settings,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('messages', 'tags', 'availability_blocks',
                   'availability_actions', 'bookings', 'donations')
ORDER BY c.relname, t.tgname;

-- Inspect any delegated helpers identified in definitions separately. This file
-- never executes them. Atomicity, locking, expiry and tenant checks require
-- reading the actual function bodies; names and ACLs cannot establish them.
ROLLBACK;
