import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server } from 'lucide-react';

export const C4Node = ({ data }: any) => {
  const Icon = data.icon || Server;
  
  return (
    <div className={`px-4 py-3 shadow-lg rounded-2xl border-2 min-w-[180px] ${data.containerStyle}`}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-muted-foreground border-none" />
      <div className="flex flex-col items-center text-center">
        <div className={`p-2 rounded-xl mb-2 ${data.iconBg}`}>
          <Icon className={`h-6 w-6 ${data.iconColor}`} />
        </div>
        <h3 className="font-bold text-sm text-foreground">{data.label}</h3>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">[{data.type}]</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-[160px] leading-tight">{data.description}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-muted-foreground border-none" />
    </div>
  );
};