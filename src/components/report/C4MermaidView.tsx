import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

let renderCounter = 0;

const isDark = () => document.documentElement.classList.contains('dark');

export const C4MermaidView = ({ definition, fileName }: { definition: string; fileName: string }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError('');
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark() ? 'dark' : 'neutral',
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
          flowchart: { htmlLabels: false, curve: 'basis', padding: 18, nodeSpacing: 60, rankSpacing: 80, wrappingWidth: 230 },
        });
        const { svg: rendered } = await mermaid.render(`seidr-c4-${++renderCounter}`, definition);
        if (!cancelled) {
          setSvg(rendered);
          setZoom(1);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Mermaid could not render this diagram.');
      }
    })();
    return () => { cancelled = true; };
  }, [definition]);

  const svgElement = () => hostRef.current?.querySelector('svg') as SVGSVGElement | null;

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const serialize = () => {
    const el = svgElement();
    if (!el) return null;
    const clone = el.cloneNode(true) as SVGSVGElement;
    const box = el.viewBox.baseVal;
    clone.setAttribute('width', String(box?.width || el.clientWidth));
    clone.setAttribute('height', String(box?.height || el.clientHeight));
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return { text: new XMLSerializer().serializeToString(clone), width: box?.width || el.clientWidth, height: box?.height || el.clientHeight };
  };

  const exportSvg = () => {
    const data = serialize();
    if (data) download(new Blob([data.text], { type: 'image/svg+xml' }), 'svg');
  };

  const exportPng = () => {
    const data = serialize();
    if (!data) return;
    const scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = data.width * scale;
      canvas.height = data.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = isDark() ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? download(blob, 'png') : toast.error('PNG export failed'), 'image/png');
    };
    img.onerror = () => toast.error('PNG export failed');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.text)}`;
  };

  return (
    <div className="absolute inset-0 pt-20 pb-4 px-4 flex flex-col">
      <div className="flex justify-end gap-2 mb-2">
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} className="p-2 rounded-lg border border-border/50 bg-card hover:bg-secondary" title="Zoom out"><ZoomOut className="h-4 w-4" /></button>
        <button onClick={() => setZoom(1)} className="p-2 rounded-lg border border-border/50 bg-card hover:bg-secondary" title="Fit"><Maximize2 className="h-4 w-4" /></button>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))} className="p-2 rounded-lg border border-border/50 bg-card hover:bg-secondary" title="Zoom in"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={exportSvg} disabled={!svg} className="px-3 py-2 rounded-lg border border-border/50 bg-card hover:bg-secondary text-xs font-medium flex items-center gap-1 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> SVG</button>
        <button onClick={exportPng} disabled={!svg} className="px-3 py-2 rounded-lg border border-border/50 bg-card hover:bg-secondary text-xs font-medium flex items-center gap-1 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> PNG</button>
      </div>
      <div className="flex-1 overflow-auto rounded-2xl border border-border/50 bg-card">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-destructive gap-2 p-6 text-center">
            <AlertTriangle className="h-6 w-6" /> {error}
          </div>
        ) : !svg ? (
          <div className="h-full flex items-center justify-center text-muted-foreground gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Rendering diagram...</div>
        ) : (
          <div ref={hostRef} className="p-6 origin-top-left [&_svg]:mx-auto [&_svg]:h-auto"
            style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%` }}
            // Mermaid output is sanitised (securityLevel: strict) and generated from escaped labels.
            dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </div>
    </div>
  );
};
