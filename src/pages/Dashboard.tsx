import React, { useMemo } from 'react';
import { 
  ShieldCheck, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

const StatCard = ({ title, value, change, icon: Icon, trendColor, subtext }: any) => (
  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-primary/10 text-primary rounded-2xl">
        <Icon className="h-6 w-6" />
      </div>
      {change && change !== '0 pts' && (
        <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full ${
          trendColor === 'bad' ? 'text-destructive bg-destructive/10' : 'text-emerald-500 bg-emerald-500/10'
        }`}>
          {change.startsWith('+') ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {change}
        </div>
      )}
    </div>
    <div className="mt-auto">
      <h3 className="text-3xl font-bold mb-1">{value}</h3>
      <p className="text-muted-foreground font-medium">{title}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-2">{subtext}</p>}
    </div>
  </div>
);

export const Dashboard = () => {
  const models = useLiveQuery(() => db.threatModels.toArray());
  const documents = useLiveQuery(() => db.documents.toArray());
  
  const stats = useMemo(() => {
    if (!models || models.length === 0) {
      return {
        metrics: { avgScore: 0, modelCount: 0, change: '0 pts', complianceScore: 0, openActions: 0, coverage: 0, mitigatedTotal: 0 },
        chartData: [
          { name: 'Jan', score: 0, target: 50 },
          { name: 'Feb', score: 0, target: 50 },
          { name: 'Mar', score: 0, target: 50 },
          { name: 'Apr', score: 0, target: 50 },
          { name: 'May', score: 0, target: 50 },
        ],
        frameworkData: [],
        totalThreats: 0
      };
    }

    let totalScore = 0;
    let totalThreats = 0;
    let totalGaps = 0;
    const categoryCounts: Record<string, { open: number, mitigated: number }> = {};

    models.forEach(m => {
      totalScore += m.riskScore;
      
      m.threats?.forEach(t => {
        totalThreats++;
        const cat = t.category || 'Unknown';
        if (!categoryCounts[cat]) categoryCounts[cat] = { open: 0, mitigated: 0 };
        
        // A threat is considered mitigated if its status is 'Done' or 'Exception'
        const isMitigated = t.status === 'Done' || t.status === 'Exception';
        if (isMitigated) {
          categoryCounts[cat].mitigated++;
        } else {
          categoryCounts[cat].open++;
        }
      });

      // Calculate unique compliance gaps
      const uniqueGaps = new Set((m.complianceGaps || [])
        .filter((g: any) => g.status === 'Gap Identified' || g.status === 'Partially Met')
        .map((g: any) => g.controlId));
      
      totalGaps += uniqueGaps.size;
    });

    const avgScore = Math.round(totalScore / models.length);

    // Calculate historical risk trend (last 6 months)
    const now = new Date();
    const last6Months = Array.from({length: 6}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { month: d.getMonth(), year: d.getFullYear(), name: d.toLocaleString('default', { month: 'short' }), score: 0, count: 0 };
    });

    models.forEach(m => {
      const d = new Date(m.date);
      const mMonth = d.getMonth();
      const mYear = d.getFullYear();
      const targetMonth = last6Months.find(lm => lm.month === mMonth && lm.year === mYear);
      if (targetMonth) {
        targetMonth.score += m.riskScore;
        targetMonth.count += 1;
      }
    });

    const chartData = last6Months.map(lm => ({
      name: lm.name,
      score: lm.count > 0 ? Math.round(lm.score / lm.count) : 0,
      target: 50
    }));

    // Carry over values for empty months to make chart continuous
    let lastKnownScore = chartData.find(c => c.score > 0)?.score || 0;
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].score > 0) {
        lastKnownScore = chartData[i].score;
      } else if (lastKnownScore > 0) {
        chartData[i].score = lastKnownScore;
      }
    }

    const previousMonthScore = chartData[4].score || 0;
    const currentMonthScore = chartData[5].score || avgScore;
    const diff = currentMonthScore - previousMonthScore;
    const change = diff === 0 ? '0 pts' : diff > 0 ? `+${diff} pts` : `${diff} pts`;

    // Framework Data Formatting
    const frameworkData = Object.keys(categoryCounts)
      .map(category => ({
        name: category.length > 15 ? category.substring(0, 15) + '...' : category,
        mitigated: categoryCounts[category].mitigated,
        open: categoryCounts[category].open
      }))
      .sort((a, b) => (b.open + b.mitigated) - (a.open + a.mitigated))
      .slice(0, 8); // Display top 8 categories

    // Calculate Compliance Score
    let totalMandatory = 50; 
    if (documents) {
      const mmappDoc = documents.find(d => d.name.toLowerCase().includes('mmapp controls.csv'));
      if (mmappDoc && mmappDoc.content) {
        const rows = mmappDoc.content.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (rows.length > 1) {
          totalMandatory = rows.length - 1;
        } else if (rows.length === 1) {
          totalMandatory = 1;
        }
      }
    }
    
    const avgGaps = models.length > 0 ? totalGaps / models.length : 0;
    const metControls = Math.max(0, totalMandatory - avgGaps);
    const complianceScore = totalMandatory > 0 ? Math.round((metControls / totalMandatory) * 100) : 0;

    const mitigatedTotal = Object.values(categoryCounts).reduce((acc, c) => acc + c.mitigated, 0);
    const coverage = totalThreats > 0 ? Math.round((mitigatedTotal / totalThreats) * 100) : 0;
    const openActions = totalThreats - mitigatedTotal;

    return { 
      metrics: { 
        avgScore, 
        modelCount: models.length, 
        change,
        complianceScore,
        openActions,
        coverage,
        mitigatedTotal
      }, 
      chartData, 
      totalThreats, 
      frameworkData 
    };
  }, [models, documents]);

  if (models === undefined) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { metrics, chartData, frameworkData, totalThreats } = stats;
  const isRiskGood = metrics.avgScore <= 50;

  return (
    <div className="space-y-8 pb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Overall Risk Posture"
          value={metrics.avgScore.toString()}
          change={metrics.change}
          trendColor={isRiskGood ? 'good' : 'bad'}
          icon={AlertTriangle}
          subtext={`Severity-weighted aggregate across ${metrics.modelCount} models`}
        />
        <StatCard
          title="Mitigation Coverage"
          value={`${metrics.coverage}%`}
          trendColor="good"
          icon={ShieldCheck}
          subtext={`${metrics.mitigatedTotal} / ${totalThreats} Total Threats`}
        />
        <StatCard
          title="Compliance Score"
          value={`${metrics.complianceScore}%`}
          trendColor={metrics.complianceScore >= 80 ? 'good' : 'bad'}
          icon={CheckCircle}
          subtext="Mandatory controls met"
        />
        <StatCard
          title="Open Action Items"
          value={metrics.openActions}
          trendColor={metrics.openActions === 0 ? 'good' : 'bad'}
          icon={Clock}
          subtext="High Priority Tasks Pending"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Risk Score Trend</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                <Area type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Identified Threat Categories</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frameworkData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} width={100} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: 'hsl(var(--secondary))'}}
                />
                <Legend iconType="circle" />
                <Bar dataKey="mitigated" name="Mitigated" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="open" name="Open Threats" stackId="a" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};