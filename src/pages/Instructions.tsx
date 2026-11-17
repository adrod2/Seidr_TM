import React from 'react';
import { 
  PlusCircle, 
  FileText, 
  Image as ImageIcon, 
  Github, 
  Play, 
  ShieldAlert, 
  GitMerge, 
  CheckSquare, 
  FileCheck, 
  Download,
  BookOpen,
  Info
} from 'lucide-react';

export const Instructions = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          Platform Instructions
        </h2>
        <p className="text-muted-foreground mt-2">
          A comprehensive guide on how to generate AI-driven threat models and interpret the resulting security reports.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          To use GitHub Copilot, sign in with <code>copilot login</code> and start <code>pnpm copilot:server</code> in a
          separate terminal. In <strong>Administration &gt; AI Models</strong>, select <strong>GitHub Copilot</strong>,
          test the connection, and save. Diagram uploads require a vision-capable model.
        </p>
      </div>

      {/* Part 1: Creating a New Model */}
      <section className="bg-card border border-border/50 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 border-b border-border/50 pb-4 flex items-center gap-2">
          <span className="bg-primary/20 text-primary h-8 w-8 rounded-full flex items-center justify-center text-sm">1</span>
          Creating a New Threat Model
        </h3>
        
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-secondary/50 p-3 rounded-2xl h-fit">
              <PlusCircle className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-1">Start & Name Your Model</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Click on <strong>"New Model"</strong> in the sidebar. Begin by giving your system a clear, identifiable name. 
                If your organization uses SMC (Service Management Code) identifiers, it is highly recommended to include the SMC code in the title (e.g., <em>"Payment Gateway API - SMC-4921"</em>).
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-secondary/50 p-3 rounded-2xl h-fit">
              <FileText className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-1">Add System Description & Documents</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                In the <strong>System Description</strong> tab, provide a natural language explanation of your architecture, data flows, and trust boundaries. 
                You can also attach supporting documents (PDF including scanned PDFs, Word, Excel, CSV, Markdown, JSON/YAML, Terraform, or images). Each file is read when you attach it and shows its pages and character count. Every input is then added to the analysis, and long documents are condensed by a digest agent. The report's Inputs Analysed table confirms how each input was used.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-secondary/50 p-3 rounded-2xl h-fit">
              <ImageIcon className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-1">Upload Architecture Diagrams</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Switch to the <strong>Diagrams</strong> tab if you have visual architecture representations. You can upload images (PNG, JPG), PDFs, or Visio/draw.io files. 
                The AI will parse these diagrams to automatically identify components, data flows, and missing trust boundaries.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-secondary/50 p-3 rounded-2xl h-fit">
              <Github className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-1">Link Code Repositories</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                In the <strong>Repositories</strong> tab, use <strong>Add Repository</strong> to include multiple repositories in one threat model.
                Sign in on the local server with <code>gh auth login --hostname github.com --web</code>, then use <strong>Check Connection</strong> and <strong>Browse GitHub Repositories</strong> to select public or private repositories available to that account.
                Credentials stay on the local server; access follows repository permissions and organization SSO (single sign-on) requirements. This GitHub connection is separate from the Copilot AI login.
                GitHub repositories are scanned for code-level vulnerabilities, dependencies, and configuration risks; other providers supply URL-based context only.
                Metadata (description, topics, license, languages, latest release) and text documentation (README, security policies, architecture, API docs, and design decisions) are collected separately and added to the architecture and threat-analysis context, even when no code findings are identified.
                Long sources are condensed, and the report lists each source, exclusions, collection limits, and individual failures. This is static analysis, not DAST (testing a running application).
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                Optionally add a <strong>Reference URL</strong> (product site, docs, or trust center). A web documentation agent spiders up to
                25 public pages on that site, keeps the ones relevant to security, privacy, and threat modeling, and adds a cited briefing to the analysis context.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-primary/20 p-3 rounded-2xl h-fit text-primary">
              <Play className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-1 text-foreground">Run the Analysis</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Once all context is provided, select your preferred threat modeling framework (e.g., STRIDE) and click <strong>"Run Analysis"</strong>. 
                The AI pipeline will ingest the data, build a C4 architecture graph, identify threats, and map compliance gaps.
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                Select <strong>Hybrid TM</strong> to combine STRIDE (security), LINDDUN (privacy), and PASTA (business risk).
                The agent follows the bundled Hybrid protocol using your actual system context. Each finding includes business impact,
                a mapped control, an attack path, and DREAD (risk scoring) alongside the existing CVSS score.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Part 2: Understanding the Report */}
      <section className="bg-card border border-border/50 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 border-b border-border/50 pb-4 flex items-center gap-2">
          <span className="bg-primary/20 text-primary h-8 w-8 rounded-full flex items-center justify-center text-sm">2</span>
          Navigating the Threat Report
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Select <strong>Redo Threat Model</strong> in a completed report to open an editable new assessment with its original inputs, files and methodology prefilled.
          Change the inputs or framework and run again; the original report stays unchanged. Repository and website context is fetched again.
          Original inputs and attachments are stored locally with new assessments. Older reports can recover only the text they retained and will warn you to reattach missing originals.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border/50 rounded-2xl p-5 bg-secondary/10">
            <ShieldAlert className="h-8 w-8 text-destructive mb-4" />
            <h4 className="font-bold text-base mb-2">Threat Catalog</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This tab lists all identified threats ranked by severity (Critical to Low). You can expand each threat to see the specific 
              exploitation path and the architectural evidence the AI found. You can easily filter by category or severity.
            </p>
          </div>

          <div className="border border-border/50 rounded-2xl p-5 bg-secondary/10">
            <GitMerge className="h-8 w-8 text-blue-500 mb-4" />
            <h4 className="font-bold text-base mb-2">C4 Architecture Diagram</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              An interactive representation of your system's components and data flows. You can toggle between Context (L1), 
              Container (L2), and Component (L3) views drawn with standard C4 notation. <strong>Auto Layout</strong> cycles through six
              non-overlapping arrangements (layered, tiered, radial, organic, grid), and the <strong>Mermaid</strong> view renders a
              publication-ready diagram you can export as SVG or PNG. Double-click a node to edit it.
            </p>
          </div>

          <div className="border border-border/50 rounded-2xl p-5 bg-secondary/10">
            <CheckSquare className="h-8 w-8 text-emerald-500 mb-4" />
            <h4 className="font-bold text-base mb-2">Mitigation Plan (Kanban)</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A drag-and-drop board turning threats into actionable tasks. Every threat gets a tailored mitigation strategy. 
              You can move tasks to "In Progress", "Done", or "Exception" (which requires a mandatory business justification).
            </p>
          </div>

          <div className="border border-border/50 rounded-2xl p-5 bg-secondary/10">
            <FileCheck className="h-8 w-8 text-primary mb-4" />
            <h4 className="font-bold text-base mb-2">Compliance & Business Risk</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Shows how your threats map against required frameworks (like NIST SP 800-53) and highlights which specific 
              mandatory controls are failing. It also maps gaps against your global Business Risk Register.
            </p>
          </div>
        </div>

        <div className="mt-8 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-4">
          <Info className="h-6 w-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-1">Exporting & Translating Reports</h4>
            <p className="text-sm text-blue-600/80 dark:text-blue-300/80 leading-relaxed">
              Use the <strong>"Export Report"</strong> button at the top right of any report to generate a professional PDF, CSV, or JSON file. 
              You can also select a target language (e.g., Spanish, German) during export, and the AI agent will translate the entire report seamlessly before saving.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};