import { z } from 'zod';

const statusSchema = z.object({
  connected: z.literal(true), login: z.string().min(1), scopes: z.array(z.string()),
});
const repositorySchema = z.object({
  fullName: z.string().regex(/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i),
  url: z.string().url(), private: z.boolean(), description: z.string(),
}).refine(repo => repo.url === `https://github.com/${repo.fullName}`);
const repositoryPageSchema = z.object({
  repositories: z.array(repositorySchema), page: z.number().int().min(1).max(10000), hasMore: z.boolean(),
});
const errorSchema = z.object({ error: z.string().min(1) });

export type GitHubStatus = z.infer<typeof statusSchema>;
export type GitHubRepository = z.infer<typeof repositorySchema>;
export type GitHubRepositoryPage = z.infer<typeof repositoryPageSchema>;

async function request(path: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/github/${path}`, {
      headers: { 'X-Seidr-Client': '1' }, signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Cannot reach the local GitHub integration. Start pnpm copilot:server and use the Seidr Vite server.');
  }
  return response;
}

async function readJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => {
    throw new Error('GitHub integration is unavailable. Restart pnpm copilot:server and use the Seidr Vite server.');
  });
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    throw new Error(error.success ? error.data.error : `GitHub integration returned HTTP ${response.status}.`);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new Error('GitHub integration returned an invalid response. Restart the local service and retry.');
  return result.data;
}

export const getGitHubStatus = async (): Promise<GitHubStatus> =>
  readJson(await request('status'), statusSchema);

export const listGitHubRepositories = async (page = 1): Promise<GitHubRepositoryPage> =>
  readJson(await request(`repositories?page=${page}`), repositoryPageSchema);

/** The local service authenticates and permits only read-only GitHub repository resources. */
export const fetchGitHubResource = async (url: string): Promise<Response> =>
  request(`resource?url=${encodeURIComponent(url)}`);
