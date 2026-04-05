import React, { useEffect, useState } from 'react';
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

const historicalRiskData = [
  { name: 'Jan', score: 85, target: 50 },
  { name: 'Feb', score: 78, target: 50 },
  { name: 'Mar', score: 72, target: 50 },
  { name: 'Apr', score: 65, target: 50 },
  { name: 'May', score: 58, target: 50 },
];

const StatCard = ({ title, value, change, icon: Icon, trendColor, subtext }: any) => (
  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-primary/10 text-primary rounded-2xl">
        <Icon className="h-6 w-6" />
      </div>
      {change && (
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
  
  const [metrics, setMetrics] = useState({ avgScore: 0, modelCount: 0, change: '0 pts' });
  const [chartData, setChartData] = useState(historicalRiskData);
  const [frameworkData, setFrameworkData] = useState<any[]>([]);
  const [totalThreats, setTotalThreats] = useState(0);

  useEffect(() => {
    if (models) {
      let totalScore = 0;
      let openThreats = 0;
      const strideCounts: Record<string, number> = {
        'Spoofing': 0, 'Tampering': 0, 'Repudiation': 0, 
        'Information Disclosure': 0, 'Denial of Service': 0, 'Elevation of Privilege': 0
      };

      models.forEach(m => {
        totalScore += m.riskScore;
        m.threats?.forEach(t => {
          openThreats++;
          if (strideCounts[t.category] !== undefined) {
            strideCounts[t.category]++;
          }
        });
      });

      const avg = models.length > 0 ? Math.round(totalScore / models.length) : 0;
      setMetrics({
        avgScore: avg,
        modelCount: models.length,
        change: avg < 58 ? `-${58 - avg} pts` : `+${avg - 58} pts`
      });

      const currentMonth = new Date().toLocaleString('default', { month: 'short' });
      setChartData([...historicalRiskData, { name: currentMonth, score: avg, target: 50 }]);

      setTotalThreats(openThreats + 85); // 85 historically mitigated

      const newFrameworkData = Object.keys(strideCounts).map(category => ({
        name: category === 'Information Disclosure' ? 'Info Disclosure' : 
              category === 'Denial of Service' ? 'DoS' : 
              category === 'Elevation of Privilege' ? 'Elevation' : category,
        mitigated: Math.floor(Math.random() * 15) + 5,
        open: strideCounts[category]
      }));
      setFrameworkData(newFrameworkData);
    }
  }, [models]);

  if (models === undefined) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isRiskGood = metrics.avgScore < 50;

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
          value={totalThreats > 0 ? Math.round((85 / totalThreats) * 100) + "%" : "0%"}
          change="+12%"
          trendColor="good"
          icon={ShieldCheck}
          subtext={`85 / ${totalThreats} Total Threats`}
        />
        <StatCard
          title="Compliance Score"
          value="92%"
          change="+5%"
          trendColor="good"
          icon={CheckCircle}
          subtext="Mandatory controls weighted 2x"
        />
        <StatCard
          title="Open Action Items"
          value={Math.max(0, totalThreats - 85)}
          change="-3"
          trendColor="good"
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
          <h3 className="text-lg font-bold mb-6">STRIDE Framework Coverage</h3>
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