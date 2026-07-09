-- Atomic publication function: applies all asset updates AND creates the immutable publication record
-- in a single PostgreSQL transaction. If any step fails, the entire operation rolls back.
-- The UNIQUE constraint on asset_publication_records.asset_id enforces idempotency at the database level.

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_asset_with_record(
  p_asset_id uuid,
  p_updates jsonb,
  p_published_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset record;
  v_client_name text;
BEGIN
  -- Apply all field updates to content_assets in a single statement.
  -- p_updates is a JSONB object like {"title": "New Title", "assigned_to": "uuid", ...}
  -- We build a dynamic UPDATE from the JSONB keys.
  EXECUTE format(
    'UPDATE public.content_assets SET %s, updated_at = now() WHERE id = $1',
    (
      SELECT string_agg(format('%I = $2->>%L', key, key), ', ')
      FROM jsonb_object_keys(p_updates) AS key
    )
  )
  USING p_asset_id, p_updates;

  -- Verify the update affected exactly one row
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- Read the updated asset state for the publication snapshot.
  -- This captures the FINAL state after all updates, including any title/type/assignee changes.
  SELECT * INTO v_asset
  FROM public.content_assets
  WHERE id = p_asset_id;

  -- Read client name for denormalization (survives client deletion)
  SELECT name INTO v_client_name
  FROM public.clients
  WHERE id = v_asset.client_id;

  IF NOT FOUND THEN
    v_client_name := 'Unknown Client';
  END IF;

  -- Insert immutable publication record.
  -- The UNIQUE constraint on asset_id prevents duplicates.
  -- If a duplicate exists, PostgreSQL raises a unique_violation error.
  INSERT INTO public.asset_publication_records (
    asset_id,
    client_id,
    client_name,
    title,
    type,
    uploaded_at,
    approved_at,
    published_at,
    publish_date,
    publish_time,
    created_at,
    drive_file_url,
    assigned_to,
    approved_by,
    revision_count
  ) VALUES (
    v_asset.id,
    v_asset.client_id,
    v_client_name,
    v_asset.title,
    v_asset.type,
    v_asset.uploaded_at,
    COALESCE(v_asset.approved_at, p_published_at),
    p_published_at,
    v_asset.publish_date,
    v_asset.publish_time,
    v_asset.created_at,
    v_asset.drive_file_url,
    v_asset.assigned_to,
    v_asset.approved_by,
    v_asset.revision_count
  );

  -- If the INSERT fails (unique constraint violation), PostgreSQL rolls back everything.
END;
$$;

COMMIT;
