import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { Server, Database, Globe, Smartphone, Lock } from 'lucide-react';
import { C4Node } from './C4Node';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { 
    id: '1', 
    type: 'c4Node',
    position: { x: 250, y: 50 }, 
    data: { 
      label: 'Customer', type: 'Person', description: 'A customer of the platform.',
      icon: Smartphone, containerStyle: 'bg-card border-border', iconBg: 'bg-primary/10', iconColor: 'text-primary'
    } 
  },
  { 
    id: '2', 
    type: 'c4Node',
    position: { x: 250, y: 250 }, 
    data: { 
      label: 'Web Application', type: 'Container: Next.js', description: 'Delivers the SPA and handles SSR.',
      icon: Globe, containerStyle: 'bg-card border-primary/50', iconBg: 'bg-primary', iconColor: 'text-primary-foreground'
    } 
  },
  { 
    id: '3', 
    type: 'c4Node',
    position: { x: 50, y: 450 }, 
    data: { 
      label: 'API Gateway', type: 'Container: Kong', description: 'Routes traffic and enforces rate limits.',
      icon: Server, containerStyle: 'bg-destructive/5 border-destructive', iconBg: 'bg-destructive/20', iconColor: 'text-destructive'
    } 
  },
  { 
    id: '4', 
    type: 'c4Node',
    position: { x: 450, y: 450 }, 
    data: { 
      label: 'Auth Service', type: 'Container: Node.js', description: 'Issues JWTs and validates users.',
      icon: Lock, containerStyle: 'bg-card border-border', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500'
    } 
  },
  { 
    id: '5', 
    type: 'c4Node',
    position: { x: 50, y: 650 }, 
    data: { 
      label: 'Primary Database', type: 'Container: PostgreSQL', description: 'Stores user and transaction data.',
      icon: Database, containerStyle: 'bg-card border-border', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-500'
    } 
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', label: 'Visits via HTTPS', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-3', source: '2', target: '3', label: 'REST API Calls', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 }, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } },
  { id: 'e2-4', source: '2', target: '4', label: 'Authenticates via OIDC', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-5', source: '3', target: '5', label: 'Reads/Writes TCP/5432', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
];

export const C4ArchitectureTab = () => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[500px]">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button className="bg-card border border-border/50 shadow-sm px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/50 transition-colors">L1 Context</button>
        <button className="bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-xl text-sm font-medium">L2 Container</button>
        <button className="bg-card border border-border/50 shadow-sm px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/50 transition-colors">L3 Component</button>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-card/80 backdrop-blur-md border border-border/50 shadow-sm p-3 rounded-xl text-xs flex flex-col gap-2">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-destructive/80"></div> Vulnerability Found</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary/80"></div> External Component</div>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
      >
        <Background className="opacity-20" color="hsl(var(--muted-foreground))" gap={20} size={1} />
        <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden" />
      </ReactFlow>
    </div>
  );
};