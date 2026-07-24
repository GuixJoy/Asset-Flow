import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type DbServiceCycle = Database['public']['Tables']['service_cycles']['Row'];

const cycleSelect =
  'id,client_id,start_date,end_date,reels_target,posters_target,status,created_by,created_at,updated_at';

async function getClient(client?: SupabaseClient<Database>) {
  return client ?? (await createServerSupabaseClient());
}

export async function listCyclesByClientId(
  clientId: string,
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle[]> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .select(cycleSelect)
    .eq('client_id', clientId)
    .order('start_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getActiveCycleForClient(
  clientId: string,
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle | null> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .select(cycleSelect)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function getUpcomingCycleForClient(
  clientId: string,
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle | null> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .select(cycleSelect)
    .eq('client_id', clientId)
    .eq('status', 'upcoming')
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function getCycleById(
  cycleId: string,
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle | null> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .select(cycleSelect)
    .eq('id', cycleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function insertCycle(
  payload: Database['public']['Tables']['service_cycles']['Insert'],
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .insert(payload)
    .select(cycleSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateCycle(
  cycleId: string,
  updates: Database['public']['Tables']['service_cycles']['Update'],
  client?: SupabaseClient<Database>
): Promise<DbServiceCycle> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from('service_cycles')
    .update(updates)
    .eq('id', cycleId)
    .select(cycleSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteCycle(
  cycleId: string,
  client?: SupabaseClient<Database>
): Promise<void> {
  const supabase = await getClient(client);
  const { error } = await supabase
    .from('service_cycles')
    .delete()
    .eq('id', cycleId);

  if (error) {
    throw new Error(error.message);
  }
}
