import { db } from '../db.ts';

const cacheKey = async (agentName: string, inputHash: string) => {
  const config = await db.aiConfig.get('default');
  const provider = config?.provider || 'unconfigured';
  const model = provider === 'copilot' ? config?.copilotModel?.trim() || 'default' : '';
  return `${provider}_${model}_${agentName}_${inputHash}`;
};

/**
 * Analysis results may contain private repository context; keep them on this device.
 */
export const getCachedResult = async <T>(agentName: string, inputHash: string): Promise<T | null> => {
  try {
    const data = await db.agentResults.get(await cacheKey(agentName, inputHash));
    if (!data || data.expiresAt <= Date.now()) return null;
    return data.result as T;
  } catch (err) {
    console.warn('Cache read failed (using bypass)', err);
    return null;
  }
};

/**
 * Saves an agent's result locally. Default expiry is 7 days.
 */
export const setCachedResult = async (agentName: string, inputHash: string, result: unknown, daysToLive = 7): Promise<void> => {
  try {
    await db.agentResults.put({
      key: await cacheKey(agentName, inputHash),
      result,
      expiresAt: Date.now() + daysToLive * 24 * 60 * 60 * 1000,
    });
  } catch (err) {
    console.warn('Cache write failed (ignoring)', err);
  }
};