export type C4Level = 'L1' | 'L2' | 'L3';

export interface C4Element {
  id: string;
  name: string;
  c4Type: 'Person' | 'System' | 'Container' | 'Database' | 'Component';
  c4Level?: string;
  external: boolean;
  technology?: string;
  description?: string;
}

export interface C4Relation {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  protocol?: string;
}

const C4_TYPES = ['Person', 'System', 'Container', 'Database', 'Component'];

export function toC4Element(c: any): C4Element {
  const c4Type = C4_TYPES.includes(c.c4Type) ? c.c4Type
    : c.type === 'ExternalEntity' ? 'Person' : c.type === 'DataStore' ? 'Database' : 'Container';
  const external = typeof c.external === 'boolean' ? c.external
    : c4Type === 'Person' ? false : c.type === 'ExternalEntity' || /\bexternal\b|third[- ]party/i.test(`${c.name} ${c.description || ''}`.slice(0, 200)) && c4Type === 'System';
  return {
    id: String(c.id),
    name: c.name || String(c.id),
    c4Type,
    c4Level: c.c4Level,
    external,
    technology: c.technology || c.metadata?.technology || undefined,
    description: c.description,
  };
}

/** Same level filtering as the original diagram: L2 also shows the L1 context, L3 also shows L2 containers. */
export function visibleComponents(srg: any, level: C4Level): any[] {
  const visible = (srg?.components || []).filter((c: any) =>
    c.c4Level === level || c.c4Level === 'Global' || !c.c4Level ||
    (level === 'L2' && c.c4Level === 'L1') ||
    (level === 'L3' && c.c4Level === 'L2'));
  // At L2 the in-scope system is drawn as the boundary around its containers, so it is not repeated as a box.
  if (level === 'L2' && visible.some((c: any) => c.c4Level === 'L2' && isInsideSystem(toC4Element(c)))) {
    const scoped = (srg?.components || []).map(toC4Element).find((c: C4Element) => c.c4Type === 'System' && !c.external);
    if (scoped) return visible.filter((c: any) => String(c.id) !== scoped.id);
  }
  return visible;
}

/** Hides placeholder protocols such as "Not specified" or "N/A". */
export const displayProtocol = (protocol?: string) =>
  protocol && !/^\s*(not specified|unspecified|unknown|n\/?a|none|-)?\s*$/i.test(protocol) ? protocol : undefined;

export function visibleRelations(srg: any, ids: Set<string>): C4Relation[] {
  return (srg?.edges || []).filter((e: any) => ids.has(e.sourceId) && ids.has(e.targetId) && e.sourceId !== e.targetId);
}

export const isInsideSystem = (e: C4Element) => !e.external && ['Container', 'Database', 'Component'].includes(e.c4Type);

export function systemName(srg: any, fallback = 'System Boundary') {
  const system = (srg?.components || []).map(toC4Element).find((c: C4Element) => c.c4Type === 'System' && !c.external);
  return system?.name || fallback;
}

const clean = (text: string | undefined, max: number) => {
  const value = (text || '').replace(/[`"*_#;<>{}|[\]\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const mermaidId = (id: string, used: Map<string, string>) => {
  if (used.has(id)) return used.get(id)!;
  let base = `n_${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
  while ([...used.values()].includes(base)) base += '_';
  used.set(id, base);
  return base;
};

export type MermaidDirection = 'TB' | 'LR' | 'BT' | 'RL';

export function buildC4Mermaid(elements: C4Element[], relations: C4Relation[],
  { direction = 'TB', boundaryLabel = 'System Boundary', showDescriptions = true }:
  { direction?: MermaidDirection; boundaryLabel?: string; showDescriptions?: boolean } = {}): string {
  const ids = new Map<string, string>();
  const lines = [`flowchart ${direction}`];
  const node = (e: C4Element) => {
    const id = mermaidId(e.id, ids);
    const kind = e.c4Type === 'Person' ? (e.external ? 'External Person' : 'Person')
      : e.c4Type === 'System' ? (e.external ? 'External System' : 'Software System') : e.c4Type;
    const parts = [`**${clean(e.name, 60)}**`, `[${kind}${e.technology ? `: ${clean(e.technology, 40)}` : ''}]`];
    if (showDescriptions && e.description) parts.push(clean(e.description, 140));
    const label = `"\`${parts.join('\n')}\`"`;
    const shape = e.c4Type === 'Database' ? `[(${label})]` : e.c4Type === 'Person' ? `([${label}])` : `[${label}]`;
    const cls = e.external && e.c4Type !== 'Person' ? 'external' : e.c4Type.toLowerCase();
    return `${id}${shape}:::${cls}`;
  };
  const inside = elements.filter(isInsideSystem);
  const outside = elements.filter((e) => !isInsideSystem(e));
  for (const e of outside) lines.push(`  ${node(e)}`);
  if (inside.length) {
    lines.push(`  subgraph boundary["\`**${clean(boundaryLabel, 60)}**\n[Software System]\`"]`);
    lines.push(`    direction ${direction}`);
    for (const e of inside) lines.push(`    ${node(e)}`);
    lines.push('  end');
  }
  for (const r of relations) {
    const text = [clean(r.label, 50), displayProtocol(r.protocol) ? `[${clean(r.protocol, 30)}]` : ''].filter(Boolean).join('\n');
    const from = mermaidId(r.sourceId, ids);
    const to = mermaidId(r.targetId, ids);
    lines.push(text ? `  ${from} -.->|"\`${text}\`"| ${to}` : `  ${from} -.-> ${to}`);
  }
  lines.push(
    '  classDef person fill:#08427b,stroke:#052e56,color:#ffffff,stroke-width:2px',
    '  classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff,stroke-width:2px',
    '  classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff,stroke-width:2px',
    '  classDef container fill:#438dd5,stroke:#3c7fc0,color:#ffffff,stroke-width:2px',
    '  classDef database fill:#438dd5,stroke:#3c7fc0,color:#ffffff,stroke-width:2px',
    '  classDef component fill:#85bbf0,stroke:#78a8d8,color:#0b2540,stroke-width:2px',
  );
  if (inside.length) lines.push('  style boundary fill:transparent,stroke:#8a94a6,stroke-width:2px,stroke-dasharray:8 5');
  if (relations.length) lines.push('  linkStyle default stroke:#64748b,stroke-width:1.5px');
  return lines.join('\n');
}
