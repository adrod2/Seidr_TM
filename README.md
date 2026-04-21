# Seidr: AI-Driven Threat Modeling Platform

Seidr is an advanced, AI-powered threat modeling application designed to streamline the process of identifying, analyzing, and mitigating security risks in software architecture. 

By taking natural language descriptions, system diagrams, and repository URLs, Seidr automatically constructs C4 architecture graphs, generates threat catalogs based on standard frameworks (STRIDE, PASTA, MAESTRO), maps compliance gaps, and formulates actionable mitigation plans.

## 🌟 Key Features

- **Multi-Modal Context Ingestion**: Understands your system through text descriptions, architecture diagram uploads (using Vision LLMs), and heuristic repository scans.
- **Automated C4 Architecture Generation**: Automatically parses system context to build an interactive, draggable, and editable Level 1, 2, and 3 C4 architecture graph using React Flow.
- **Intelligent Threat Catalog**: Identifies vulnerabilities, assigns CVSS scores, and explains exploitation paths based on the provided architecture.
- **Interactive Mitigation Kanban Board**: Drag-and-drop tasks to track mitigations. Move tasks to "Exception" with mandatory business justifications.
- **Compliance & Business Risk Mapping**: Automatically evaluates identified threats against required controls (e.g., NIST SP 800-53) and global business risk registers.
- **AI Security Copilot**: Context-aware chat sidebar to interrogate the threat model, draft Jira tickets, or ask for specific mitigation code snippets.
- **Global Knowledge Base (RAG)**: Upload organizational policies and standards in the Admin dashboard to inform the AI's compliance and threat evaluations.
- **Multilingual Exports**: Export reports to PDF, CSV, or JSON. Built-in agentic translation allows exporting the entire threat model in multiple languages (Spanish, German, French, etc.).

## 🛡️ Architecture & Security Pipeline

Seidr is designed with a **local-first** approach for sensitive architecture data.
- **Local Database**: All threat models, context documents, and business risks are stored entirely in your browser using **IndexedDB (via Dexie)**.
- **API Keys**: LLM API keys are stored securely in the local browser database, never hitting a central application backend.
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
  - LLM Providers: OpenAI (GPT-4o), Google (Gemini 1.5 Pro), Anthropic (Claude 3 Haiku), or Local (Ollama - Qwen2.5)
  - Search: Tavily API (for generating real-time mitigation strategies)

## ⚙️ Environment Variables

Create a `.env` file in the root of the project. The following variables are used:

```env
# Optional: Used by the Mitigation Strategist Agent to search the web for modern security practices
VITE_TAVILY_API_KEY=your_tavily_key_here

# Used for caching LLM responses to reduce API costs and improve speed
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

*Note: Your actual LLM API keys (OpenAI, Anthropic, Gemini) are configured directly via the **Administration > AI Models** tab in the UI and stored in your local browser database.*

## 🚀 Getting Started

### 1. Installation

Install the required dependencies:
```bash
npm install
```

### 2. Run the Development Server

Start the Vite development server:
```bash
npm run dev
```

### 3. Initial Configuration
1. Open the application in your browser.
2. Navigate to **Administration** (Settings icon in the sidebar).
3. Go to the **AI Models** tab.
4. Select your preferred provider (OpenAI, Gemini, Claude, or Local Ollama) and input your API key. Click **Save Configuration**.
5. (Optional) In the **System Context** tab, upload any organizational security policies (PDF, DOCX, CSV) to enhance the AI's contextual awareness.

### 4. Create Your First Threat Model
1. Click **New Model** in the sidebar.
2. Give your system a name.
3. Provide a textual description, upload architecture diagrams (PNG/JPG), and attach context files.
4. Select a framework (e.g., STRIDE) and click **Run Analysis**.

## 📁 Project Structure

- `src/components/`: Reusable UI components (shadcn/ui), Layout, and Tab specific components (Admin, Report).
- `src/lib/backend/`: Core logic for the application.
  - `agents.ts`: Specific AI prompts and logic for Diagram Analysis, C4 generation, Threat Modeling, Compliance, and Translation.
  - `llmClient.ts`: Routing logic for connecting to different LLM providers.
  - `orchestrator.ts`: The state machine pipeline that runs the security gates and chains the AI agents together.
  - `securityPipeline.ts`: PII redaction and prompt injection prevention.
- `src/pages/`: Main route views (Dashboard, ModelsList, NewModel, Report, Admin, Instructions).
- `src/lib/db.ts`: Dexie local database schema configuration.

## 🤝 Contributing
Maintain a focus on keeping components under 100 lines where possible, utilizing the `shadcn/ui` design system, and ensuring that any new backend API calls respect the local-first caching and security pipeline rules.