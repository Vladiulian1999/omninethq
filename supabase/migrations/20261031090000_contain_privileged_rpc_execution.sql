-- REVIEW DRAFT ONLY. Do not apply without reviewing the companion verification
-- output and docs/security-containment-plan.md. No function bodies are changed.
-- Deploy authenticated offer creation and owner deletion routes first.
-- Exact signatures are resolved from the catalog, including every overload.
-- Resolve exact, schema-qualified identity signatures from pg_proc; never guess
-- types, use ALL FUNCTIONS IN SCHEMA, or omit overload argument lists.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog;

DO $containment$
DECLARE
  target_names constant text[] := ARRAY[
    'admin_delete_tag_cascade', 'admin_delete_tag_orphan_by_uuid',
    'demo_confirm_conversion',
    'admin_delete_tag_cascade_by_uuid', 'delete_tag_cascade',
    'create_block_autopause', 'transition_payment_confirmed',
    'transition_checkout_created', 'transition_action_claimed',
    'transition_owner_acknowledged', 'transition_owner_contacted',
    'transition_owner_closed', 'confirm_availability_action'
  ];
  target_name text;
  target_count integer;
  target record;
  anon_oid oid;
  authenticated_oid oid;
  service_oid oid;
BEGIN
  SELECT oid INTO anon_oid FROM pg_roles WHERE rolname = 'anon';
  SELECT oid INTO authenticated_oid FROM pg_roles WHERE rolname = 'authenticated';
  SELECT oid INTO service_oid FROM pg_roles WHERE rolname = 'service_role';
  IF anon_oid IS NULL OR authenticated_oid IS NULL OR service_oid IS NULL THEN
    RAISE EXCEPTION 'Expected Supabase roles are missing; no containment applied';
  END IF;
  IF NOT has_schema_privilege(service_oid, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'service_role lacks public schema USAGE; review separately';
  END IF;

  -- Validate the reported inventory before changing any grants. Additional
  -- overloads of listed public functions are included, not silently ignored.
  FOREACH target_name IN ARRAY target_names LOOP
    SELECT count(*) INTO target_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = target_name AND p.prokind = 'f';
    IF target_count = 0 OR (target_name = 'create_block_autopause' AND target_count < 2) THEN
      RAISE EXCEPTION 'Missing reported function/overload: public.%', target_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(target_names)
      AND p.prokind = 'f' AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Inventory differs: target is not SECURITY DEFINER; review first';
  END IF;

  FOR target IN
    SELECT p.oid AS function_oid,
           format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(target_names)
      AND p.prokind = 'f'
    ORDER BY p.proname, p.oid
  LOOP
    -- Grant first, then revoke, in the same transaction. Ownership is unchanged.
    -- No unrelated roles, public claim RPCs or schemas change.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
                   target.signature);

    -- Fail atomically if inheritance, ownership or another effective grant
    -- still permits untrusted execution. Do not alter role membership here.
    IF has_function_privilege(anon_oid, target.function_oid, 'EXECUTE')
       OR has_function_privilege(authenticated_oid, target.function_oid, 'EXECUTE')
       OR NOT has_function_privilege(service_oid, target.function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected effective execution permission: %', target.signature;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = target.function_oid AND a.grantee = 0
        AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC execution remains: %', target.signature;
    END IF;
    RAISE NOTICE 'Contained %', target.signature;
  END LOOP;
END;
$containment$;

COMMIT;
