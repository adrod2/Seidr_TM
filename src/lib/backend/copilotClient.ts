export interface CopilotModel {
  id: string;
  name: string;
  vision: boolean;
}

async function requestCopilot(path: string, body?: object) {
  let response: Response;
  try {
    response = await fetch(`/api/copilot/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(210_000),
    });
  } catch (error) {
    throw new Error(`Cannot reach the local Copilot service. Run "pnpm copilot:server". ${
      error instanceof Error ? error.message : 'Connection failed.'
    }`);
  }
  const data = await response.json().catch(() => {
    throw new Error('Copilot service is unavailable. Run "pnpm copilot:server" and use the Seidr Vite server.');
  });
  if (!response.ok) throw new Error(data.error || `Copilot service returned HTTP ${response.status}.`);
  return data;
}

export const getCopilotModels = async (): Promise<CopilotModel[]> => {
  const data = await requestCopilot('status');
  if (!Array.isArray(data.models)) throw new Error('Invalid Copilot service model list.');
  return data.models;
};

export const generateWithCopilot = async (
  systemPrompt: string,
  userPrompt: string,
  format: 'json' | 'text',
  model?: string,
  image?: string,
): Promise<string> => {
  const data = await requestCopilot('generate', { systemPrompt, userPrompt, format, model, image });
  if (typeof data.content !== 'string' || !data.content.trim()) {
    throw new Error('Copilot returned an empty or invalid response.');
  }
  return data.content;
};
