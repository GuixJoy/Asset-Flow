import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type AssetType = Database['public']['Enums']['asset_type'];

const TYPE_PREFIX: Record<AssetType, string> = {
  reel: 'R',
  poster: 'P',
};

const MONTH_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Get the next monotonic asset number for a cycle+type.
 * Race-safe: uses the assign_asset_number RPC which atomically increments a counter.
 * Numbers are never reused, even after asset deletion.
 */
export async function getNextAssetNumber(
  cycleId: string,
  assetType: AssetType
): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('assign_asset_number', {
    p_cycle_id: cycleId,
    p_asset_type: assetType,
  });

  if (error) {
    throw new Error(`Failed to assign asset number: ${error.message}`);
  }

  return data as number;
}

/**
 * Generate a smart asset title.
 * Format: {ClientShortForm}_{MonthAbbrev}_{TypePrefix}{Number}
 * Example: FS_Jul_R04
 */
export function generateAssetTitle(
  clientShortForm: string,
  cycleStartDate: string,
  assetType: AssetType,
  number: number
): string {
  const date = new Date(cycleStartDate);
  const monthAbbrev = MONTH_ABBREV[date.getMonth()];
  const prefix = TYPE_PREFIX[assetType];
  const paddedNumber = String(number).padStart(2, '0');

  return `${clientShortForm}_${monthAbbrev}_${prefix}${paddedNumber}`;
}

/**
 * Extract a short form from a client name.
 * "FlySeas" → "FS", "Blue Horizon" → "BH"
 */
export function extractClientShortForm(clientName: string): string {
  const words = clientName.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .map((w) => w.charAt(0))
    .join('')
    .substring(0, 3)
    .toUpperCase();
}
