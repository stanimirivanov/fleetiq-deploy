-- Resolve or quote identifiers as in the ordinary grant batch. Both verbs
-- consume the same privilege rows and stay within the caller's transaction.
SELECT format('%s %s ON %s %s %I',
  :'rebuild_acl_action',
  CASE WHEN kind = 'column' THEN format('%s (%I)', privilege, column_name) ELSE privilege END,
  CASE kind
    WHEN 'database' THEN format('DATABASE %I', object)
    WHEN 'schema' THEN format('SCHEMA %I', object)
    WHEN 'relation' THEN format('TABLE %s', object::regclass)
    WHEN 'column' THEN format('TABLE %s', object::regclass)
    WHEN 'function' THEN format('FUNCTION %s', object::regprocedure)
  END,
  :'rebuild_acl_direction', role_name)
FROM pg_temp.rebuild_acl
ORDER BY kind, object, privilege, column_name
\gexec
