-- Truncate all public tables except Prisma migration history (for re-importing data).
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I', tablename), ', ') || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> '_prisma_migrations';
  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;
