import { supabase } from '../supabase';
import { db } from '../db';

const cacheKey = async (agentName: string, inputHash: string) => {
  const config = await db.aiConfig.get('default');
  const provider = config?.provider || 'unconfigured';
  const model = provider === 'copilot' ? config?.copilotModel?.trim() || 'default' : '';
  return `${provider}_${model}_${agentName}_${inputHash}`;
};

/**
 * Checks Supabase for a cached agent result.
 */
export const getCachedResult = async <T>(agentName: string, inputHash: string): Promise<T | null> => {
  try {
    const { data, error } = await supabase
      .from('agent_result_cache')
      .select('result')
      .eq('hash_key', await cacheKey(agentName, inputHash))
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.result as T;
  } catch (err) {
    console.warn('Cache read failed (using bypass)', err);
    return null;
  }
};

/**
 * Saves an agent's result to the cache. Default expiry is 7 days.
 */
export const setCachedResult = async (agentName: string, inputHash: string, result: unknown, daysToLive = 7): Promise<void> => {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToLive);

    await supabase.from('agent_result_cache').upsert({
      hash_key: await cacheKey(agentName, inputHash),
      agent_name: agentName,
      result: result,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.warn('Cache write failed (ignoring)', err);
  }
};