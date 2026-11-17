import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { ComplianceGap } from '@/lib/backend/types';

export const ComplianceTab = ({ gaps = [] }: { gaps?: ComplianceGap[] }) => {
  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());
  const mappedControls = new Set(gaps.map(gap => gap.controlId)).size;
  const claimedGaps = new Set(gaps.filter(gap => gap.status !== 'Met').map(gap => gap.controlId)).size;
  return <div className="flex-1 overflow-y-auto p-6 space-y-6">
    <header><h3 className="text-xl font-bold">Compliance mapping — not a certification</h3>
      <p className="text-sm text-muted-foreground mt-2">Control mappings are AI proposals. A missing gap does not prove a control is implemented or effective. The assessed control denominator and overall compliance remain unknown until reviewed against evidence.</p></header>
    <div className="grid gap-4 md:grid-cols-3">
      {[['Overall compliance', 'Not assessed'], ['Distinct mapped controls', mappedControls], ['Controls with proposed gaps', claimedGaps]].map(([label, value]) =>
        <div key={label} className="rounded-2xl border border-border p-5"><p className="text-2xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div>)}
    </div>
    {gaps.length ? <div className="overflow-auto"><table className="w-full text-sm text-left">
      <thead><tr className="border-b">{['Control', 'Title', 'Proposed status', 'Description'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{gaps.map((gap, index) => <tr key={`${gap.controlId}:${index}`} className="border-b">
        <td className="p-3 font-mono">{gap.controlId}</td><td className="p-3">{gap.title}</td>
        <td className="p-3">{gap.status === 'Met' ? 'Claimed met — unverified' : `${gap.status} — unverified`}</td>
        <td className="p-3 whitespace-pre-wrap">{gap.description}</td></tr>)}</tbody>
    </table></div> : <p className="rounded-xl border border-border p-4 text-sm">No control mappings recorded. Compliance is unknown, not passed.</p>}
    <section><h4 className="font-semibold">Business risk context</h4>
      <p className="text-xs text-muted-foreground my-2">Current Administration register, not a reconstruction of historical assessment decisions. Alignment needs explicit evidence review.</p>
      {businessRisks === undefined ? <p>Loading business risk context...</p> : businessRisks.length ? businessRisks.map(risk =>
        <article className="p-4 border rounded-xl my-3" key={risk.id}><h5 className="font-semibold">{risk.name}</h5>
          <p className="text-sm">{risk.obligation}</p><p className="text-sm text-muted-foreground">Alignment: Not assessed</p></article>)
        : <p className="text-sm text-muted-foreground">No organizational business risks recorded.</p>}
    </section>
  </div>;
};
