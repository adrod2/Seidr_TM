# Seidr: AI-Driven Threat Modeling Platform

Seidr is an advanced, AI-powered threat modeling application designed to streamline the process of identifying, analyzing, and mitigating security risks in software architecture. 

By taking natural language descriptions, system diagrams, and repository URLs, Seidr automatically constructs C4 architecture graphs, generates threat catalogs based on standard frameworks (STRIDE, PASTA, MAESTRO), maps compliance gaps, and formulates actionable mitigation plans.

## 🌟 Key Features

- **Multi-Modal Context Ingestion**: Understands your system through text descriptions, architecture diagram uploads (using Vision LLMs), and heuristic repository scans.
- **Full Supporting-Document Analysis**: Attachments are parsed in the browser: PDF (pdf.js, with vision OCR for scanned pages), Word (.docx via mammoth, best-effort .doc), Excel/ODS (SheetJS, every sheet), images (OCR), and text formats (CSV, Markdown, JSON/YAML, Terraform, logs, etc.). Every input (description, diagrams, documents, website briefing, repository analysis, knowledge base) is sanitised on its own and added to the threat agent's context as a labelled section with a fair size budget. Long documents are condensed by a Document Digest agent, so no single input can crowd out the rest. A suspicious input is excluded instead of aborting the run. The report's **Inputs Analysed** table shows the status of each input and how many characters were used.
- **Reference URL Spider**: Optionally provide a public URL; a server-side crawler fetches up to 25 same-site pages (depth 2, 60 s budget, robots.txt honoured, `security.txt`/security/privacy/trust pages seeded) and a Web Documentation agent turns the security, privacy, and architecture content into a cited briefing appended to the analysis context. Private, loopback, and link-local addresses are blocked on every DNS resolution and redirect (SSRF protection), and crawled pages pass the PII and prompt-injection gates.
- **System Description Summary**: The Assessment Scope & Knowledge Base card summarises the textual system description used for the analysis, with key security highlights.
- **Automated C4 Architecture Generation**: Builds editable Level 1, 2, and 3 C4 diagrams in standard C4 notation (people, systems, containers, databases, external systems, system boundary). Auto Layout cycles through six non-overlapping ELK-based arrangements, and a Mermaid view produces a publication-ready diagram with SVG/PNG export.
- **Intelligent Threat Catalog**: Identifies vulnerabilities, assigns CVSS scores, and explains exploitation paths based on the provided architecture.
- **Interactive Mitigation Kanban Board**: Drag-and-drop tasks to track mitigations. Move tasks to "Exception" with mandatory business justifications.
- **Compliance & Business Risk Mapping**: Automatically evaluates identified threats against required controls (e.g., NIST SP 800-53) and global business risk registers.
- **AI Security Copilot**: Context-aware chat sidebar to interrogate the threat model, draft Jira tickets, or ask for specific mitigation code snippets.
- **Global Knowledge Base (RAG)**: Upload organizational policies and standards in the Admin dashboard to inform the AI's compliance and threat evaluations.
- **Multilingual Exports**: Export reports to PDF, CSV, or JSON. Built-in agentic translation allows exporting the entire threat model in multiple languages (Spanish, German, French, etc.).

## 🛡️ Architecture & Security Pipeline

Seidr is designed with a **local-first** approach for sensitive architecture data.
- **Local Database**: All threat models, context documents, and business risks are stored entirely in your browser using **IndexedDB (via Dexie)**.
- **Credentials**: GitHub Copilot uses the local Copilot runtime's login; no GitHub token is sent to or stored in the browser. Optional legacy providers still store API keys in IndexedDB (not an encrypted secret store).
- **Copilot Service**: A localhost-only Node.js bridge uses the official `@github/copilot-sdk`. Agent prompts and diagrams are sent through Copilot to the selected model; local-first storage does not mean offline inference. Copilot may retain session history under `COPILOT_HOME` (defaults to your home directory's `.copilot` folder). Coding tools and automatic configuration discovery are disabled for these inference sessions.
- **3-Gate Security Pipeline**: Before input hits the LLM, it passes through:
  1. *Structural Validation*: Prevents payload bloat.
  2. *PII Redaction*: Automatically strips emails and public IP addresses.
  3. *Prompt Injection Shield*: Scans for known jailbreak patterns (`ignore previous instructions`).

## 🛠️ Tech Stack

- **Frontend Framework**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, `shadcn/ui` components
- **State & Local Storage**: Dexie.js (IndexedDB)
- **Diagrams & Graphs**: `@xyflow/react` (React Flow)
- **Data Visualization**: Recharts
- **Icons**: Lucide React
- **Backend / Cache**: Supabase (used strictly for hashed LLM result caching)
- **AI Integrations**: 
  - Default: GitHub Copilot via the official Copilot SDK and local Node.js service
  - Optional providers: OpenAI, Google Gemini, Anthropic Claude, or local Ollama
  - Search: Tavily API (for generating real-time mitigation strategies)

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in the root of the project. The following variables are used:

```env
# Local Copilot service port (server-side only; default 3001)
SEIDR_COPILOT_PORT=3001

# Optional: Used by the Mitigation Strategist Agent to search the web for modern security practices
VITE_TAVILY_API_KEY=your_tavily_key_here

# Used for caching LLM responses to reduce API costs and improve speed
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

*Copilot uses your existing CLI login. Never put GitHub credentials in a `VITE_` environment variable: Vite embeds those variables in browser assets. Optional legacy provider keys are configured in **Administration > AI Models** and stored in your browser database.*

## 🚀 Getting Started

### 1. Installation

Use Node.js 22.18+ and pnpm. Install dependencies using the checked-in lockfile:
```bash
pnpm install --frozen-lockfile
```

### 2. Authenticate and Start Both Services

Install the [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli) if needed, then sign in with an account that has Copilot access:
```bash
copilot login
```

The SDK includes its own matching runtime; the standalone CLI is used here to establish your login. Model availability, organization policies, and Copilot usage limits apply.

In one terminal, start the local Copilot service:
```bash
pnpm copilot:server
```

In another terminal, start the frontend:
```bash
pnpm dev
```

Open `http://127.0.0.1:8080`. Vite proxies `/api/copilot` to `127.0.0.1:3001` (or `SEIDR_COPILOT_PORT`). Both services bind to loopback only; do not expose this single-user bridge as a public or multi-user API.

### 3. Initial Configuration
1. Open the application in your browser.
2. Navigate to **Administration** (Settings icon in the sidebar).
3. Go to the **AI Models** tab.
4. **GitHub Copilot** is selected for new installations. Click **Test Connection** to verify authentication and load available model IDs, then **Save Configuration**. Leave the model blank to use Copilot's text default and automatically select a vision-capable model for diagrams, or choose an explicit model ID (must support vision for image uploads). Copilot's connection test checks authentication and model access without generating a response. Legacy providers remain selectable; their connection test sends a small real prompt.
5. (Optional) In the **System Context** tab, upload any organizational security policies (PDF, DOCX, CSV) to enhance the AI's contextual awareness.

Existing configured providers are preserved during upgrade. Unconfigured OpenAI defaults migrate to Copilot; existing users can switch explicitly in **AI Models**. Agent caches are namespaced by provider and Copilot model so switching does not reuse another provider's results.

### 4. Create Your First Threat Model
1. Click **New Model** in the sidebar.
2. Give your system a name.
3. Provide a textual description, optionally a reference URL (click **Scan Now** to preview what the spider found), upload architecture diagrams (PNG/JPG), and attach context files.
4. Select a framework (e.g., STRIDE) and click **Run Analysis**.

### Production Preview and Deployment

`pnpm build` followed by `pnpm preview` serves the built frontend on `http://127.0.0.1:4173` with the same proxy; keep `pnpm copilot:server` running in another terminal.

A static-only deployment (including the existing Vercel configuration) cannot run the Copilot integration. A hosted deployment needs a separately secured backend with per-user authentication and Copilot credentials; do not deploy this local bridge publicly or embed a shared GitHub token in the frontend.

### Tests

```bash
pnpm test           # everything below plus C4 layout and Mermaid generation
pnpm test:copilot   # Copilot bridge and URL crawler only
```

The crawler tests run against a local test server. The Copilot tests use a fake SDK client; they cover authentication failures, model selection, vision attachments, structured and text outputs, parallel mitigations, tool restrictions, and browser transport errors without spending Copilot quota.

## 📁 Project Structure

- `src/components/`: Reusable UI components (shadcn/ui), Layout, and Tab specific components (Admin, Report).
- `src/lib/backend/`: Core logic for the application.
  - `agents.ts`: Specific AI prompts and logic for Diagram Analysis, C4 generation, Threat Modeling, Compliance, and Translation.
  - `llmClient.ts`: Routing logic for connecting to different LLM providers.
  - `copilotClient.ts`: Same-origin browser transport to the local Copilot service.
  - `orchestrator.ts`: The state machine pipeline that runs the security gates and chains the AI agents together.
  - `documentExtractor.ts`: Browser-side PDF/DOCX/XLSX/text extraction with OCR fallback.
  - `analysisContext.ts`: Per-input sanitisation, context budgeting and labelled context assembly.
  - `securityPipeline.ts`: PII redaction and prompt injection prevention.
- `src/pages/`: Main route views (Dashboard, ModelsList, NewModel, Report, Admin, Instructions).
- `src/lib/db.ts`: Dexie local database schema configuration.
- `src/server/copilotServer.mjs`: Local Copilot SDK bridge with authentication/model checks and inference-only sessions; also serves `/api/crawl`.
- `src/server/crawler.mjs`: SSRF-safe reference URL spider.
- `src/lib/c4Layout.ts` / `src/lib/c4Model.ts`: C4 auto-layout engine (ELK) and C4 element/Mermaid generation.

## 🤝 Contributing
Maintain a focus on keeping components under 100 lines where possible, utilizing the `shadcn/ui` design system, and ensuring that any new backend API calls respect the local-first caching and security pipeline rules.