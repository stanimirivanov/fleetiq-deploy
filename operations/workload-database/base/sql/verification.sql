CREATE FUNCTION pg_temp.verify_acl() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN
  PERFORM pg_temp.check_scoped_roles();
  IF has_database_privilege(current_setting('fleetiq.legacy'), current_database(), 'CONNECT')
      OR NOT has_database_privilege('cnpg_metrics_exporter', current_database(), 'CONNECT')
  THEN RAISE EXCEPTION 'Legacy or monitoring database admission differs'; END IF;

  IF EXISTS (
    SELECT FROM pg_roles r JOIN pg_temp.known_roles k ON k.name = r.rolname
    WHERE r.rolname NOT IN (SELECT name FROM pg_temp.selected_roles)
      AND (r.rolcanlogin OR has_database_privilege(r.oid, current_database(), 'CONNECT')
        OR EXISTS (SELECT FROM pg_auth_members m WHERE m.roleid = r.oid))
  ) THEN RAISE EXCEPTION 'An unselected database identity still has authority'; END IF;

  IF EXISTS (
    SELECT FROM pg_namespace n CROSS JOIN pg_roles r
    WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
      AND n.nspname NOT IN (SELECT name FROM pg_temp.product_schemas)
      AND r.rolname IN (SELECT name FROM pg_temp.selected_roles)
      AND (has_schema_privilege(r.oid, n.oid, 'USAGE')
        OR has_schema_privilege(r.oid, n.oid, 'CREATE'))
  ) THEN RAISE EXCEPTION 'Unintended access to an additional user schema'; END IF;

  IF EXISTS (
    WITH acl(kind, object, grantee, privilege, grantable) AS (
      SELECT 'database', d.datname::text, x.grantee, x.privilege_type, x.is_grantable
      FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x
      WHERE d.oid = current_setting('fleetiq.database_oid')::oid
      UNION ALL
      SELECT 'schema', n.nspname, x.grantee, x.privilege_type, x.is_grantable
      FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x
      WHERE n.nspname IN (SELECT name FROM pg_temp.product_schemas)
      UNION ALL
      SELECT 'relation', n.nspname || '.' || c.relname, x.grantee, x.privilege_type, x.is_grantable
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) x
      WHERE n.nspname IN (SELECT name FROM pg_temp.product_schemas)
      UNION ALL
      SELECT 'column', n.nspname || '.' || c.relname || '.' || a.attname, x.grantee, x.privilege_type, x.is_grantable
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(a.attacl) x
      WHERE n.nspname IN (SELECT name FROM pg_temp.product_schemas)
      UNION ALL
      SELECT 'function', n.nspname || '.' || p.proname || '(' || replace(oidvectortypes(p.proargtypes), ', ', ',') || ')',
             x.grantee, x.privilege_type, x.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
        LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
      WHERE n.nspname IN (SELECT name FROM pg_temp.product_schemas)
    ), observed AS (
      SELECT coalesce(r.rolname::text, 'PUBLIC'), a.kind, a.object, a.privilege, a.grantable
      FROM acl a LEFT JOIN pg_roles r ON a.grantee = r.oid
      WHERE a.grantee = 0 OR r.rolname IN (SELECT name FROM pg_temp.selected_roles)
    ), expected AS (
      SELECT * FROM pg_temp.desired_acl
      UNION ALL SELECT 'PUBLIC', 'schema', 'public', 'USAGE', false
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM observed)
    UNION ALL
    (SELECT * FROM observed EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'FleetIQ object grants differ from the reviewed policy'; END IF;
END $$;
