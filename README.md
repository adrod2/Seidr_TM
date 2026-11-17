# Seidr: AI-Driven Threat Modeling Platform

Seidr is an advanced, AI-powered threat modeling application designed to streamline the process of identifying, analyzing, and mitigating security risks in software architecture. 

By taking natural language descriptions, system diagrams, and repository URLs, Seidr automatically constructs C4 architecture graphs, generates threat catalogs based on standard frameworks (STRIDE, PASTA, MAESTRO) or Hybrid TM, maps compliance gaps, and formulates actionable mitigation plans.

## 🌟 Key Features

- **Multi-Modal Context Ingestion**: Understands your system through text descriptions, architecture diagram uploads (using Vision LLMs), and heuristic repository scans.
- **Multiple Code Repositories**: Use **Add Repository** in New Model > Repositories to include several repositories in one assessment. Blank rows and duplicate URLs are ignored. Up to three repository analyses run concurrently; each successful analysis is labelled in the shared architecture and threat context. Findings and scanned files retain their repository source, while failures appear separately under Inputs Analysed. GitHub URLs support file scanning; other providers supply URL-based context only. Older single-repository reports remain supported.
- **Authenticated GitHub Access**: Check the real GitHub connection in **Administration > Integrations** or **New Model > Repositories**, then browse and add accessible public/private repositories. The local service reuses the active `gh` account on `github.com`; no token reaches the frontend. Repository metadata, documentation and source files all use authenticated, read-only GitHub REST endpoints, including private file content through the Contents API.
- **Redo Threat Model**: Open a completed report and select **Redo Threat Model** to open an editable new assessment with its original description, methodology, repository URLs, reference URL, document text, diagram analyses and original attachments prefilled. Modify/remove/replace inputs or choose another methodology, then run to create a separate model. Repository and website context is fetched again. The original report is never overwritten. Older reports without saved input snapshots can recover only retained text/URLs and show an explicit warning to reattach original files.
- **Two-Dimensional Repository Analysis**: Static code/configuration/dependency review (SAST/SCA) runs alongside metadata and documentation collection. GitHub repository metadata (including topics, description, homepage, license and timestamps), language statistics, latest release notes, README, SECURITY, architecture/design decisions, API documentation and other text docs become separately labelled sources in both C4 and final threat-analysis context. These sources survive empty code findings or a failed code-analysis agent. Long sources use the document digest agent. Documentation is collected independently of the 15-file static-code sample: up to 60 text files, 100,000 characters per file and 600,000 characters total per repository (distributed fairly), with four simultaneous file downloads. Truncation, exclusions, unavailable sources, API limits and incomplete file trees are reported. This does **not** run DAST against a live application. Default-branch text files and the latest release are in scope; external documentation links, wiki/issues, older releases and binary files are not crawled. Attach binary documents using Supporting Documents.
- **Full Supporting-Document Analysis**: Attachments are parsed in the browser: PDF (pdf.js, with vision OCR for scanned pages), Word (.docx via mammoth, best-effort .doc), Excel/ODS (SheetJS, every sheet), images (OCR), and text formats (CSV, Markdown, JSON/YAML, Terraform, logs, etc.). Every input (description, diagrams, documents, website briefing, repository analysis, knowledge base) is sanitised on its own and added to the threat agent's context as a labelled section with a fair size budget. Long documents are condensed by a Document Digest agent, so no single input can crowd out the rest. A suspicious input is excluded instead of aborting the run. The report's **Inputs Analysed** table shows the status of each input and how many characters were used.
- **Reference URL Spider**: Optionally provide a public URL; a server-side crawler fetches up to 25 same-site pages (depth 2, 60 s budget, robots.txt honoured, `security.txt`/security/privacy/trust pages seeded) and a Web Documentation agent turns the security, privacy, and architecture content into a cited briefing appended to the analysis context. Private, loopback, and link-local addresses are blocked on every DNS resolution and redirect (SSRF protection), and crawled pages pass the PII and prompt-injection gates.
- **System Description Summary**: The Assessment Scope & Knowledge Base card summarises the textual system description used for the analysis, with key security highlights.
- **Interactive C4 Threat Map**: One editable Level 1/2/3 graph connects findings to affected components and data flows. Click a severity-labelled threat arrow to open the expanded finding, or inspect a component/flow to explore all linked threats. Filter by severity, locate targets across levels, and cycle six non-overlapping layouts. Unmapped findings remain visible without guessed links. Static PDF diagrams remain available.
- **Intelligent Threat Catalog**: Identifies vulnerabilities, assigns CVSS scores, and explains exploitation paths based on the provided architecture.
- **Hybrid TM**: Select Hybrid TM in New Model to combine STRIDE security, LINDDUN privacy and PASTA business-risk analysis. The threat agent loads `src/lib/backend/hybrid-method.md` directly into its prompt, adapting the protocol's example stack to your actual system. Findings include business impact and mapped controls in their descriptions, and attack paths plus DREAD risk scoring in their reasoning. Existing CVSS scores and report workflows remain unchanged.
- **Evidence & Risk Review**: Review canonical scenarios, exact source quotes/lines, confidence, confirmed ownership, controls and complete treatment actions. Each action records dependencies, an acceptance test, expected evidence and remaining risk. Closure requires passing retained verification for the assessed environment; acceptance is a separate, owned, expiring decision, never mitigation. Original observations and exact-scenario merge reasons remain in the register. Unverified scenarios receive an explicit verification request.
- **Separate Business and Technical Risk**: New assessments start **Review required**, with unrated business risk. An owner-approved, versioned 5-by-5 likelihood/impact rubric uses Low 1-5, Medium 6-11, High 12-19 and Critical 20-25. Unknown is never low; inherent, current and conditional target ratings remain separate. CVSS and DREAD never feed this matrix. Historical scores and old mitigation notes remain explicitly unverified.
- **Proposed Compliance Mappings**: AI-suggested relationships to required controls (for example NIST SP 800-53) need human review. Organizational business risks and obligations are supplied to analysis independently of policies. Empty mappings do not establish compliance; no control totals or completed integrations are invented.
- **AI Security Copilot**: Context-aware chat sidebar to interrogate the threat model, draft Jira tickets, or ask for specific mitigation code snippets.
- **Global Knowledge Base (RAG)**: Upload organizational policies and standards in the Admin dashboard to inform the AI's compliance and threat evaluations.
- **Multilingual Exports**: Translate technical report narrative into Spanish, German, French and other supported languages. Decision records, exact evidence, owner names and identifiers remain unchanged; the structured quality appendix currently retains its English labels and source wording.
- **Complete, Prioritized Reports**: PDF exports include an executive findings summary, a linked severity-ranked index, a landscape component-level C4 diagram with full component/relationship registers, detailed finding pages, compliance mappings and input coverage. Each finding retains its ID/title, methodology/category, affected component names/IDs, severity, CVSS estimate, evidence, attack path, exploitation-risk assessment, all mitigation actions and treatment status/justification. Hybrid findings also display structured DREAD dimensions and their independently calculated mean; legacy DREAD text remains in the attack path. CVSS measures severity, not exploitation probability. Missing legacy evidence, risk assessments or component detail are explicitly marked, never invented. CSV includes the complete ranked finding fields; JSON preserves the report data. PDF generation waits for the diagram and fonts before opening the browser's **Save as PDF** dialog; disable browser headers/footers for the cleanest result. Translation preserves canonical identifiers, scores, categories, severities and architecture so prioritization and coverage remain intact.

Context budgets account for section headings, source labels, and truncation markers; **Inputs Analysed** counts only source characters retained, not those labels or markers. Document-digest requests share a limit of three simultaneous calls across documents, and each upload batch processes at most three files at once. Image-analysis cache keys hash the complete image (plus the source label for OCR), preventing different images with similar file headers from sharing results.

### Evidence and review limitations

GitHub trees and file reads use one immutable commit SHA; live repository metadata and release information remain collection-time snapshots. Sanitized original extracted text, sampled code and crawled page text are retained locally alongside generated digests, with SHA-256 text hashes, versions and parent-source links. Original attachment bytes have separate recorded hashes. OCR and vision remain generated interpretations. Bounded, deterministic retrieval supplies located primary excerpts beyond digests; retrieval or a matching quote does not prove deployment effectiveness.

In **Evidence & Risk Review**, confirm the environment, version and scope, approve the business rubric, inspect located sources, assign owners and record ratings/actions. Add actual verification output under **Retained sources & verification artifacts**, select it for each passing test, then record an owned decision. Save scope/scenario/treatment changes before a fresh review: they invalidate previous ratings and verification. Semantic diagram edits also invalidate review; position-only changes do not. Stale concurrent saves are rejected and previous revisions are retained. Unsaved review drafts warn before navigation and cannot be exported as saved decisions.

These are **local self-attestations**, not authenticated approvals, independent exploit verification or tamper-proof audit records. All assessments remain Review required. Architecture inventory starts Not assessed; comprehensive automated coverage/conflict/specialist analysis, a system-level release decision, full backup/import recovery and commercial comparative evaluation are not yet delivered. Protect/back up your browser profile before upgrading; an ordinary report export is not a full database/attachment backup.

New JSON exports use `seidr-assessment-v1`; their published structural schema is `/schemas/assessment-v1.schema.json`. Run `pnpm run schema:assessment` after changing contracts. Runtime checks additionally enforce canonical IDs and source-manifest/lineage completeness. Source text and original attachments are excluded from routine exports; evidence quotes and metadata remain sensitive. Legacy exports are labelled `legacy-unverified-v0`.

## 🛡️ Architecture & Security Pipeline

Seidr is designed with a **local-first** approach for sensitive architecture data.
- **Local Database**: All threat models, context documents, and business risks are stored entirely in your browser using **IndexedDB (via Dexie)**.
- **Original Inputs and Cache**: New assessments also save original form text (before redaction), document/image blobs, extraction results and vision analyses in a separate local input snapshot for reassessment. Protect access to this browser profile; it is not an encrypted vault. Report exports and translations do not include these private snapshots. Agent-result caching is local too, expires for reuse after seven days, and no longer sends results to Supabase. Deleting a report removes its snapshot/attachments; Delete All Models also clears the local agent cache. Old remote caches, if previously configured, are not automatically deleted.
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
- **Backend / Cache**: Local Node.js service and IndexedDB agent-result cache
- **AI Integrations**: 
  - Default: GitHub Copilot via the official Copilot SDK and local Node.js service
  - Optional providers: OpenAI, Google Gemini, Anthropic Claude, or local Ollama

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in the root of the project. The following variables are used:

```env
# Local Copilot service port (server-side only; default 3001)
SEIDR_COPILOT_PORT=3001

```

*Copilot uses your existing CLI login. Never put GitHub credentials in a `VITE_` environment variable: Vite embeds those variables in browser assets. Optional legacy provider keys are configured in **Administration > AI Models** and stored in your browser database.*
The former `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` cache settings are no longer used.

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

For repository access, install [GitHub CLI](https://cli.github.com/) and sign in separately:
```bash
gh auth login --hostname github.com --web
```
The Copilot login alone does not grant GitHub repository access. Use an account/token authorized for the target repositories: classic tokens need `repo` for private repositories; fine-grained tokens need the selected repositories plus **Metadata: Read** and **Contents: Read**. Organization policies and SSO (single sign-on) approval may restrict access. Seidr does not request write operations or change your CLI sign-in. Switch CLI accounts with `gh auth switch --hostname github.com`, then use **Check Connection** again.

In one terminal, start the local Copilot service:
```bash
pnpm copilot:server
```

In another terminal, start the frontend:
```bash
pnpm dev
```

Open `http://127.0.0.1:8080`. Vite proxies `/api/copilot`, `/api/crawl` and `/api/github` to `127.0.0.1:3001` (or `SEIDR_COPILOT_PORT`). Both services bind to loopback only; do not expose this single-user bridge as a public or multi-user API. GitHub routes accept only application-header-protected, same-origin read requests; arbitrary remote URLs, write operations and upstream redirects are refused.

### 3. Initial Configuration
1. Open the application in your browser.
2. Navigate to **Administration** (Settings icon in the sidebar).
3. Go to the **AI Models** tab.
4. **GitHub Copilot** is selected for new installations. Click **Test Connection** to verify authentication and load available model IDs, then **Save Configuration**. Leave the model blank to use Copilot's text default and automatically select a vision-capable model for diagrams, or choose an explicit model ID (must support vision for image uploads). Copilot's connection test checks authentication and model access without generating a response. Legacy providers remain selectable; their connection test sends a small real prompt.
5. (Optional) In the **System Context** tab, upload any organizational security policies (PDF, DOCX, CSV) to enhance the AI's contextual awareness.
6. In **Integrations**, use **Check Connection** under GitHub. Under **New Model > Repositories**, browse your accessible repositories or paste URLs. Access failures, organization restrictions and API limits are reported explicitly.

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
pnpm test           # Bridges, crawler, C4, ingestion, redo, quality contracts and exports
pnpm test:copilot   # Copilot bridge and URL crawler only
```

The crawler tests run against a local test server. The Copilot tests use a fake SDK client; they cover authentication failures, model selection, vision attachments, structured and text outputs, parallel mitigations, tool restrictions, and browser transport errors without spending Copilot quota.
Input-processing tests cover exact context limits, per-source character counts, shared sanitization/document summaries, bounded digest failure recovery, ordered concurrent jobs, complete-image hashing, and document extraction. GitHub tests cover read-only access, private file transport, access failures and malformed responses. Redo tests preserve original attachments and isolate editable copies; cache tests prevent remote storage of private analysis. Hybrid prompt tests confirm the bundled protocol is loaded only for Hybrid TM.
Report-export tests cover severity ordering, complete multiline CSV fields and mitigation lists, spreadsheet-formula protection, separate DREAD/CVSS scoring, component-level architecture selection, legacy gaps and translation without lost evidence or changed identifiers/scores.
Quality tests cover exact source references, late-line primary retrieval, unknown risk, conservative scenario identity/reconciliation, stale-review invalidation, proof requirements and generated JSON-schema consistency. Mocked tests do not establish AI accuracy or commercial superiority.

## 📁 Project Structure

- `src/components/`: Reusable UI components (shadcn/ui), Layout, and Tab specific components (Admin, Report).
- `src/lib/backend/`: Core logic for the application.
  - `agents.ts`: Specific AI prompts and logic for Diagram Analysis, C4 generation, Threat Modeling, Compliance, and Translation.
  - `llmClient.ts`: Routing logic for connecting to different LLM providers.
  - `copilotClient.ts`: Same-origin browser transport to the local Copilot service.
  - `githubClient.ts`: Validated GitHub connection/repository responses and credential-free browser transport.
  - `orchestrator.ts`: The state machine pipeline that runs the security gates and chains the AI agents together.
  - `documentExtractor.ts`: Browser-side PDF/DOCX/XLSX/text extraction with OCR fallback.
  - `documentContext.ts`: Shared sanitization, document summaries and bounded fallback for uploads and repository sources.
  - `modelInputs.ts`: Analysis input contracts, original attachment snapshots and editable/legacy redo recovery.
  - `repositoryInputs.ts`: Shared repository URL parsing, bounded multi-repository analysis and per-source context.
  - `analysisContext.ts`: Per-input sanitisation, context budgeting and labelled context assembly.
  - `asyncUtils.ts`: Ordered batch processing and shared concurrency limits.
  - `inputUtils.ts`: File reading, input hashing, unreadable-document detection and error messages.
  - `threatModelPrompt.ts` / `hybrid-method.md`: Framework-aware threat prompt and the bundled Hybrid protocol.
  - `securityPipeline.ts`: PII redaction and prompt injection prevention.
- `src/pages/`: Main route views (Dashboard, ModelsList, NewModel, Report, Admin, Instructions).
- `src/lib/db.ts`: Dexie local database schema configuration.
- `src/server/copilotServer.mjs`: Local Copilot SDK bridge with authentication/model checks and inference-only sessions; also serves `/api/crawl` and `/api/github`.
- `src/server/github.mjs`: Read-only GitHub access using local CLI credentials, an endpoint allowlist and bounded responses.
- `src/server/crawler.mjs`: SSRF-safe reference URL spider.
- `src/lib/c4Layout.ts` / `src/lib/c4Model.ts`: C4 auto-layout engine (ELK) and C4 element/Mermaid generation.

## 🤝 Contributing
Maintain a focus on keeping components under 100 lines where possible, utilizing the `shadcn/ui` design system, and ensuring that any new backend API calls respect the local-first caching and security pipeline rules.