import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { db, type ThreatModel } from '@/lib/db';
import { assessmentSummary } from '@/lib/backend/assessmentQuality';
import { assessmentReadiness, recordedDecisionLabel } from '@/lib/backend/assessmentWorkflow';

export const Dashboard = () => {
  const models = useLiveQuery(() => db.threatModels.toArray());
  const stats = useMemo(() => {
    const current = new Map<string, ThreatModel>();
    for (const model of models || []) {
      const key = model.quality ? `${model.quality.systemId}:${model.quality.environment || 'Unspecified'}` : `legacy:${model.id}`;
      const previous = current.get(key);
      if (!previous || Date.parse(model.date) > Date.parse(previous.date)) current.set(key, model);
    }
    const latest = [...current.values()];
    const summaries = latest.map(model => assessmentSummary(model.quality));
    const monthStart = new Date();
    const activity = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth() - 5 + index, 1);
      return { key: `${date.getFullYear()}-${date.getMonth()}`, name: date.toLocaleString('default', { month: 'short' }), assessments: 0 };
    });
    for (const model of models || []) {
      const date = new Date(model.date);
      const month = activity.find(item => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (month) month.assessments++;
    }
    return {
      systems: latest.length, legacy: latest.filter(model => !model.quality).length,
      hold: latest.filter(model => model.quality && assessmentReadiness(model.quality).recommendation === 'Hold').length,
      decisions: latest.filter(model => model.quality && !['Review required', 'Legacy / unverified'].includes(recordedDecisionLabel(model.quality))).length,
      blockers: summaries.reduce((sum, item) => sum + item.blockers, 0),
      unrated: summaries.reduce((sum, item) => sum + item.unrated, 0),
      accepted: summaries.reduce((sum, item) => sum + item.accepted, 0),
      closed: summaries.reduce((sum, item) => sum + item.closed, 0), activity,
    };
  }, [models]);
  if (models === undefined) return <div className="p-10 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  return <div className="space-y-6">
    <header><h2 className="text-2xl font-bold">Assessment overview</h2>
      <p className="text-sm text-muted-foreground mt-2">Latest assessment per recorded system. Business-risk ratings are not averaged across systems. Risk acceptance is not mitigation; legacy task completion is not verified closure.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[['Recorded systems', stats.systems], ['Open blockers', stats.blockers], ['Unrated current risks', stats.unrated], ['Active risk acceptances', stats.accepted]].map(([label, value]) =>
        <div key={label} className="bg-card rounded-2xl border border-border p-6"><strong className="text-3xl">{value}</strong><p className="text-sm text-muted-foreground mt-2">{label}</p></div>)}
    </div>
    <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
      <p>{stats.closed} recorded evidence-based closures; {stats.legacy} legacy assessments remain unverified.</p>
      <p>{stats.hold} application Hold recommendations; {stats.decisions} recorded owner system decisions (including conditional, expired or stale decisions requiring review).</p>
      <p className="text-sm text-muted-foreground">Compliance and examination coverage are unknown unless specifically reviewed. Empty results are not evidence of safety.</p>
    </div>
    <section className="rounded-2xl border border-border bg-card p-6"><h3 className="font-semibold mb-4">Assessment activity (actual records, including revisions by redo)</h3>
      <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.activity}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} />
        <Tooltip /><Bar dataKey="assessments" name="Assessments" fill="hsl(var(--primary))" />
      </BarChart></ResponsiveContainer></div>
    </section>
  </div>;
};
