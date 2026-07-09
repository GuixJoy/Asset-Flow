import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function getClient(client?: SupabaseClient) {
  return client ?? (await createServerSupabaseClient());
}

interface PublicationRecord {
  asset_id: string;
  client_id: string;
  client_name: string;
  title: string;
  type: string;
  uploaded_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  publish_date: string | null;
  publish_time: string | null;
  created_at: string;
  drive_file_url: string | null;
}

/**
 * Lists published assets for a given client within a date range.
 * Reads exclusively from the immutable asset_publication_records table.
 * The published_at field is always populated in this table (captured at publication time),
 * so the date filter is applied in SQL for efficiency.
 */
export async function listClientAssetsForReport(
  clientId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PublicationRecord[]> {
  const supabase = await getClient(client);

  const { data, error } = await supabase
    .from('asset_publication_records')
    .select('asset_id, client_id, client_name, title, type, uploaded_at, approved_at, published_at, publish_date, publish_time, created_at, drive_file_url')
    .eq('client_id', clientId)
    .gte('published_at', startDate.toISOString())
    .lte('published_at', endDate.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PublicationRecord[];
}
