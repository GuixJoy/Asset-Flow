-- Atomic publication function: applies typed asset updates AND creates the immutable
-- publication record in a single PostgreSQL transaction. If any step fails, the entire
-- operation rolls back. The UNIQUE constraint on asset_publication_records.asset_id
-- enforces idempotency at the database level.

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
  -- Apply all field updates with explicit type casting.
  -- Each column is updated only if its key exists in p_updates.
  UPDATE public.content_assets SET
    client_id          = CASE WHEN p_updates ? 'client_id'          THEN (p_updates->>'client_id')::uuid            ELSE client_id          END,
    title              = CASE WHEN p_updates ? 'title'              THEN p_updates->>'title'                        ELSE title              END,
    type               = CASE WHEN p_updates ? 'type'               THEN (p_updates->>'type')::public.asset_type    ELSE type               END,
    status             = CASE WHEN p_updates ? 'status'             THEN (p_updates->>'status')::public.asset_status ELSE status             END,
    drive_file_url     = CASE WHEN p_updates ? 'drive_file_url'     THEN p_updates->>'drive_file_url'               ELSE drive_file_url     END,
    drive_folder_id    = CASE WHEN p_updates ? 'drive_folder_id'    THEN p_updates->>'drive_folder_id'              ELSE drive_folder_id    END,
    drive_folder_url   = CASE WHEN p_updates ? 'drive_folder_url'   THEN p_updates->>'drive_folder_url'             ELSE drive_folder_url   END,
    thumbnail_url      = CASE WHEN p_updates ? 'thumbnail_url'      THEN p_updates->>'thumbnail_url'                ELSE thumbnail_url      END,
    assigned_to        = CASE WHEN p_updates ? 'assigned_to'        THEN (p_updates->>'assigned_to')::uuid          ELSE assigned_to        END,
    scheduled_at       = CASE WHEN p_updates ? 'scheduled_at'       THEN (p_updates->>'scheduled_at')::timestamptz  ELSE scheduled_at       END,
    publish_date       = CASE WHEN p_updates ? 'publish_date'       THEN (p_updates->>'publish_date')::date         ELSE publish_date       END,
    publish_time       = CASE WHEN p_updates ? 'publish_time'       THEN (p_updates->>'publish_time')::time         ELSE publish_time       END,
    scheduled_by       = CASE WHEN p_updates ? 'scheduled_by'       THEN (p_updates->>'scheduled_by')::uuid         ELSE scheduled_by       END,
    published_at       = CASE WHEN p_updates ? 'published_at'       THEN (p_updates->>'published_at')::timestamptz  ELSE published_at       END,
    approved_at        = CASE WHEN p_updates ? 'approved_at'        THEN (p_updates->>'approved_at')::timestamptz   ELSE approved_at        END,
    approved_by        = CASE WHEN p_updates ? 'approved_by'        THEN (p_updates->>'approved_by')::uuid          ELSE approved_by        END,
    updated_at         = now()
  WHERE id = p_asset_id;

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
