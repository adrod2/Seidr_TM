export interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  score: number;
  text: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: CrawledPage[];
  attempted: number;
  errors: string[];
}

export const crawlUrl = async (url: string): Promise<CrawlResult> => {
  let response: Response;
  try {
    response = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw new Error(`Cannot reach the local crawl service. Run "pnpm copilot:server". ${
      error instanceof Error ? error.message : 'Connection failed.'
    }`);
  }
  const data = await response.json().catch(() => {
    throw new Error('Crawl service is unavailable. Run "pnpm copilot:server" and use the Seidr Vite server.');
  });
  if (!response.ok) throw new Error(data.error || `Crawl service returned HTTP ${response.status}.`);
  if (!Array.isArray(data.pages)) throw new Error('Invalid crawl response.');
  return data;
};
