import React, { memo } from 'react';
import { Handle, Position, NodeProps, EdgeProps, EdgeLabelRenderer, BaseEdge, getSmoothStepPath } from '@xyflow/react';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';
import type { Threat } from '@/lib/backend/types';
import { THREAT_COLORS, threatColor } from '@/lib/threatMap';
import type { routeDiagramEdge } from '@/lib/c4Routes';

export const C4_NODE_WIDTH = 250;

export const C4_PALETTE: Record<string, { fill: string; stroke: string; text: string }> = {
  Person: { fill: '#08427b', stroke: '#052e56', text: '#ffffff' },
  System: { fill: '#1168bd', stroke: '#0b4884', text: '#ffffff' },
  External: { fill: '#8a8a8a', stroke: '#6b6b6b', text: '#ffffff' },
  Container: { fill: '#438dd5', stroke: '#3c7fc0', text: '#ffffff' },
  Database: { fill: '#438dd5', stroke: '#3c7fc0', text: '#ffffff' },
  Component: { fill: '#85bbf0', stroke: '#78a8d8', text: '#0b2540' },
};

export interface C4NodeData extends Record<string, unknown> {
  label: string;
  c4Type: string;
  external: boolean;
  technology?: string;
  description?: string;
  componentId: string;
  threats?: Threat[];
  onInspect?: () => void;
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const handleClass = '!w-2 !h-2 !min-w-0 !min-h-0 !border-0 !bg-slate-500/70 opacity-0 group-hover:opacity-100 transition-opacity';

const Handles = ({ threats = [] }: { threats?: Threat[] }) => (
  <>
    {SIDES.map((side) => (
      <React.Fragment key={side}>
        <Handle type="target" id={`${side}-t`} position={side} className={handleClass} />
        <Handle type="source" id={`${side}-s`} position={side} className={handleClass} />
        {threats.map((threat, index) => <Handle key={threat.id} type="target"
          id={`${side}-threat-${encodeURIComponent(threat.id)}`} position={side} className={handleClass}
          style={side === Position.Top || side === Position.Bottom
            ? { left: `${100 * (index + 1) / (threats.length + 1)}%` }
            : { top: `${100 * (index + 1) / (threats.length + 1)}%` }} />)}
      </React.Fragment>
    ))}
  </>
);

export const paletteFor = (c4Type: string, external: boolean) =>
  external && c4Type !== 'Person' ? C4_PALETTE.External : C4_PALETTE[c4Type] || C4_PALETTE.Container;

const typeLabel = (c4Type: string, external: boolean) => {
  if (c4Type === 'Person') return external ? 'External Person' : 'Person';
  if (c4Type === 'System') return external ? 'External System' : 'Software System';
  return c4Type;
};

const Body = ({ data, color }: { data: C4NodeData; color: string }) => (
  <div className="flex flex-col items-center text-center gap-1" style={{ color }}>
    <div className="font-semibold text-[14px] leading-snug line-clamp-2" title={data.label}>{data.label}</div>
    <div className="text-[10.5px] leading-tight opacity-85">
      [{typeLabel(data.c4Type, data.external)}{data.technology ? `: ${data.technology}` : ''}]
    </div>
    {data.description && (
      <div className="text-[11px] leading-snug opacity-90 mt-1 line-clamp-4" title={data.description}>{data.description}</div>
    )}
    <div className="text-[9px] font-mono tracking-wider opacity-60 mt-1 uppercase">{data.componentId}</div>
    {!!data.threats?.length && (
      <button type="button" className="nodrag nopan mt-2 rounded-md bg-black/25 px-2 py-1 text-[11px] font-semibold text-white flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={event => { event.stopPropagation(); data.onInspect?.(); }}
        aria-label={`Inspect ${data.threats.length} threats affecting ${data.label}`}>
        <ShieldAlert className="h-3.5 w-3.5" /> {data.threats.length} {data.threats.length === 1 ? 'threat' : 'threats'}
      </button>
    )}
  </div>
);

export const C4Node = memo(({ data, selected }: NodeProps) => {
  const d = data as C4NodeData;
  const palette = paletteFor(d.c4Type, d.external);
  const ring = selected ? '0 0 0 3px rgba(250, 204, 21, 0.9), ' : '';
  const shadow = `${ring}0 6px 16px -6px rgba(15, 23, 42, 0.45)`;

  if (d.c4Type === 'Person') {
    return (
      <div className="group relative flex flex-col items-center" style={{ width: C4_NODE_WIDTH }}>
        <div className="rounded-full z-10" style={{ width: 64, height: 64, background: palette.fill, border: `2px solid ${palette.stroke}`, marginBottom: -22, boxShadow: shadow }} />
        <div className="w-full px-4 pt-7 pb-4" style={{ background: palette.fill, border: `2px solid ${palette.stroke}`, borderRadius: 28, boxShadow: shadow }}>
          <Body data={d} color={palette.text} />
        </div>
        <Handles threats={d.threats} />
      </div>
    );
  }

  if (d.c4Type === 'Database') {
    return (
      <div className="group relative" style={{ width: C4_NODE_WIDTH }}>
        <div className="relative px-4 pt-9 pb-5" style={{ background: palette.fill, border: `2px solid ${palette.stroke}`, borderRadius: `${C4_NODE_WIDTH / 2}px / 22px`, boxShadow: shadow }}>
          <div className="absolute left-[-2px] right-[-2px] top-[-2px] h-[44px] pointer-events-none" style={{ border: `2px solid ${palette.stroke}`, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <Body data={d} color={palette.text} />
        </div>
        <Handles threats={d.threats} />
      </div>
    );
  }

  return (
    <div className="group relative px-4 py-4" style={{
      width: C4_NODE_WIDTH, background: palette.fill, border: `2px solid ${palette.stroke}`,
      borderRadius: d.c4Type === 'Component' ? 6 : 10, boxShadow: shadow,
      borderStyle: d.external && d.c4Type !== 'System' ? 'dashed' : 'solid',
    }}>
      <Body data={d} color={palette.text} />
      <Handles threats={d.threats} />
    </div>
  );
});
C4Node.displayName = 'C4Node';

export const C4BoundaryNode = memo(({ data }: NodeProps) => {
  const d = data as { label: string; kind: string; width: number; height: number };
  return (
    <div className="relative pointer-events-none" style={{
      width: d.width, height: d.height, border: '2px dashed rgba(100, 116, 139, 0.75)', borderRadius: 14,
      background: 'rgba(100, 116, 139, 0.04)',
    }}>
      <div className="absolute left-4 bottom-3 text-left">
        <div className="text-[13px] font-semibold text-foreground">{d.label}</div>
        <div className="text-[10px] text-muted-foreground">[{d.kind}]</div>
      </div>
    </div>
  );
});
C4BoundaryNode.displayName = 'C4BoundaryNode';

export interface C4ThreatData extends Record<string, unknown> {
  threat: Threat;
  onOpen: (id: string) => void;
}

export const C4ThreatNode = memo(({ data }: NodeProps) => {
  const { threat, onOpen } = data as C4ThreatData;
  const color = THREAT_COLORS[threat.severity] || THREAT_COLORS.Unrated;
  return (
    <div className="relative w-[220px] h-[124px]">
      <button type="button" className="nodrag nopan w-full h-full rounded-xl border-l-4 bg-card p-3 text-left shadow-md border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        style={{ borderLeftColor: color }} onClick={() => onOpen(threat.id)}
        aria-label={`Open threat ${threat.id}: ${threat.title}`}>
        <span className="flex items-center justify-between gap-2 text-[10px] font-bold" style={{ color }}>
          <span className="flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> {threat.severity || 'Unrated'}</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
        <span className="block mt-1 text-[10px] font-mono text-muted-foreground truncate" title={threat.id}>{threat.id}</span>
        <span className="block mt-1 text-xs font-semibold text-foreground line-clamp-2" title={threat.title}>{threat.title}</span>
      </button>
      <Handles />
    </div>
  );
});
C4ThreatNode.displayName = 'C4ThreatNode';

export interface C4EdgeData extends Record<string, unknown> {
  label?: string;
  protocol?: string;
  threats?: Threat[];
  annotation?: boolean;
  onOpen?: (id: string) => void;
  route?: ReturnType<typeof routeDiagramEdge>;
  blocked?: boolean;
}

export const C4Edge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) => {
  const [fallbackPath, fallbackX, fallbackY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 24 });
  const d = (data || {}) as C4EdgeData;
  const path = d.route?.path || fallbackPath;
  const labelX = d.route?.labelX ?? fallbackX, labelY = d.route?.labelY ?? fallbackY;
  const color = d.threats?.length ? threatColor(d.threats) : '#64748b';
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={28} style={{
        stroke: selected ? '#f59e0b' : color, strokeWidth: d.threats?.length ? 2.5 : 1.5,
        strokeDasharray: d.annotation ? '6 4' : undefined,
      }} />
      {(d.label || d.protocol || !!d.threats?.length) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan nowheel absolute pointer-events-auto bg-card/95 border border-border/60 rounded-md px-2 py-1 text-center shadow-sm max-w-[190px] max-h-32 overflow-y-auto"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {d.label && <div className="text-[10.5px] font-medium leading-tight text-foreground">{d.label}</div>}
            {d.protocol && <div className="text-[9.5px] text-muted-foreground leading-tight">[{d.protocol}]</div>}
            {d.blocked && <div className="text-[9px] text-amber-600">Route obstructed: use Auto Layout</div>}
            {d.threats?.map(threat => (
              <button type="button" key={threat.id} className="block w-full text-left text-[10px] font-bold rounded px-1 py-1 hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                style={{ color: THREAT_COLORS[threat.severity] || THREAT_COLORS.Unrated }}
                aria-label={`Open ${d.annotation ? 'component' : 'flow'} threat ${threat.id}: ${threat.title}`}
                title={`${threat.severity}: ${threat.title}`}
                onClick={event => { event.stopPropagation(); d.onOpen?.(threat.id); }}>
                <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3 shrink-0" /> {threat.id} · {threat.severity}</span>
              </button>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
C4Edge.displayName = 'C4Edge';
