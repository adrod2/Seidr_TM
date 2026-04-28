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

const STRIDE_CATEGORIES = ["S", "T", "R", "I", "D", "E"];
const PASTA_CATEGORIES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"];
const MAESTRO_CATEGORIES = [
  "C",
  "R",
  "A",
  "I",
  "N",
  "E",
  "L",
  "A",
  "P",
  "S",
  "E",
];

const getHeatmapCategories = (framework: string) => {
  switch (framework.toUpperCase()) {
    case "STRIDE":
      return STRIDE_CATEGORIES;
    case "PASTA":
      return PASTA_CATEGORIES;
    case "MAESTRO":
      return MAESTRO_CATEGORIES;
    default:
      return STRIDE_CATEGORIES;
  }
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

  const heatmapCategories = getHeatmapCategories(model.framework || "STRIDE");

  const heatmapData = useMemo(() => {
    return components.map((component) => {
      const categoryCounts: { [key: string]: Threat[] } = {};
      heatmapCategories.forEach((cat) => (categoryCounts[cat] = []));

      component.threats.forEach((threat) => {
        const category = threat.id.split("-")[0].toUpperCase();
        if (categoryCounts[category]) {
          categoryCounts[category].push(threat);
        }
      });
      return {
        componentName: component.name,
        categories: categoryCounts,
        total: component.threats.length,
      };
    });
  }, [components, heatmapCategories]);

  const getCellColor = (threats: Threat[]) => {
    if (threats.length === 0) return "bg-gray-800";
    const maxSeverity = Math.max(
      ...threats.map((t) => {
        if (t.severity === "Critical") return 4;
        if (t.severity === "High") return 3;
        if (t.severity === "Medium") return 2;
        return 1;
      })
    );
    if (maxSeverity === 4) return "bg-red-600";
    if (maxSeverity === 3) return "bg-orange-500";
    if (maxSeverity === 2) return "bg-yellow-500";
    return "bg-blue-500";
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
                <p className="font-bold">RESIDUAL RISK POSTURE:</p>
                <p>{findingsSummary.Critical} Critical - {findingsSummary.High} High</p>
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
                <TableRow className="border-gray-700">
                  <TableHead className="text-white">Component</TableHead>
                  {heatmapCategories.map((cat) => (
                    <TableHead key={cat} className="text-center text-white">
                      {cat}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-white">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heatmapData.map((row) => (
                  <TableRow key={row.componentName} className="border-gray-700">
                    <TableCell className="font-medium">
                      {row.componentName}
                    </TableCell>
                    {heatmapCategories.map((cat) => (
                      <TableCell key={cat} className="p-1">
                        <div
                          className={cn(
                            "w-full h-8 rounded-md cursor-pointer",
                            getCellColor(row.categories[cat]),
                            row.categories[cat].length > 0 ? 'hover:ring-2 hover:ring-blue-400' : ''
                          )}
                          onClick={() => row.categories[cat].length > 0 && onThreatSelect(row.categories[cat][0].id)}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">{row.total}</TableCell>
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
                <TableRow className="border-gray-700">
                  <TableHead className="text-white">Component</TableHead>
                  <TableHead className="text-white">Risk Weight</TableHead>
                  <TableHead className="text-white">Findings</TableHead>
                  <TableHead className="text-white">Key Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {architectureOverlayData.map((row) => (
                  <TableRow key={row.name} className="border-gray-700">
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                        <span className={cn("font-bold", getSeverityColor(row.riskWeight, true))}>
                            {row.riskWeight}
                        </span>
                    </TableCell>
                    <TableCell>{row.findings}</TableCell>
                    <TableCell>{row.keyRisk}</TableCell>
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
          <CardContent className="space-y-4">
            {topFindings.map((threat) => (
              <div
                key={threat.id}
                className="p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700"
                onClick={() => onThreatSelect(threat.id)}
              >
                <div className="flex justify-between items-start">
                  <p className="font-bold text-sm">
                    {threat.id} | {threat.componentId}
                  </p>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      getSeverityColor(threat.severity)
                    )}
                  >
                    {threat.severity} ({threat.cvssScore.toFixed(1)})
                  </span>
                </div>
                <p className="text-sm text-gray-300">{threat.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}