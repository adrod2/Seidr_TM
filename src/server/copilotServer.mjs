import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CopilotClient, ToolSet } from '@github/copilot-sdk';
import { crawlSite, CrawlError } from './crawler.mjs';

const MAX_BODY_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 180_000;
const loginMessage = 'Sign in with the Copilot CLI (copilot login), using an account with Copilot access.';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Copilot request exceeds 15 MiB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON request.');
  }
}

function validateGeneration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Expected a generation request object.');
  }
  for (const key of ['systemPrompt', 'userPrompt']) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 1_000_000) {
      throw new HttpError(400, `${key} must contain between 1 and 1,000,000 characters.`);
    }
  }
  if (!['json', 'text'].includes(body.format)) {
    throw new HttpError(400, 'format must be json or text.');
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 200)) {
    throw new HttpError(400, 'Invalid Copilot model ID.');
  }
  if (body.image !== undefined &&
      (typeof body.image !== 'string' ||
       !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image))) {
    throw new HttpError(400, 'Diagram must be a base64 PNG, JPEG, WebP, or GIF image.');
  }
  return body;
}

export function createCopilotServer({
  client = new CopilotClient({
    mode: 'empty',
    baseDirectory: process.env.COPILOT_HOME || join(homedir(), '.copilot'),
    logLevel: 'error',
  }),
  allowedOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080',
    'http://localhost:4173', 'http://127.0.0.1:4173'],
  timeout = REQUEST_TIMEOUT_MS,
  crawl = crawlSite,
} = {}) {
  let starting;
  let activeRequests = 0;
  let activeCrawls = 0;
  const ready = async () => {
    if (!starting) {
      starting = client.start().catch((error) => {
        starting = undefined;
        throw error;
      });
    }
    await starting;
    if (!(await client.getAuthStatus()).isAuthenticated) throw new HttpError(401, loginMessage);
  };

  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    try {
      const host = request.headers.host?.split(':')[0];
      if (!['localhost', '127.0.0.1'].includes(host) ||
          (request.headers.origin && !allowedOrigins.includes(request.headers.origin))) {
        throw new HttpError(403, 'This service only accepts requests from the local Seidr application.');
      }
      if (request.method === 'GET' && request.url === '/api/copilot/status') {
        await ready();
        const models = await client.listModels();
        send(200, { models: models.map(({ id, name, capabilities }) => ({
          id, name, vision: capabilities.supports.vision,
        })) });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/crawl') {
        const body = await readBody(request);
        if (activeCrawls >= 2) throw new HttpError(429, 'A crawl is already running. Try again shortly.');
        activeCrawls++;
        try {
          send(200, await crawl(body?.url));
        } catch (error) {
          if (error instanceof CrawlError) throw new HttpError(error.status, error.message);
          throw new HttpError(502, `Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          activeCrawls--;
        }
        return;
      }
      if (request.method !== 'POST' || request.url !== '/api/copilot/generate') {
        throw new HttpError(404, 'Unknown Copilot service route.');
      }
      const body = validateGeneration(await readBody(request));
      if (activeRequests >= 16) throw new HttpError(429, 'Copilot is busy. Wait for the current analysis to finish.');
      activeRequests++;
      let content;
      let completed = false;
      try {
        await ready();
        let model = body.model?.trim() || undefined;
        if (body.image || model) {
          const models = await client.listModels();
          const selected = model ? models.find((item) => item.id === model)
            : models.find((item) => item.capabilities.supports.vision);
          if (!selected) throw new HttpError(400, 'No matching Copilot model is available for this account.');
          if (body.image && !selected.capabilities.supports.vision) {
            throw new HttpError(400, 'The selected Copilot model does not support images. Choose a vision-capable model.');
          }
          model = selected.id;
        }
        const session = await client.createSession({
          model,
          clientName: 'Seidr',
          systemMessage: { mode: 'replace', content: `${body.systemPrompt}\n\n${
            body.format === 'json'
              ? 'Return only valid JSON (an object or array as requested), with no Markdown fences or commentary.'
              : 'Return the requested text directly, not JSON.'
          }` },
          availableTools: [],
          excludedTools: new ToolSet().addBuiltIn('*').addMcp('*').addCustom('*').toArray(),
          onPermissionRequest: () => ({ kind: 'denied-no-approval-rule-and-could-not-request-from-user' }),
          enableConfigDiscovery: false,
          infiniteSessions: { enabled: false },
        });
        try {
          const attachments = body.image ? [{
            type: 'blob',
            mimeType: body.image.slice(5, body.image.indexOf(';')),
            data: body.image.slice(body.image.indexOf(',') + 1),
            displayName: 'architecture-diagram',
          }] : undefined;
          const result = await session.sendAndWait({ prompt: body.userPrompt, attachments }, timeout);
          if (!result?.data.content?.trim()) throw new HttpError(502, 'Copilot returned an empty response.');
          content = result.data.content;
          completed = true;
        } finally {
          // A timed-out turn must not continue consuming quota after the request ends.
          try {
            if (!completed) await session.abort();
          } finally {
            await session.disconnect();
          }
        }
        send(200, { content });
      } finally {
        activeRequests--;
      }
    } catch (error) {
      if (!response.headersSent) {
        send(error instanceof HttpError ? error.status : 502, {
          error: error instanceof HttpError ? error.message
            : `Copilot service failed: ${error instanceof Error ? error.message : 'Unknown error'}. ${loginMessage}`,
        });
      } else {
        console.error('Copilot session cleanup failed:', error);
      }
    }
  });
  server.requestTimeout = 30_000;
  server.on('close', () => {
    client.stop().catch((error) => console.error('Failed to stop Copilot runtime:', error));
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SEIDR_COPILOT_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SEIDR_COPILOT_PORT.');
  const server = createCopilotServer();
  server.on('error', (error) => {
    console.error('Copilot service could not start:', error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Seidr Copilot service listening on http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close());
  }
}
