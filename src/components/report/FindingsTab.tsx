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

interface FindingsTabProps {
  threats: Threat[];
  model: ThreatModel;
  onThreatSelect: (threatId: string) => void;
}

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
        // Find which column this threat belongs to based on the category string
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
    if (threats.length === 0) return "bg-gray-800/40 border border-gray-800/60";
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
    <div className="space-y-6 p-4 md:p-6 text-white">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 bg-gray-900 border-gray-700">
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
                      <span className="text-white">
                        {value} ({entry.payload?.value})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold">{totalFindings}</span>
                <span className="text-sm text-gray-400">findings</span>
              </div>
            </div>
            <div className="mt-4 text-center">
                <p className="font-bold text-gray-300 text-sm tracking-wide mb-1">RESIDUAL RISK POSTURE:</p>
                <p className="text-lg">
                  <span className="text-red-500 font-bold">{findingsSummary.Critical}</span> Critical - <span className="text-orange-500 font-bold">{findingsSummary.High}</span> High
                </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle>Residual Coverage Heat Map</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-300">Component</TableHead>
                  {heatmapColumns.map((col) => (
                    <TableHead key={col.id} className="text-center text-gray-300" title={col.label}>
                      {col.id}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-gray-300">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heatmapData.map((row) => (
                  <TableRow key={row.componentName} className="border-gray-700 hover:bg-gray-800/50">
                    <TableCell className="font-medium">
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
                              cellThreats.length > 0 ? 'hover:scale-105 hover:ring-2 hover:ring-white/50' : ''
                            )}
                            onClick={() => cellThreats.length > 0 && onThreatSelect(cellThreats[0].id)}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-mono text-gray-300">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle>Architecture Threat Overlay</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-300">Component</TableHead>
                  <TableHead className="text-gray-300">Risk Weight</TableHead>
                  <TableHead className="text-gray-300 text-center">Findings</TableHead>
                  <TableHead className="text-gray-300">Key Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {architectureOverlayData.map((row) => (
                  <TableRow key={row.name} className="border-gray-700 hover:bg-gray-800/50">
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                        <span className={cn("font-bold px-2.5 py-1 rounded-md text-xs", getSeverityColor(row.riskWeight, true))}>
                            {row.riskWeight}
                        </span>
                    </TableCell>
                    <TableCell className="text-center font-mono">{row.findings}</TableCell>
                    <TableCell className="text-gray-400 text-sm">{row.keyRisk}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle>Top Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFindings.map((threat) => (
              <div
                key={threat.id}
                className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-800 hover:border-gray-600 transition-all"
                onClick={() => onThreatSelect(threat.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-mono text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded">
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
                <p className="text-sm text-gray-200 font-medium leading-snug">{threat.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}