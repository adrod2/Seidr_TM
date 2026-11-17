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
  Node,
  NodeChange,
  Edge,
  Position,
} from '@xyflow/react';
import { Plus, Save, X, LayoutTemplate, ShieldAlert, Focus, ListFilter } from 'lucide-react';
import { C4Node, C4BoundaryNode, C4Edge, C4ThreatNode, C4_NODE_WIDTH, C4_PALETTE, paletteFor, type C4NodeData, type C4EdgeData } from './C4Node';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { LAYOUT_MODES, computeLayout, Positions } from '@/lib/c4Layout';
import { type C4Level, displayProtocol, systemName, toC4Element, visibleComponents, visibleRelations } from '@/lib/c4Model';
import type { SRGComponent, SystemRepresentationGraph, Threat } from '@/lib/backend/types';
import { mapThreats, visibleThreatTargets, threatColor, THREAT_COLORS } from '@/lib/threatMap';
import { placeCallouts, routeDiagramEdge, type DiagramBox, type DiagramPort } from '@/lib/c4Routes';
import '@xyflow/react/dist/style.css';

const BOUNDARY_ID = '__system_boundary';
const EMPTY_THREATS: Threat[] = [];

interface C4ArchitectureProps {
  srg?: SystemRepresentationGraph;
  modelId: string;
  threats?: Threat[];
  onThreatSelect: (id: string) => void;
}

type InspectedTarget = { kind: 'component' | 'flow'; id: string } | null;

const estimateSize = (c4Type: string) => ({
  width: C4_NODE_WIDTH,
  height: c4Type === 'Person' ? 210 : c4Type === 'Database' ? 200 : 175,
});

const savedPosition = (component: SRGComponent, level: C4Level) =>
  component.metadata?.positions?.[level] ?? component.metadata?.position;

const withPositions = (srg: SystemRepresentationGraph, level: C4Level, positions: Positions) => ({
  ...srg,
  components: srg.components.map(c => positions[c.id] ? {
    ...c,
    metadata: { ...c.metadata, positions: { ...c.metadata?.positions, [level]: positions[c.id] } },
  } : c),
});

const sizeOf = (node: Node) => ({
  width: node.measured?.width ?? (node.type === 'c4Threat' ? 220 : estimateSize(String(node.data?.c4Type)).width),
  height: node.measured?.height ?? (node.type === 'c4Threat' ? 124 : estimateSize(String(node.data?.c4Type)).height),
});

const boxOf = (node: Node): DiagramBox => ({ ...node.position, ...sizeOf(node) });
const portOf = (node: Node, handle: string): DiagramPort => {
  const side = handle.split('-')[0] as DiagramPort['side'];
  const box = boxOf(node);
  const threats = (node.data as C4NodeData).threats || [];
  const reference = handle.split('-threat-')[1];
  const index = reference ? threats.findIndex(threat => encodeURIComponent(threat.id) === reference) : -1;
  const fraction = index < 0 ? 0.5 : (index + 1) / (threats.length + 1);
  return {
    x: box.x + (side === 'left' ? 0 : side === 'right' ? box.width : box.width * fraction),
    y: box.y + (side === 'top' ? 0 : side === 'bottom' ? box.height : box.height * fraction), side,
  };
};
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

const C4ArchitectureContent = ({ srg, modelId, threats = EMPTY_THREATS, onThreatSelect }: C4ArchitectureProps) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node, c4Boundary: C4BoundaryNode, c4Threat: C4ThreatNode }), []);
  const edgeTypes = useMemo(() => ({ c4Edge: C4Edge }), []);
  const { fitView, getNodes } = useReactFlow();
  const layoutRun = useRef(0);

  const [draftSrg, setDraftSrg] = useState<SystemRepresentationGraph>(() => ({ components: [], edges: [], trustBoundaries: [], ...srg }));
  const draftRef = useRef(draftSrg);
  draftRef.current = draftSrg;
  const [nodes, setNodes] = useNodesState<Node>([]);
  const nodesInitialized = nodes.length > 0 && nodes.every(node => !!node.measured?.width && !!node.measured?.height);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [activeLevel, setActiveLevel] = useState<C4Level>('L2');
  const levelRef = useRef(activeLevel);
  levelRef.current = activeLevel;
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [pendingLayout, setPendingLayout] = useState(false);
  const [isLayingOut, setIsLayingOut] = useState(false);
  const [pendingFit, setPendingFit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showThreats, setShowThreats] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [severity, setSeverity] = useState('All severities');
  const [inspected, setInspected] = useState<InspectedTarget>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const mappings = useMemo(() => mapThreats(draftSrg, threats), [draftSrg, threats]);
  const filteredMappings = useMemo(() => mappings.filter(mapping =>
    severity === 'All severities' || mapping.threat.severity === severity), [mappings, severity]);
  const inspect = useCallback((target: InspectedTarget) => { setInspected(target); setShowInspector(true); }, []);
  const persistDiagram = useCallback(async () => {
    try {
      const updated = await db.threatModels.update(modelId, { srg: draftRef.current });
      if (!updated) throw new Error('The assessment no longer exists.');
      setDirty(false);
      return true;
    } catch (error) {
      toast.error(`Failed to save diagram: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [modelId]);
  const openThreat = useCallback(async (id: string) => {
    if (dirty) {
      if (!await persistDiagram()) return;
      toast.success('Diagram changes saved before opening the finding.');
    }
    onThreatSelect(id);
  }, [dirty, persistDiagram, onThreatSelect]);
  const inspectedMappings = useMemo(() => filteredMappings.filter(mapping => !inspected
    || (inspected.kind === 'component' ? mapping.componentIds.includes(inspected.id) : mapping.flowIds.includes(inspected.id))),
  [filteredMappings, inspected]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', technology: '' });

  const structureKey = useMemo(() => JSON.stringify([
    (draftSrg.components || []).map(component => ({ ...component, metadata: undefined })),
    draftSrg.edges || [],
  ]), [draftSrg]);

  useEffect(() => {
    const current = draftRef.current;
    const components: SRGComponent[] = visibleComponents(current, activeLevel);
    const elements = components.map(toC4Element);
    const ids = new Set(elements.map((e) => e.id));
    const needsLayout = components.some(component => !savedPosition(component, activeLevel));

    setNodes(previous => elements.map((e, i) => {
      const pos = savedPosition(components[i], activeLevel);
      const data: C4NodeData = {
        label: e.name, c4Type: e.c4Type, external: e.external, technology: e.technology,
        description: e.description, componentId: e.id,
        threats: showThreats ? filteredMappings.filter(mapping => mapping.componentIds.includes(e.id)).map(mapping => mapping.threat) : [],
        onInspect: () => inspect({ kind: 'component', id: e.id }),
      };
      return { id: e.id, type: 'c4Node', position: pos || { x: (i % 4) * 320, y: Math.floor(i / 4) * 260 },
        measured: previous.find(node => node.id === e.id)?.measured, data };
    }));
    setEdges(visibleRelations(current, ids).map(r => ({
      id: String(r.id),
      source: r.sourceId,
      target: r.targetId,
      type: 'c4Edge',
      data: { label: r.label || r.id, protocol: displayProtocol(r.protocol),
        threats: showThreats ? filteredMappings.filter(mapping => mapping.flowIds.includes(r.id)).map(mapping => mapping.threat) : [],
        onOpen: openThreat },
      markerEnd: { type: MarkerType.ArrowClosed,
        color: showThreats ? threatColor(filteredMappings.filter(mapping => mapping.flowIds.includes(r.id)).map(mapping => mapping.threat)) : '#64748b',
        width: 18, height: 18 },
    })));

    if (needsLayout) setPendingLayout(true);
    else setPendingFit(true);
  }, [structureKey, activeLevel, setNodes, setEdges, fitView, filteredMappings, showThreats, inspect, openThreat]);

  const applyLayout = useCallback(async (index: number, announce: boolean) => {
    const run = ++layoutRun.current;
    const mode = LAYOUT_MODES[index % LAYOUT_MODES.length];
    const current = getNodes().filter((n) => n.type === 'c4Node');
    if (!current.length) return;
    setIsLayingOut(true);
    try {
      // Reserve corridors for relationship labels as well as the measured component boxes.
      const layoutNodes = current.map(n => ({
        id: n.id, c4Type: String(n.data.c4Type), width: sizeOf(n).width + 140, height: sizeOf(n).height + 90,
      }));
      const ids = new Set(current.map((n) => n.id));
      const relations = visibleRelations(draftRef.current, ids).map((r) => ({ source: r.sourceId, target: r.targetId }));
      const positions = await computeLayout(mode.id, layoutNodes, relations);
      if (run !== layoutRun.current || activeLevel !== levelRef.current) return;
      setNodes((nds) => nds.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
      setDraftSrg(prev => withPositions(prev, activeLevel, positions));
      if (announce) {
        setDirty(true);
        toast.success(`Layout: ${mode.label}`, { description: `Style ${index % LAYOUT_MODES.length + 1} of ${LAYOUT_MODES.length}. Click Auto Layout again for the next arrangement.` });
      }
      setPendingFit(true);
    } catch (error) {
      toast.error(`Auto layout failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (run === layoutRun.current) setIsLayingOut(false);
    }
  }, [activeLevel, fitView, getNodes, setNodes]);

  useEffect(() => () => { layoutRun.current++; }, []);

  useEffect(() => {
    if (pendingLayout && nodesInitialized) {
      setPendingLayout(false);
      applyLayout(layoutIndex, false);
    }
  }, [pendingLayout, nodesInitialized, applyLayout, layoutIndex]);

  const handleAutoLayout = () => {
    const next = (layoutIndex + 1) % LAYOUT_MODES.length;
    setLayoutIndex(next);
    applyLayout(next, true);
  };

  const onNodesChangeHandler = useCallback((changes: NodeChange[]) => {
    const relevant = changes.filter(change => change.type !== 'add' && change.id !== BOUNDARY_ID && !change.id.startsWith('__threat:'));
    if (relevant.length) setNodes((nds) => applyNodeChanges(relevant, nds));
  }, [setNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, _node: Node, dragged: Node[]) => {
    const positions: Positions = {};
    for (const n of dragged) if (n.id !== BOUNDARY_ID) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    setDraftSrg(prev => withPositions(prev, activeLevel, positions));
    setDirty(true);
  }, [activeLevel]);

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || params.source === params.target) return;
    const newEdge = { id: `e-${Date.now()}`, sourceId: params.source, targetId: params.target, label: 'Communicates with' };
    setDraftSrg(prev => ({ ...prev, edges: [...(prev.edges || []), newEdge] }));
    setDirty(true);
    toast.success('Relationship added');
  }, []);

  const handleAddNode = () => {
    const current = getNodes().filter((n) => n.type === 'c4Node');
    const maxX = current.length ? Math.max(...current.map((n) => n.position.x + sizeOf(n).width)) : 0;
    const minY = current.length ? Math.min(...current.map((n) => n.position.y)) : 0;
    const c4Type = activeLevel === 'L3' ? 'Component' : activeLevel === 'L2' ? 'Container' : 'System';
    const newNode: SRGComponent = {
      id: `NEW-${Date.now().toString(36).toUpperCase()}`,
      name: `New ${c4Type}`,
      type: 'Process',
      c4Type,
      c4Level: activeLevel,
      description: 'Double-click to edit',
      metadata: { positions: { [activeLevel]: { x: maxX + 100, y: minY } } },
    };
    setDraftSrg(prev => ({ ...prev, components: [...prev.components, newNode] }));
    setDirty(true);
    toast.success('Element added to diagram');
  };

  const handleSaveToDB = async () => {
    if (await persistDiagram()) toast.success('Architecture changes saved to database!');
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    if (node.type !== 'c4Node') return;
    const component = draftSrg.components.find(c => c.id === node.id);
    setSelectedNodeId(node.id);
    setEditForm({
      name: component?.name || '',
      description: component?.description || '',
      technology: component?.technology || '',
    });
  };

  const saveNodeEdits = () => {
    if (!selectedNodeId) return;
    setDraftSrg(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === selectedNodeId
        ? { ...c, name: editForm.name, description: editForm.description, technology: editForm.technology.trim() || undefined }
        : c),
    }));
    setSelectedNodeId(null);
    setDirty(true);
    toast.success('Element updated');
  };

  useEffect(() => {
    if (!pendingFocus || !nodes.some(node => node.id === pendingFocus)) return;
    const frame = requestAnimationFrame(() => {
      fitView({ nodes: [{ id: pendingFocus }], padding: 0.6, duration: 400, maxZoom: 1.2 });
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFocus, nodes, fitView]);

  const focusThreat = (mapping: typeof mappings[number]) => {
    for (const level of [activeLevel, 'L3', 'L2', 'L1'] as C4Level[]) {
      const visible: SRGComponent[] = visibleComponents(draftSrg, level);
      const targets = visibleThreatTargets(mapping, draftSrg, new Set(visible.map(component => component.id)));
      const flow = draftSrg.edges.find(edge => targets.flowIds.includes(edge.id));
      const id = targets.componentIds[0] || flow?.sourceId;
      if (id) {
        setActiveLevel(level);
        inspect(targets.componentIds.length ? { kind: 'component', id } : { kind: 'flow', id: flow!.id });
        setPendingFocus(id);
        return;
      }
    }
    toast.info('No visible architecture target is recorded for this finding.');
  };

  const threatAnnotations = useMemo(() => {
    if (!showThreats || !nodes.length) return { nodes: [] as Node[], edges: [] as Edge[] };
    const ids = new Set(nodes.map(node => node.id));
    const mapped = inspectedMappings.filter(mapping => mapping.componentIds.some(id => ids.has(id)));
    const positions = placeCallouts(mapped.map(mapping => boxOf(nodes.find(node => mapping.componentIds.includes(node.id))!)), nodes.map(boxOf));
    return {
      nodes: mapped.map((mapping, index): Node => ({
        id: `__threat:${index}:${mapping.threat.id}`, type: 'c4Threat',
        position: positions[index], data: { threat: mapping.threat, onOpen: openThreat },
        draggable: false, connectable: false, selectable: false,
        ariaLabel: `Threat ${mapping.threat.id}: ${mapping.threat.title}`,
      })),
      edges: mapped.flatMap((mapping, index) => mapping.componentIds.filter(id => ids.has(id)).map((target): Edge => ({
        id: `__threat:${index}:${mapping.threat.id}:${target}`,
        source: `__threat:${index}:${mapping.threat.id}`, target,
        type: 'c4Edge', zIndex: 2, data: { annotation: true, threats: [mapping.threat], onOpen: openThreat },
        focusable: true, ariaLabel: `Open threat ${mapping.threat.id} affecting ${target}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: threatColor([mapping.threat]), width: 18, height: 18 },
      }))),
    };
  }, [nodes, inspectedMappings, openThreat, showThreats]);

  // System boundary drawn around the internal containers/components, following C4 notation.
  const boundaryLabel = useMemo(() => systemName(draftSrg), [draftSrg]);
  const renderedNodes = useMemo(() => {
    const inside = nodes.filter(n => n.type === 'c4Node' && !n.data.external && ['Container', 'Database', 'Component'].includes(String(n.data.c4Type)));
    if (!inside.length || activeLevel === 'L1') return [...nodes, ...threatAnnotations.nodes];
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
    return [boundary, ...nodes, ...threatAnnotations.nodes];
  }, [nodes, activeLevel, boundaryLabel, threatAnnotations.nodes]);

  const renderedEdges = useMemo(() => {
    const allNodes = [...nodes, ...threatAnnotations.nodes];
    const byId = new Map(allNodes.map(n => [n.id, n]));
    const obstacles = allNodes.map(boxOf);
    return [...edges, ...threatAnnotations.edges].map(e => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) return e;
      const handles = pickHandles(s, t);
      const data = e.data as C4EdgeData;
      if (data.annotation && data.threats?.[0]) {
        handles.targetHandle = `${handles.targetHandle.split('-')[0]}-threat-${encodeURIComponent(data.threats[0].id)}`;
      }
      const route = routeDiagramEdge(portOf(s, handles.sourceHandle), portOf(t, handles.targetHandle), obstacles);
      return { ...e, ...handles, data: { ...e.data, route, blocked: !route } };
    });
  }, [edges, nodes, threatAnnotations]);
  const visibleIds = new Set(nodes.map(node => node.id));
  const currentLayoutLabel = LAYOUT_MODES[layoutIndex].label;
  const inspectedLabel = !inspected ? 'Threat explorer' : inspected.kind === 'component'
    ? draftSrg.components.find(component => component.id === inspected.id)?.name || inspected.id
    : draftSrg.edges.find(edge => edge.id === inspected.id)?.label || inspected.id;

  useEffect(() => {
    if (!pendingFit || !nodesInitialized || pendingLayout || isLayingOut || pendingFocus) return;
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 400 });
      setPendingFit(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFit, nodesInitialized, pendingLayout, isLayingOut, pendingFocus, fitView]);

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[560px] flex flex-col min-w-0">
      <div className="p-3 border-b border-border/50 flex flex-wrap gap-2 justify-between items-center bg-card/80">
        <div className="flex gap-2 pointer-events-auto">
          <div className="flex gap-1 bg-card/80 backdrop-blur-md p-1.5 rounded-2xl border border-border/50 shadow-sm">
            {(['L1', 'L2', 'L3'] as C4Level[]).map((level) => (
              <button
                key={level}
                onClick={() => { setActiveLevel(level); setInspected(null); }}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeLevel === level ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {level === 'L1' ? 'L1 Context' : level === 'L2' ? 'L2 Container' : 'L3 Component'}
              </button>
            ))}
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
            <button
              onClick={handleAddNode}
              className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Element
            </button>
          <button
            onClick={handleSaveToDB}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
          >
            <Save className="h-4 w-4" /> Save Diagram{dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 flex flex-wrap gap-3 items-center border-b border-border/50 text-xs">
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showThreats} onChange={event => setShowThreats(event.target.checked)} /> Show threat arrows</label>
        <select aria-label="Filter diagram threats by severity" value={severity} onChange={event => setSeverity(event.target.value)}
          className="bg-card border border-border rounded-md px-2 py-1">
          {['All severities', 'Critical', 'High', 'Medium', 'Low'].map(value => <option key={value}>{value}</option>)}
        </select>
        <button type="button" onClick={() => { setInspected(null); setShowInspector(value => !value); }} className="flex items-center gap-1 hover:text-primary">
          <ListFilter className="h-3.5 w-3.5" /> Threat explorer ({filteredMappings.length})
        </button>
        <span className="text-muted-foreground ml-auto">Select a component or flow to inspect. Select a threat arrow to open its finding.</span>
      </div>

      {selectedNodeId && (
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 relative">
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
          onNodeClick={(_, node) => { if (node.type === 'c4Node') inspect({ kind: 'component', id: node.id }); }}
          onEdgeClick={(_, edge) => {
            const data = edge.data as C4EdgeData;
            if (data.threats?.length === 1) openThreat(data.threats[0].id);
            else if (!data.annotation) inspect({ kind: 'flow', id: edge.id });
          }}
          deleteKeyCode={null}
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
              {Object.entries({ Person: C4_PALETTE.Person, System: C4_PALETTE.System, External: C4_PALETTE.External,
                Container: C4_PALETTE.Container, Component: C4_PALETTE.Component }).map(([label, p]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: p.fill, border: `1px solid ${p.stroke}` }} /> {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-slate-500" /> Data flow</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-red-500" /> Threat annotation (not a proven exploit)</span>
            </div>
          </Panel>
        </ReactFlow>
        {!nodes.length && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-muted-foreground">No architecture elements recorded at this level.</div>}
        </div>
        {showInspector && (
          <aside className="w-72 max-w-[45%] shrink-0 border-l border-border/50 bg-card flex flex-col" aria-label="Architecture threat explorer">
            <div className="p-4 border-b border-border/50 flex items-start justify-between gap-2">
              <div><h4 className="text-sm font-bold break-words">{inspectedLabel}</h4>
                <p className="text-xs text-muted-foreground mt-1">{inspectedMappings.length} {inspected ? 'linked findings' : 'findings in assessment'}</p></div>
              <button type="button" aria-label="Close threat explorer" onClick={() => setShowInspector(false)}><X className="h-4 w-4" /></button>
            </div>
            {inspected && <button type="button" onClick={() => setInspected(null)} className="text-xs text-primary text-left px-4 py-2 border-b border-border/50">Show all findings</button>}
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              {!inspectedMappings.length && <p className="text-xs text-muted-foreground p-1">No linked findings match this selection. This is not proof of assessment coverage or safety.</p>}
              {inspectedMappings.map((mapping, index) => {
                const targets = visibleThreatTargets(mapping, draftSrg, visibleIds);
                const outsideLevel = !targets.componentIds.length && !targets.flowIds.length;
                return (
                  <article key={`${mapping.threat.id}:${index}`} className="border border-border/70 rounded-xl p-3 text-xs">
                    <div className="flex items-start justify-between gap-2 mb-2"><span className="font-mono break-all">{mapping.threat.id}</span>
                      <span className="font-bold" style={{ color: THREAT_COLORS[mapping.threat.severity] || THREAT_COLORS.Unrated }}>{mapping.threat.severity || 'Unrated'}</span></div>
                    <button type="button" className="text-left font-semibold hover:text-primary underline-offset-2 hover:underline"
                      onClick={() => openThreat(mapping.threat.id)}>{mapping.threat.title}</button>
                    <p className="mt-2 text-muted-foreground break-words">
                      {[mapping.componentIds.map(id => draftSrg.components.find(component => component.id === id)?.name || id).join(', '),
                        mapping.flowIds.length ? `Flows: ${mapping.flowIds.join(', ')}` : ''].filter(Boolean).join(' | ')}
                    </p>
                    {!!mapping.unresolved.length && <p className="mt-2 text-amber-600 dark:text-amber-400">Unmapped: {mapping.unresolved.join('; ')}</p>}
                    {outsideLevel && (!!mapping.componentIds.length || !!mapping.flowIds.length) && <p className="mt-2 text-muted-foreground">Targets outside this diagram level.</p>}
                    <div className="flex gap-3 mt-3">
                      <button type="button" className="text-primary font-medium flex items-center gap-1" onClick={() => openThreat(mapping.threat.id)}><ShieldAlert className="h-3 w-3" /> Open finding</button>
                      {(!!mapping.componentIds.length || !!mapping.flowIds.length) && <button type="button" className="text-muted-foreground flex items-center gap-1" onClick={() => focusThreat(mapping)}><Focus className="h-3 w-3" /> Locate</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export const C4ArchitectureTab = (props: C4ArchitectureProps) => (
  <ReactFlowProvider>
    <C4ArchitectureContent {...props} />
  </ReactFlowProvider>
);
