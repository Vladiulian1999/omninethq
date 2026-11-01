BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;

-- Run manually before approval and after containment. Catalog metadata only.
-- Includes every overload across schemas and missing-function rows. The draft
-- migration targets public only; unexpected schemas require separate review.
WITH wanted(name) AS (
  VALUES ('admin_delete_tag_cascade_by_uuid'), ('delete_tag_cascade'),
         ('create_block_autopause'), ('transition_payment_confirmed'),
         ('transition_checkout_created'), ('transition_action_claimed'),
         ('transition_owner_acknowledged'), ('transition_owner_contacted'),
         ('transition_owner_closed'), ('confirm_availability_action')
), roles AS (
  SELECT (SELECT oid FROM pg_roles WHERE rolname = 'anon') AS anon_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') AS auth_oid,
         (SELECT oid FROM pg_roles WHERE rolname = 'service_role') AS service_oid
)
SELECT w.name AS requested_function, p.oid IS NOT NULL AS function_exists,
       n.nspname AS schema_name,
       CASE WHEN p.oid IS NOT NULL THEN
         format('%I.%I(%s)', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid)) END AS exact_signature,
       count(p.oid) OVER (PARTITION BY n.nspname, w.name) AS overload_count,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege(r.anon_oid, p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege(r.auth_oid, p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege(r.service_oid, p.oid, 'EXECUTE') AS service_execute,
       has_schema_privilege(r.anon_oid, n.oid, 'USAGE') AS anon_schema_usage,
       has_schema_privilege(r.auth_oid, n.oid, 'USAGE') AS authenticated_schema_usage,
       has_schema_privilege(r.service_oid, n.oid, 'USAGE') AS service_schema_usage,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_execute_grant,
       p.proacl AS explicit_acl,
       CASE WHEN p.oid IS NULL OR r.anon_oid IS NULL OR r.auth_oid IS NULL
                      OR r.service_oid IS NULL THEN 'FAIL: missing function or role'
            WHEN n.nspname <> 'public' THEN 'REVIEW: outside migration scope'
            WHEN has_function_privilege(r.anon_oid, p.oid, 'EXECUTE')
              OR has_function_privilege(r.auth_oid, p.oid, 'EXECUTE')
              OR NOT has_function_privilege(r.service_oid, p.oid, 'EXECUTE')
              OR NOT has_schema_privilege(r.service_oid, n.oid, 'USAGE')
              OR EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
              ) THEN 'FAIL: containment permissions'
            ELSE 'PASS' END AS permission_result
FROM wanted w
LEFT JOIN pg_proc p ON p.proname = w.name AND p.prokind = 'f'
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN roles r
ORDER BY w.name, n.nspname, exact_signature;

-- Inspect all direct ACL entries for explanation of inherited/default grants.
SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS signature,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
WHERE p.prokind = 'f' AND p.proname IN (
  'admin_delete_tag_cascade_by_uuid', 'delete_tag_cascade', 'create_block_autopause',
  'transition_payment_confirmed', 'transition_checkout_created',
  'transition_action_claimed', 'transition_owner_acknowledged',
  'transition_owner_contacted', 'transition_owner_closed', 'confirm_availability_action'
)
ORDER BY schema_name, signature, grantee;

-- Public claim permissions are not changed by this migration. Capture before
-- and after, and review the body for delegated helper calls (not all PL/pgSQL
-- dependencies appear in pg_depend). No application function is invoked here.
SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS signature,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
       p.proacl AS explicit_acl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f' AND p.proname = 'claim_availability_block'
ORDER BY schema_name, signature;

ROLLBACK;
