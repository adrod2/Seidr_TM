import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  applyNodeChanges,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  Node,
  Edge,
  Position,
} from '@xyflow/react';
import { Plus, Save, X, LayoutTemplate, Workflow, FileCode2 } from 'lucide-react';
import { C4Node, C4BoundaryNode, C4Edge, C4_NODE_WIDTH, C4_PALETTE, paletteFor, C4NodeData } from './C4Node';
import { C4MermaidView } from './C4MermaidView';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { LAYOUT_MODES, computeLayout, Positions } from '@/lib/c4Layout';
import { C4Level, MermaidDirection, buildC4Mermaid, displayProtocol, isInsideSystem, systemName, toC4Element, visibleComponents, visibleRelations } from '@/lib/c4Model';
import '@xyflow/react/dist/style.css';

const BOUNDARY_ID = '__system_boundary';
const MERMAID_DIRECTIONS: { id: MermaidDirection; label: string }[] = [
  { id: 'TB', label: 'Top → bottom' },
  { id: 'LR', label: 'Left → right' },
  { id: 'BT', label: 'Bottom → top' },
  { id: 'RL', label: 'Right → left' },
];

const estimateSize = (c4Type: string) => ({
  width: C4_NODE_WIDTH,
  height: c4Type === 'Person' ? 210 : c4Type === 'Database' ? 200 : 175,
});

const savedPosition = (component: any, level: C4Level) =>
  component.metadata?.positions?.[level] ?? component.metadata?.position;

const withPositions = (srg: any, level: C4Level, positions: Positions) => ({
  ...srg,
  components: srg.components.map((c: any) => positions[c.id] ? {
    ...c,
    metadata: { ...c.metadata, positions: { ...c.metadata?.positions, [level]: positions[c.id] } },
  } : c),
});

const sizeOf = (node: Node) => ({
  width: node.measured?.width ?? estimateSize(String(node.data?.c4Type)).width,
  height: node.measured?.height ?? estimateSize(String(node.data?.c4Type)).height,
});

// Connect each relationship through the facing sides of the two elements for clean orthogonal routing.
const pickHandles = (source: Node, target: Node) => {
  const s = sizeOf(source);
  const t = sizeOf(target);
  const dx = (target.position.x + t.width / 2) - (source.position.x + s.width / 2);
  const dy = (target.position.y + t.height / 2) - (source.position.y + s.height / 2);
  if (Math.abs(dy) >= Math.abs(dx) * 0.75) {
    return dy >= 0
      ? { sourceHandle: `${Position.Bottom}-s`, targetHandle: `${Position.Top}-t` }
      : { sourceHandle: `${Position.Top}-s`, targetHandle: `${Position.Bottom}-t` };
  }
  return dx >= 0
    ? { sourceHandle: `${Position.Right}-s`, targetHandle: `${Position.Left}-t` }
    : { sourceHandle: `${Position.Left}-s`, targetHandle: `${Position.Right}-t` };
};

const C4ArchitectureContent = ({ srg, modelId }: { srg?: any, modelId?: string }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node, c4Boundary: C4BoundaryNode }), []);
  const edgeTypes = useMemo(() => ({ c4Edge: C4Edge }), []);
  const { fitView, getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const [draftSrg, setDraftSrg] = useState<any>(() => ({ components: [], edges: [], trustBoundaries: [], ...srg }));
  const draftRef = useRef(draftSrg);
  draftRef.current = draftSrg;
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [activeLevel, setActiveLevel] = useState<C4Level>('L2');
  const [view, setView] = useState<'interactive' | 'mermaid'>('interactive');
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [mermaidDirIndex, setMermaidDirIndex] = useState(0);
  const [pendingLayout, setPendingLayout] = useState(false);
  const [isLayingOut, setIsLayingOut] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', technology: '' });

  // Rebuild only when elements/relationships change, not when positions move.
  const structureKey = useMemo(() => JSON.stringify([
    (draftSrg.components || []).map(({ metadata, ...rest }: any) => rest),
    draftSrg.edges || [],
  ]), [draftSrg]);

  useEffect(() => {
    const current = draftRef.current;
    const components = visibleComponents(current, activeLevel);
    const elements = components.map(toC4Element);
    const ids = new Set(elements.map((e) => e.id));
    let needsLayout = false;

    setNodes(elements.map((e, i) => {
      const pos = savedPosition(components[i], activeLevel);
      if (!pos) needsLayout = true;
      const data: C4NodeData = {
        label: e.name, c4Type: e.c4Type, external: e.external, technology: e.technology,
        description: e.description, componentId: e.id,
      };
      return { id: e.id, type: 'c4Node', position: pos || { x: (i % 4) * 320, y: Math.floor(i / 4) * 260 }, data };
    }));
    setEdges(visibleRelations(current, ids).map((r: any) => ({
      id: String(r.id),
      source: r.sourceId,
      target: r.targetId,
      type: 'c4Edge',
      data: { label: r.label, protocol: displayProtocol(r.protocol) },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 },
    })));

    if (needsLayout) setPendingLayout(true);
    else setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 80);
  }, [structureKey, activeLevel, setNodes, setEdges, fitView]);

  const applyLayout = useCallback(async (index: number, announce: boolean) => {
    const mode = LAYOUT_MODES[index % LAYOUT_MODES.length];
    const current = getNodes().filter((n) => n.type === 'c4Node');
    if (!current.length) return;
    setIsLayingOut(true);
    try {
      const layoutNodes = current.map((n) => ({ id: n.id, c4Type: String(n.data.c4Type), ...sizeOf(n) }));
      const ids = new Set(current.map((n) => n.id));
      const relations = visibleRelations(draftRef.current, ids).map((r) => ({ source: r.sourceId, target: r.targetId }));
      const positions = await computeLayout(mode.id, layoutNodes, relations);
      setNodes((nds) => nds.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
      setDraftSrg((prev: any) => withPositions(prev, activeLevel, positions));
      if (announce) {
        setDirty(true);
        toast.success(`Layout: ${mode.label}`, { description: `Style ${index % LAYOUT_MODES.length + 1} of ${LAYOUT_MODES.length}. Click Auto Layout again for the next arrangement.` });
      }
      setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 60);
    } catch (error: any) {
      toast.error(`Auto layout failed: ${error.message}`);
    } finally {
      setIsLayingOut(false);
    }
  }, [activeLevel, fitView, getNodes, setNodes]);

  useEffect(() => {
    if (pendingLayout && nodesInitialized) {
      setPendingLayout(false);
      applyLayout(layoutIndex, false);
    }
  }, [pendingLayout, nodesInitialized, applyLayout, layoutIndex]);

  const handleAutoLayout = () => {
    if (view === 'mermaid') {
      const next = (mermaidDirIndex + 1) % MERMAID_DIRECTIONS.length;
      setMermaidDirIndex(next);
      toast.success(`Mermaid layout: ${MERMAID_DIRECTIONS[next].label}`);
      return;
    }
    const next = (layoutIndex + 1) % LAYOUT_MODES.length;
    setLayoutIndex(next);
    applyLayout(next, true);
  };

  const onNodesChangeHandler = useCallback((changes: any[]) => {
    const relevant = changes.filter((c) => c.id !== BOUNDARY_ID);
    if (relevant.length) setNodes((nds) => applyNodeChanges(relevant, nds));
  }, [setNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, _node: Node, dragged: Node[]) => {
    const positions: Positions = {};
    for (const n of dragged) if (n.id !== BOUNDARY_ID) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    setDraftSrg((prev: any) => withPositions(prev, activeLevel, positions));
    setDirty(true);
  }, [activeLevel]);

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || params.source === params.target) return;
    const newEdge = { id: `e-${Date.now()}`, sourceId: params.source, targetId: params.target, label: 'Communicates with' };
    setDraftSrg((prev: any) => ({ ...prev, edges: [...(prev.edges || []), newEdge] }));
    setDirty(true);
    toast.success('Relationship added');
  }, []);

  const handleAddNode = () => {
    const current = getNodes().filter((n) => n.type === 'c4Node');
    const maxX = current.length ? Math.max(...current.map((n) => n.position.x + sizeOf(n).width)) : 0;
    const minY = current.length ? Math.min(...current.map((n) => n.position.y)) : 0;
    const c4Type = activeLevel === 'L3' ? 'Component' : activeLevel === 'L2' ? 'Container' : 'System';
    const newNode = {
      id: `NEW-${Date.now().toString(36).toUpperCase()}`,
      name: `New ${c4Type}`,
      type: 'Process',
      c4Type,
      c4Level: activeLevel,
      description: 'Double-click to edit',
      metadata: { positions: { [activeLevel]: { x: maxX + 100, y: minY } } },
    };
    setDraftSrg((prev: any) => ({ ...prev, components: [...prev.components, newNode] }));
    setDirty(true);
    toast.success('Element added to diagram');
  };

  const handleSaveToDB = async () => {
    if (!modelId) return;
    try {
      await db.threatModels.update(modelId, { srg: draftSrg });
      setDirty(false);
      toast.success('Architecture changes saved to database!');
    } catch {
      toast.error('Failed to save diagram');
    }
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    if (node.id === BOUNDARY_ID) return;
    const component = draftSrg.components.find((c: any) => c.id === node.id);
    setSelectedNodeId(node.id);
    setEditForm({
      name: component?.name || '',
      description: component?.description || '',
      technology: component?.technology || '',
    });
  };

  const saveNodeEdits = () => {
    if (!selectedNodeId) return;
    setDraftSrg((prev: any) => ({
      ...prev,
      components: prev.components.map((c: any) => c.id === selectedNodeId
        ? { ...c, name: editForm.name, description: editForm.description, technology: editForm.technology.trim() || undefined }
        : c),
    }));
    setSelectedNodeId(null);
    setDirty(true);
    toast.success('Element updated');
  };

  // System boundary drawn around the internal containers/components, following C4 notation.
  const boundaryLabel = useMemo(() => systemName(draftSrg), [draftSrg]);
  const renderedNodes = useMemo(() => {
    const inside = nodes.filter((n) => n.type === 'c4Node' && isInsideSystem(n.data as any));
    if (!inside.length || activeLevel === 'L1') return nodes;
    const pad = 36;
    const minX = Math.min(...inside.map((n) => n.position.x)) - pad;
    const minY = Math.min(...inside.map((n) => n.position.y)) - pad;
    const maxX = Math.max(...inside.map((n) => n.position.x + sizeOf(n).width)) + pad;
    const maxY = Math.max(...inside.map((n) => n.position.y + sizeOf(n).height)) + pad + 34;
    const boundary: Node = {
      id: BOUNDARY_ID, type: 'c4Boundary', position: { x: minX, y: minY },
      data: { label: boundaryLabel, kind: 'Software System', width: maxX - minX, height: maxY - minY },
      draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -1,
    };
    return [boundary, ...nodes];
  }, [nodes, activeLevel, boundaryLabel]);

  const renderedEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      return s && t ? { ...e, ...pickHandles(s, t) } : e;
    });
  }, [edges, nodes]);

  const mermaidDefinition = useMemo(() => {
    const components = visibleComponents(draftSrg, activeLevel);
    const elements = components.map(toC4Element);
    const relations = visibleRelations(draftSrg, new Set(elements.map((e) => e.id)));
    return buildC4Mermaid(elements, relations, {
      direction: MERMAID_DIRECTIONS[mermaidDirIndex].id,
      boundaryLabel: activeLevel === 'L1' ? undefined : boundaryLabel,
    });
  }, [draftSrg, activeLevel, mermaidDirIndex, boundaryLabel]);

  const currentLayoutLabel = view === 'mermaid' ? MERMAID_DIRECTIONS[mermaidDirIndex].label : LAYOUT_MODES[layoutIndex].label;

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[500px]">
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-2 justify-between items-center pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <div className="flex gap-1 bg-card/80 backdrop-blur-md p-1.5 rounded-2xl border border-border/50 shadow-sm">
            {(['L1', 'L2', 'L3'] as C4Level[]).map((level) => (
              <button
                key={level}
                onClick={() => setActiveLevel(level)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeLevel === level ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {level === 'L1' ? 'L1 Context' : level === 'L2' ? 'L2 Container' : 'L3 Component'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-card/80 backdrop-blur-md p-1.5 rounded-2xl border border-border/50 shadow-sm">
            <button onClick={() => setView('interactive')} title="Interactive editor"
              className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${view === 'interactive' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Workflow className="h-4 w-4" /> Interactive
            </button>
            <button onClick={() => setView('mermaid')} title="Mermaid rendering with SVG/PNG export"
              className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${view === 'mermaid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <FileCode2 className="h-4 w-4" /> Mermaid
            </button>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={handleAutoLayout}
            disabled={isLayingOut}
            title={`Current: ${currentLayoutLabel}. Click to cycle arrangements.`}
            className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
          >
            <LayoutTemplate className="h-4 w-4" /> Auto Layout
            <span className="text-[11px] text-muted-foreground font-normal hidden xl:inline">· {currentLayoutLabel}</span>
          </button>
          {view === 'interactive' && (
            <button
              onClick={handleAddNode}
              className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Element
            </button>
          )}
          <button
            onClick={handleSaveToDB}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
          >
            <Save className="h-4 w-4" /> Save Diagram{dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      {selectedNodeId && view === 'interactive' && (
        <div className="absolute top-20 right-4 z-20 w-80 bg-card border border-border/50 rounded-3xl shadow-xl p-5 pointer-events-auto">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold">Edit Element</h4>
            <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary/50">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">Name</label>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">Technology</label>
              <input type="text" value={editForm.technology} placeholder="e.g. React SPA, Node.js, PostgreSQL"
                onChange={(e) => setEditForm({ ...editForm, technology: e.target.value })}
                className="w-full bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">Description</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] resize-none" />
            </div>
            <button onClick={saveNodeEdits}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-colors">
              Apply Changes
            </button>
          </div>
        </div>
      )}

      {view === 'mermaid' ? (
        <C4MermaidView definition={mermaidDefinition} fileName={`c4-${activeLevel.toLowerCase()}-${modelId || 'diagram'}`} />
      ) : (
        <ReactFlow
          colorMode={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          nodes={renderedNodes}
          edges={renderedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChangeHandler}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          minZoom={0.1}
          fitView
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} className="opacity-40" color="hsl(var(--muted-foreground))" gap={22} size={1} />
          <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden m-4" />
          <MiniMap pannable zoomable className="!bg-card/90 !border !border-border/50 rounded-xl overflow-hidden"
            nodeColor={(n) => n.type === 'c4Boundary' ? 'transparent' : paletteFor(String(n.data.c4Type), Boolean(n.data.external)).fill}
            nodeStrokeColor={(n) => n.type === 'c4Boundary' ? '#94a3b8' : 'transparent'} />
          <Panel position="bottom-center" className="!mb-4">
            <div className="flex flex-wrap gap-3 items-center bg-card/90 backdrop-blur border border-border/50 rounded-xl px-3 py-2 shadow-sm text-[11px] text-muted-foreground">
              {[['Person', C4_PALETTE.Person], ['Software System', C4_PALETTE.System], ['External System', C4_PALETTE.External],
                ['Container', C4_PALETTE.Container], ['Component', C4_PALETTE.Component]].map(([label, p]: any) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: p.fill, border: `1px solid ${p.stroke}` }} /> {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-slate-500" /> Relationship</span>
            </div>
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
};

export const C4ArchitectureTab = (props: any) => (
  <ReactFlowProvider>
    <C4ArchitectureContent {...props} />
  </ReactFlowProvider>
);
