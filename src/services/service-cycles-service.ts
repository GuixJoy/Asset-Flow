import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import type { ServiceCycle, ServiceCycleWithPlan, ContentPlanRow, CreateCycleInput } from '@/types/index';
import {
  listCyclesByClientId,
  getActiveCycleForClient,
  getCycleById,
  insertCycle,
  updateCycle,
  deleteCycle,
  type DbServiceCycle,
} from '@/repositories/service-cycles-repository';
import { listPlansByCycleId, deletePlansByCycleId, type DbContentPlan } from '@/repositories/plans-repository';
import { generateWeeks, distributeDeliverables } from '@/services/plan-utils';
import type { SupabaseClient } from '@supabase/supabase-js';

type AssetType = Database['public']['Enums']['asset_type'];

/**
 * Generate content plan using TypeScript (not SQL RPC).
 * The SQL RPC has an integer division bug that produces wrong distributions.
 * This function uses the proven plan-utils.ts functions instead.
 */
async function generatePlanForCycle(
  cycleId: string,
  clientId: string,
  startDate: string,
  endDate: string,
  reelsTarget: number,
  postersTarget: number,
  supabase: SupabaseClient<Database>
): Promise<void> {
  // Delete existing plans
  await deletePlansByCycleId(cycleId, supabase);

  // Generate weeks from contract period
  const weeks = generateWeeks(startDate, endDate);

  // Distribute deliverables evenly across weeks
  const reelDistribution = distributeDeliverables(reelsTarget, weeks.length);
  const posterDistribution = distributeDeliverables(postersTarget, weeks.length);

  // Insert plan rows
  const planRows = weeks.map((week, i) => ({
    cycle_id: cycleId,
    client_id: clientId,
    week_number: week.weekNumber,
    week_start: week.weekStart,
    week_end: week.weekEnd,
    planned_reels: reelDistribution[i],
    planned_posters: posterDistribution[i],
  }));

  if (planRows.length > 0) {
    const { error } = await supabase.from('content_plans').insert(planRows);
    if (error) {
      console.error('[service-cycles] Plan insert failed', { cycleId, error: error.message });
      throw new Error(`Failed to generate content plan: ${error.message}`);
    }
  }
}

function mapCycle(row: DbServiceCycle): ServiceCycle {
  return {
    id: row.id,
    clientId: row.client_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reelsTarget: row.reels_target,
    postersTarget: row.posters_target,
    status: row.status as ServiceCycle['status'],
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapPlanRow(row: DbContentPlan): ContentPlanRow {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    clientId: row.client_id,
    weekNumber: row.week_number,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    plannedReels: row.planned_reels,
    plannedPosters: row.planned_posters,
  };
}

async function computeActuals(
  cycleId: string,
  supabase: SupabaseClient<Database>
): Promise<{ totalReelsPublished: number; totalPostersPublished: number }> {
  const { data: assets } = await supabase
    .from('content_assets')
    .select('type,status')
    .eq('cycle_id', cycleId)
    .in('status', ['published', 'scheduled']);

  let totalReelsPublished = 0;
  let totalPostersPublished = 0;

  if (assets) {
    for (const asset of assets) {
      if (asset.status === 'published') {
        if (asset.type === 'reel') totalReelsPublished++;
        else if (asset.type === 'poster') totalPostersPublished++;
      }
    }
  }

  return { totalReelsPublished, totalPostersPublished };
}

/**
 * Find the active cycle for a client.
 * Implements lazy auto-activation: if no active cycle exists,
 * checks for upcoming cycles whose start_date has passed and activates them.
 */
export async function getActiveCycleForClientService(
  clientId: string,
  client?: SupabaseClient<Database>
): Promise<ServiceCycle | null> {
  const supabase = client ?? (await createServerSupabaseClient());

  // 1. Check for existing active cycle
  const active = await getActiveCycleForClient(clientId, supabase);
  if (active) return mapCycle(active);

  // 2. Lazy auto-activation: find upcoming cycles whose start_date has passed
  const today = new Date().toISOString().split('T')[0];
  const { data: upcoming } = await supabase
    .from('service_cycles')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'upcoming')
    .lte('start_date', today)
    .order('start_date', { ascending: true })
    .limit(1);

  if (upcoming && upcoming.length > 0) {
    const cycleToActivate = upcoming[0];
    await updateCycle(cycleToActivate.id, { status: 'active' }, supabase);
    return mapCycle({ ...cycleToActivate, status: 'active' as const });
  }

  return null;
}

/**
 * Get all cycles for a client with plan summaries and actual counts.
 */
export async function getCyclesByClientId(
  clientId: string
): Promise<ServiceCycleWithPlan[]> {
  const supabase = await createServerSupabaseClient();
  const cycles = await listCyclesByClientId(clientId, supabase);

  const result: ServiceCycleWithPlan[] = [];

  for (const cycle of cycles) {
    const plans = await listPlansByCycleId(cycle.id, supabase);
    const { totalReelsPublished, totalPostersPublished } = await computeActuals(cycle.id, supabase);

    const totalReelsPlanned = plans.reduce((sum, p) => sum + p.planned_reels, 0);
    const totalPostersPlanned = plans.reduce((sum, p) => sum + p.planned_posters, 0);

    result.push({
      ...mapCycle(cycle),
      plans: plans.map(mapPlanRow),
      totalReelsPlanned,
      totalPostersPlanned,
      totalReelsPublished,
      totalPostersPublished,
    });
  }

  return result;
}

/**
 * Get a single cycle by ID with plan data.
 */
export async function getCycleByIdService(
  cycleId: string
): Promise<ServiceCycleWithPlan | null> {
  const supabase = await createServerSupabaseClient();
  const cycle = await getCycleById(cycleId, supabase);
  if (!cycle) return null;

  const plans = await listPlansByCycleId(cycle.id, supabase);
  const { totalReelsPublished, totalPostersPublished } = await computeActuals(cycle.id, supabase);

  return {
    ...mapCycle(cycle),
    plans: plans.map(mapPlanRow),
    totalReelsPlanned: plans.reduce((sum, p) => sum + p.planned_reels, 0),
    totalPostersPlanned: plans.reduce((sum, p) => sum + p.planned_posters, 0),
    totalReelsPublished,
    totalPostersPublished,
  };
}

/**
 * Create a new service cycle and generate its content plan.
 */
export async function createCycle(input: CreateCycleInput): Promise<ServiceCycle> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  // Determine initial status: 'active' if start_date <= today, 'upcoming' otherwise
  const today = new Date().toISOString().split('T')[0];
  const initialStatus = input.startDate <= today ? 'active' as const : 'upcoming' as const;

  // If creating an active cycle, mark any existing active cycle as completed
  if (initialStatus === 'active') {
    const existingActive = await getActiveCycleForClient(input.clientId, supabase);
    if (existingActive) {
      await updateCycle(existingActive.id, { status: 'completed' }, supabase);
    }
  }

  const cycle = await insertCycle(
    {
      client_id: input.clientId,
      start_date: input.startDate,
      end_date: input.endDate,
      reels_target: input.reelsTarget,
      posters_target: input.postersTarget,
      status: initialStatus,
      created_by: user.id,
    },
    supabase
  );

  // Generate content plan using TypeScript (not SQL RPC)
  await generatePlanForCycle(
    cycle.id,
    input.clientId,
    input.startDate,
    input.endDate,
    input.reelsTarget,
    input.postersTarget,
    supabase
  );

  return mapCycle(cycle);
}

/**
 * Renew: complete current cycle and create a new one.
 */
export async function renewCycle(
  currentCycleId: string,
  input: Omit<CreateCycleInput, 'clientId'>
): Promise<ServiceCycle> {
  const supabase = await createServerSupabaseClient();
  const currentCycle = await getCycleById(currentCycleId, supabase);

  if (!currentCycle) {
    throw new Error('Current cycle not found');
  }

  // Complete the current cycle
  await updateCycle(currentCycleId, { status: 'completed' }, supabase);

  // Create new cycle with same client
  return createCycle({
    clientId: currentCycle.client_id,
    startDate: input.startDate,
    endDate: input.endDate,
    reelsTarget: input.reelsTarget,
    postersTarget: input.postersTarget,
  });
}

/**
 * Cancel a cycle.
 */
export async function cancelCycleService(cycleId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await updateCycle(cycleId, { status: 'cancelled' }, supabase);
}

/**
 * Complete a cycle.
 */
export async function completeCycleService(cycleId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await updateCycle(cycleId, { status: 'completed' }, supabase);
}

/**
 * Update a cycle's deliverables and regenerate its content plan.
 */
export async function updateCycleDeliverables(
  cycleId: string,
  input: {
    startDate?: string;
    endDate?: string;
    reelsTarget?: number;
    postersTarget?: number;
  }
): Promise<ServiceCycle> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const existing = await getCycleById(cycleId, supabase);
  if (!existing) {
    throw new Error('Cycle not found');
  }

  const updates: Record<string, unknown> = {};
  if (input.startDate !== undefined) updates.start_date = input.startDate;
  if (input.endDate !== undefined) updates.end_date = input.endDate;
  if (input.reelsTarget !== undefined) updates.reels_target = input.reelsTarget;
  if (input.postersTarget !== undefined) updates.posters_target = input.postersTarget;

  if (Object.keys(updates).length > 0) {
    await updateCycle(cycleId, updates, supabase);

    // Read the updated cycle to get current values
    const updatedCycle = await getCycleById(cycleId, supabase);
    if (updatedCycle) {
      // Regenerate content plan with updated values
      await generatePlanForCycle(
        cycleId,
        updatedCycle.client_id,
        updatedCycle.start_date,
        updatedCycle.end_date,
        updatedCycle.reels_target,
        updatedCycle.posters_target,
        supabase
      );
    }
  }

  const updated = await getCycleById(cycleId, supabase);
  return mapCycle(updated!);
}

/**
 * Delete a cycle and its plan.
 */
export async function deleteCycleService(cycleId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await deleteCycle(cycleId, supabase);
}
