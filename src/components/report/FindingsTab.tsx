import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Threat } from "@/lib/backend/types";
import { ThreatModel } from "@/lib/db";
import { cn, getSeverityColor } from "@/lib/utils";
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { Database, FileText, Globe, Paperclip, Image as ImageIcon, Github, FolderGit2 } from "lucide-react";

interface FindingsTabProps {
  threats: Threat[];
  model: ThreatModel;
  onThreatSelect: (threatId: string) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function FindingsTab({
  threats,
  model,
  onThreatSelect,
}: FindingsTabProps) {
  const findingsSummary = useMemo(() => {
    const severities = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };
    threats.forEach((threat) => {
      severities[threat.severity]++;
    });
    return severities;
  }, [threats]);

  const totalFindings = threats.length;

  const pieData = useMemo(
    () =>
      Object.entries(findingsSummary)
        .map(([name, value]) => ({ name, value }))
        .filter((d) => d.value > 0),
    [findingsSummary]
  );

  const COLORS = {
    Critical: "#dc2626",
    High: "#f97316",
    Medium: "#facc15",
    Low: "#3b82f6",
  };

  const topFindings = useMemo(
    () =>
      [...threats]
        .sort((a, b) => b.cvssScore - a.cvssScore)
        .slice(0, 5),
    [threats]
  );

  const components = useMemo(() => {
    const componentMap = new Map<string, Threat[]>();
    threats.forEach((threat) => {
      const componentName = threat.componentId || "Other";
      if (!componentMap.has(componentName)) {
        componentMap.set(componentName, []);
      }
      componentMap.get(componentName)?.push(threat);
    });
    return Array.from(componentMap.entries()).map(([name, threats]) => ({
      name,
      threats,
    }));
  }, [threats]);

  // Dynamically map columns based on framework and actual threat categories
  const heatmapColumns = useMemo(() => {
    const fw = (model.framework || "STRIDE").toUpperCase();
    
    if (fw === "STRIDE") {
      return [
        { id: "S", label: "Spoofing", match: (c: string) => c.toUpperCase().includes("SPOOF") },
        { id: "T", label: "Tampering", match: (c: string) => c.toUpperCase().includes("TAMP") },
        { id: "R", label: "Repudiation", match: (c: string) => c.toUpperCase().includes("REPUD") },
        { id: "I", label: "Info Disclosure", match: (c: string) => c.toUpperCase().includes("INFO") || c.toUpperCase().includes("DISCLOSURE") },
        { id: "D", label: "Denial of Service", match: (c: string) => c.toUpperCase().includes("DENIAL") || c.toUpperCase().includes("DOS") },
        { id: "E", label: "Elevation of Privilege", match: (c: string) => c.toUpperCase().includes("ELEVAT") || c.toUpperCase().includes("PRIVILEGE") },
      ];
    }
    
    // Fallback: Dynamic column generation for PASTA, MAESTRO, or custom frameworks
    const uniqueCats = Array.from(new Set(threats.map((t) => t.category || "Uncategorized")));
    return uniqueCats.map((cat) => {
      // Create a short acronym for the table header (e.g., "Stage 1" -> "S1")
      const words = cat.split(/[\s_-]+/);
      let shortId = cat.substring(0, 3).toUpperCase();
      if (words.length > 1) {
          shortId = words.map(w => w[0]).join('').substring(0, 3).toUpperCase();
      }
      return {
        id: shortId,
        label: cat,
        match: (c: string) => c === cat,
      };
    });
  }, [model.framework, threats]);

  const heatmapData = useMemo(() => {
    return components.map((component) => {
      const categoryCounts: { [key: string]: Threat[] } = {};
      heatmapColumns.forEach((col) => (categoryCounts[col.id] = []));

      component.threats.forEach((threat) => {
        const threatCat = threat.category || "";
        const matchedCol = heatmapColumns.find(col => col.match(threatCat));
        if (matchedCol) {
          categoryCounts[matchedCol.id].push(threat);
        }
      });
      return {
        componentName: component.name,
        categories: categoryCounts,
        total: component.threats.length,
      };
    });
  }, [components, heatmapColumns]);

  const getCellColor = (threats: Threat[]) => {
    if (threats.length === 0) return "bg-secondary/50 border border-border/50";
    const maxSeverity = Math.max(
      ...threats.map((t) => {
        if (t.severity === "Critical") return 4;
        if (t.severity === "High") return 3;
        if (t.severity === "Medium") return 2;
        return 1;
      })
    );
    if (maxSeverity === 4) return "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.4)]";
    if (maxSeverity === 3) return "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]";
    if (maxSeverity === 2) return "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]";
    return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]";
  };

  const architectureOverlayData = useMemo(() => {
    return components.map(component => {
        const riskWeight = component.threats.reduce((acc, t) => {
            if (t.severity === 'Critical') return 'Critical';
            if (t.severity === 'High' && acc !== 'Critical') return 'High';
            if (t.severity === 'Medium' && acc !== 'Critical' && acc !== 'High') return 'Medium';
            return acc;
        }, 'Low');

        const keyRisks = [...new Set(component.threats.map(t => t.title))].slice(0,2).join(', ');

        return {
            name: component.name,
            riskWeight,
            findings: component.threats.length,
            keyRisk: keyRisks
        }
    })
  }, [components]);

  return (
    <div className="flex-1 overflow-y-auto h-full space-y-6 p-4 md:p-6 text-foreground bg-secondary/5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 bg-card border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Findings Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[entry.name as keyof typeof COLORS]}
                      />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(value, entry) => (
                      <span className="text-foreground font-medium">
                        {value} ({entry.payload?.value})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold">{totalFindings}</span>
                <span className="text-sm text-muted-foreground">findings</span>
              </div>
            </div>
            <div className="mt-4 text-center">
                <p className="font-bold text-muted-foreground text-sm tracking-wide mb-1">RESIDUAL RISK POSTURE:</p>
                <p className="text-lg">
                  <span className="text-red-500 font-bold">{findingsSummary.Critical}</span> Critical - <span className="text-orange-500 font-bold">{findingsSummary.High}</span> High
                </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 bg-card border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Residual Coverage Heat Map</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Component</TableHead>
                  {heatmapColumns.map((col) => (
                    <TableHead key={col.id} className="text-center text-muted-foreground" title={col.label}>
                      {col.id}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heatmapData.map((row) => (
                  <TableRow key={row.componentName} className="border-border/50 hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      {row.componentName}
                    </TableCell>
                    {heatmapColumns.map((col) => {
                      const cellThreats = row.categories[col.id];
                      return (
                        <TableCell key={col.id} className="p-2">
                          <div
                            title={`${col.label}: ${cellThreats.length} finding(s)`}
                            className={cn(
                              "w-full h-8 rounded-md cursor-pointer transition-all duration-200",
                              getCellColor(cellThreats),
                              cellThreats.length > 0 ? 'hover:scale-105 hover:ring-2 hover:ring-primary/50' : ''
                            )}
                            onClick={() => cellThreats.length > 0 && onThreatSelect(cellThreats[0].id)}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-mono text-muted-foreground">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Architecture Threat Overlay</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Component</TableHead>
                  <TableHead className="text-muted-foreground">Risk Weight</TableHead>
                  <TableHead className="text-muted-foreground text-center">Findings</TableHead>
                  <TableHead className="text-muted-foreground">Key Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {architectureOverlayData.map((row) => (
                  <TableRow key={row.name} className="border-border/50 hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell>
                        <span className={cn("font-bold px-2.5 py-1 rounded-md text-xs", getSeverityColor(row.riskWeight, true))}>
                            {row.riskWeight}
                        </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-foreground">{row.findings}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.keyRisk}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Top Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFindings.map((threat) => (
              <div
                key={threat.id}
                className="p-4 bg-secondary/30 border border-border/50 rounded-xl cursor-pointer hover:bg-secondary/80 hover:border-primary/50 transition-all"
                onClick={() => onThreatSelect(threat.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-mono text-xs text-muted-foreground bg-background px-2 py-1 rounded border border-border/50 shadow-sm">
                    {threat.componentId}
                  </p>
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-1 rounded",
                      getSeverityColor(threat.severity, true)
                    )}
                  >
                    {threat.severity} ({threat.cvssScore.toFixed(1)})
                  </span>
                </div>
                <p className="text-sm text-foreground font-medium leading-snug">{threat.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {model.assessmentMeta && (
        <Card className="bg-card border-border/50 shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Assessment Scope & Knowledge Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Context Documents */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Context Documents
                </h4>
                <div className="space-y-2">
                  {model.assessmentMeta.globalDocuments.length > 0 || model.assessmentMeta.localDocuments.length > 0 ? (
                    <>
                      {model.assessmentMeta.globalDocuments.map(doc => (
                         <div key={doc} className="flex items-center gap-2 text-sm bg-secondary/30 px-3 py-2 rounded-lg border border-border/50">
                           <Globe className="h-4 w-4 flex-shrink-0 text-blue-500" /> 
                           <span className="truncate font-medium">{doc}</span> 
                           <span className="text-[10px] bg-secondary border border-border/50 px-1.5 py-0.5 rounded ml-auto flex-shrink-0">Global</span>
                         </div>
                      ))}
                      {model.assessmentMeta.localDocuments.map(doc => (
                         <div key={doc} className="flex items-center gap-2 text-sm bg-secondary/30 px-3 py-2 rounded-lg border border-border/50">
                           <Paperclip className="h-4 w-4 flex-shrink-0 text-amber-500" /> 
                           <span className="truncate font-medium">{doc}</span> 
                           <span className="text-[10px] bg-secondary border border-border/50 px-1.5 py-0.5 rounded ml-auto flex-shrink-0">Local</span>
                         </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic bg-secondary/10 p-3 rounded-lg border border-dashed border-border/50 text-center">No context documents provided.</p>
                  )}
                </div>
              </div>

              {/* Diagrams and Repo Link */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Architecture Inputs
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-secondary/30 px-4 py-3 rounded-xl border border-border/50 text-sm">
                    <span className="font-medium text-muted-foreground">Diagrams Uploaded</span>
                    <span className="font-bold bg-background border border-border/50 px-2 py-0.5 rounded-md">{model.assessmentMeta.diagramsCount}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 bg-secondary/30 px-4 py-3 rounded-xl border border-border/50 text-sm">
                    <span className="font-medium text-muted-foreground">Repository Attached</span>
                    <span className="text-xs font-mono font-medium truncate text-foreground bg-background border border-border/50 px-2 py-1 rounded-md">
                      {model.assessmentMeta.repositoryUrl || 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scanned Repo Files */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4" /> Repository Analysis
                </h4>
                {model.assessmentMeta.scannedFiles && model.assessmentMeta.scannedFiles.length > 0 ? (
                  <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-secondary/50 px-4 py-2.5 text-xs font-bold text-muted-foreground border-b border-border/50 flex justify-between">
                      <span>Priority Files Analyzed ({model.assessmentMeta.scannedFiles.length})</span>
                      <span>Size</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto bg-card">
                      {model.assessmentMeta.scannedFiles.map((f, i) => (
                        <div key={i} className="flex justify-between items-center px-4 py-2 border-b border-border/50 last:border-0 text-xs hover:bg-secondary/20 transition-colors">
                          <span className="truncate font-mono mr-2 text-foreground font-medium" title={f.path}>{f.path.split('/').pop()}</span>
                          <span className="text-muted-foreground whitespace-nowrap bg-secondary px-1.5 py-0.5 rounded border border-border/50">{formatBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic bg-secondary/10 p-3 rounded-lg border border-dashed border-border/50 text-center">No repository files were scanned.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}