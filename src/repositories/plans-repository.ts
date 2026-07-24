import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type DbContentPlan = Database['public']['Tables']['content_plans']['Row'];

const planSelect =
  'id,cycle_id,client_id,week_number,week_start,week_end,planned_reels,planned_posters,created_at';

async function getClient(client?: SupabaseClient<Database>) {
  return client ?? (await createServerSupabaseClient());
}

export async function listPlansByCycleId(
  cycleId: string,
  client?: SupabaseClient<Database>
): Promise<DbContentPlan[]> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('content_plans')
    .select(planSelect)
    .eq('cycle_id', cycleId)
    .order('week_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listPlansByClientId(
  clientId: string,
  client?: SupabaseClient<Database>
): Promise<DbContentPlan[]> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('content_plans')
    .select(planSelect)
    .eq('client_id', clientId)
    .order('week_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function deletePlansByCycleId(
  cycleId: string,
  client?: SupabaseClient<Database>
): Promise<void> {
  const supabase = await getClient(client);
  const { error } = await supabase
    .from('content_plans')
    .delete()
    .eq('cycle_id', cycleId);

  if (error) {
    throw new Error(error.message);
  }
}
