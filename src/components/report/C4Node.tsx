import React, { memo } from 'react';
import { Handle, Position, NodeProps, EdgeProps, EdgeLabelRenderer, BaseEdge, getSmoothStepPath } from '@xyflow/react';

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
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const handleClass = '!w-2 !h-2 !min-w-0 !min-h-0 !border-0 !bg-slate-500/70 opacity-0 group-hover:opacity-100 transition-opacity';

const Handles = () => (
  <>
    {SIDES.map((side) => (
      <React.Fragment key={side}>
        <Handle type="target" id={`${side}-t`} position={side} className={handleClass} />
        <Handle type="source" id={`${side}-s`} position={side} className={handleClass} />
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
        <Handles />
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
        <Handles />
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
      <Handles />
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

export const C4Edge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) => {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 24 });
  const d = (data || {}) as { label?: string; protocol?: string };
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{
        stroke: selected ? '#f59e0b' : '#64748b', strokeWidth: selected ? 2.25 : 1.5, strokeDasharray: '6 4',
      }} />
      {(d.label || d.protocol) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute pointer-events-auto bg-card/95 border border-border/60 rounded-md px-2 py-1 text-center shadow-sm max-w-[180px]"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {d.label && <div className="text-[10.5px] font-medium leading-tight text-foreground">{d.label}</div>}
            {d.protocol && <div className="text-[9.5px] text-muted-foreground leading-tight">[{d.protocol}]</div>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
C4Edge.displayName = 'C4Edge';
