CREATE OR REPLACE FUNCTION public.aquazen_sql(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  trimmed text := btrim(q);
BEGIN
  IF trimmed ~* '^[[:space:]]*(select|with)[[:space:]]' THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || q || ') t' INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
  ELSIF trimmed ~* 'returning' THEN
    EXECUTE 'WITH t AS (' || q || ') SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM t' INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
  ELSE
    EXECUTE q;
    RETURN '[]'::jsonb;
  END IF;
END;
$$;
