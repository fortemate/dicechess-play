-- Create a dedicated least-privilege role using the secret mounted by Compose.
DO $bootstrap$
DECLARE
  app_password text;
BEGIN
  app_password := rtrim(pg_read_file('/run/secrets/laboratory_password'), E'\r\n');
  IF app_password = '' THEN
    RAISE EXCEPTION 'laboratory database password secret is empty';
  END IF;
  EXECUTE format('CREATE ROLE laboratory_app LOGIN PASSWORD %L', app_password);
END
$bootstrap$;

-- Prevent the application role from connecting to the administrative database.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;

CREATE DATABASE laboratory OWNER laboratory_app;
REVOKE CONNECT ON DATABASE laboratory FROM PUBLIC;
GRANT CONNECT ON DATABASE laboratory TO laboratory_app;
