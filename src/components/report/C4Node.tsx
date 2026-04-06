import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server } from 'lucide-react';

export const C4Node = ({ data }: any) => {
  const Icon = data.icon || Server;
  
  return (
    <div className={`px-5 py-4 shadow-lg rounded-2xl border-2 min-w-[240px] max-w-[280px] ${data.containerStyle}`}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-muted-foreground border-none" />
      <div className="flex flex-col items-center text-center">
        <div className={`p-2.5 rounded-xl mb-3 shadow-inner ${data.iconBg}`}>
          <Icon className={`h-6 w-6 ${data.iconColor}`} />
        </div>
        <h3 className="font-bold text-[15px] text-foreground leading-tight mb-1">{data.label}</h3>
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-2.5 py-0.5 bg-background/50 rounded-md border border-border/30">
          [{data.type}]
        </p>
        
        {/* Rich Description Box */}
        {data.description && (
          <div className="mt-4 w-full bg-background/40 backdrop-blur-sm rounded-xl p-3 border border-border/40 text-left">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {data.description}
            </p>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-muted-foreground border-none" />
    </div>
  );
};