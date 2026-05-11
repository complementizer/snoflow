import { useEffect, useState, useRef } from 'react';
import { ChevronLeft, ZoomIn, ZoomOut, Maximize2, AlertCircle, Loader2 } from 'lucide-react';
import { HierarchyResponse } from '../types';

interface GraphConceptNode {
  conceptId: string;
  term: string;
  fsn: string;
  semanticTag: string;
}

interface ConceptHierarchy {
  concept: GraphConceptNode;
  parents: GraphConceptNode[];
  children: GraphConceptNode[];
}

function extractSemanticTag(fsn: string): string {
  const match = fsn.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : 'unknown';
}

function toGraphHierarchy(response: HierarchyResponse): ConceptHierarchy {
  const toNode = (info: { conceptId: string; term: string; fsn: string }): GraphConceptNode => ({
    conceptId: info.conceptId, term: info.term, fsn: info.fsn, semanticTag: extractSemanticTag(info.fsn),
  });
  return {
    concept: toNode(response.concept),
    parents: response.parents.map(toNode),
    children: response.children.map(toNode),
  };
}

function getSemanticTagColor(semanticTag: string): { bg: string; border: string; text: string } {
  const tag = semanticTag.toLowerCase();
  if (tag.includes('finding') || tag.includes('disorder')) return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' };
  if (tag.includes('body') || tag.includes('structure')) return { bg: '#f3e8ff', border: '#a855f7', text: '#7c3aed' };
  if (tag.includes('procedure')) return { bg: '#dcfce7', border: '#22c55e', text: '#166534' };
  if (tag.includes('morphologic')) return { bg: '#fef3c7', border: '#f59e0b', text: '#b45309' };
  return { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' };
}

interface NodePosition { x: number; y: number; node: GraphConceptNode; level: 'parent' | 'current' | 'child' }

const NODE_WIDTH = 180;
const NODE_HEIGHT = 52;
const COLUMN_GAP = 200;

function TreeNode({ node, x, y, isSelected, onClick, onMouseEnter, onMouseLeave }: {
  node: GraphConceptNode; x: number; y: number; isSelected?: boolean;
  onClick: () => void; onMouseEnter?: (e: React.MouseEvent) => void; onMouseLeave?: () => void;
}) {
  const colors = getSemanticTagColor(node.semanticTag);
  return (
    <g transform={`translate(${x - NODE_WIDTH / 2}, ${y - NODE_HEIGHT / 2})`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: 'pointer' }}>
      <rect x={2} y={2} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} fill="rgba(0,0,0,0.06)" />
      <rect x={0} y={0} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} fill={isSelected ? colors.border : 'white'} stroke={colors.border} strokeWidth={isSelected ? 2.5 : 1.5} />
      <rect x={NODE_WIDTH - 50} y={5} width={44} height={16} rx={3} fill={colors.bg} />
      <text x={NODE_WIDTH - 28} y={16} textAnchor="middle" fontSize={8} fill={colors.text} fontWeight={500}>
        {node.semanticTag.length > 7 ? node.semanticTag.slice(0, 6) + '..' : node.semanticTag}
      </text>
      <text x={8} y={28} fontSize={11} fontWeight={600} fill={isSelected ? 'white' : '#1e293b'}>
        {node.term.length > 18 ? node.term.slice(0, 16) + '...' : node.term}
      </text>
      <text x={8} y={44} fontSize={9} fill={isSelected ? 'rgba(255,255,255,0.8)' : '#64748b'}>{node.conceptId}</text>
    </g>
  );
}

function ConnectionLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return (
    <>
      <path d={path} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
      <circle cx={x2} cy={y2} r={3} fill="#94a3b8" />
    </>
  );
}

interface TooltipState { visible: boolean; x: number; y: number; node: GraphConceptNode | null }

interface EmbeddedGraphProps {
  conceptId: string;
  onNavigate: (conceptId: string) => void;
  onSelect?: (conceptId: string) => void;
  containerWidth: number;
  fetchHierarchy: (conceptId: string) => Promise<HierarchyResponse | null>;
}

export function EmbeddedGraph({ conceptId, onNavigate, onSelect, containerWidth, fetchHierarchy }: EmbeddedGraphProps) {
  const [hierarchy, setHierarchy] = useState<ConceptHierarchy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, node: null });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchHierarchy(conceptId);
        if (cancelled) return;
        if (response) setHierarchy(toGraphHierarchy(response));
        else setError('Failed to load hierarchy');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [conceptId, fetchHierarchy]);

  const handleNavigate = (newConceptId: string) => { setHistory(prev => [...prev, conceptId]); onNavigate(newConceptId); };
  const handleBack = () => { if (history.length > 0) { const prev = history[history.length - 1]; setHistory(h => h.slice(0, -1)); onNavigate(prev); } };

  const handleTooltipEnter = (e: React.MouseEvent, node: GraphConceptNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, node });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
      <AlertCircle className="w-8 h-8 text-rose-400 mb-2" /><p className="text-sm text-slate-600">{error}</p>
    </div>
  );
  if (!hierarchy) return null;

  const positions: NodePosition[] = [];
  const connections: Array<{ from: NodePosition; to: NodePosition }> = [];
  const hasChildren = hierarchy.children.length > 0;
  const hasParents = hierarchy.parents.length > 0;
  const svgWidth = Math.max(containerWidth - 20, 400);
  const maxItems = Math.max(hierarchy.parents.length, hierarchy.children.length, 1);
  const rowSpacing = NODE_HEIGHT + 16;
  const svgHeight = Math.max(280, maxItems * rowSpacing + 80);
  const centerY = svgHeight / 2;

  let currentX = svgWidth / 2;
  if (hasParents && !hasChildren) currentX = svgWidth / 2 + COLUMN_GAP / 2;
  else if (!hasParents && hasChildren) currentX = svgWidth / 2 - COLUMN_GAP / 2;

  if (hierarchy.parents.length > 0) {
    const parentHeight = hierarchy.parents.length * rowSpacing;
    const parentStartY = centerY - parentHeight / 2 + rowSpacing / 2;
    hierarchy.parents.forEach((parent, i) => {
      positions.push({ x: currentX - COLUMN_GAP, y: parentStartY + i * rowSpacing, node: parent, level: 'parent' });
    });
  }

  const currentPos: NodePosition = { x: currentX, y: centerY, node: hierarchy.concept, level: 'current' };
  positions.push(currentPos);
  positions.filter(p => p.level === 'parent').forEach(parentPos => { connections.push({ from: parentPos, to: currentPos }); });

  if (hierarchy.children.length > 0) {
    const childHeight = hierarchy.children.length * rowSpacing;
    const childStartY = centerY - childHeight / 2 + rowSpacing / 2;
    hierarchy.children.forEach((child, i) => {
      const childPos: NodePosition = { x: currentX + COLUMN_GAP, y: childStartY + i * rowSpacing, node: child, level: 'child' };
      positions.push(childPos);
      connections.push({ from: currentPos, to: childPos });
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          {history.length > 0 && <button onClick={handleBack} className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Go back"><ChevronLeft className="w-4 h-4" /></button>}
          <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{hierarchy.concept.term}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.15))} className="p-1 hover:bg-slate-100 rounded"><ZoomOut className="w-4 h-4 text-slate-400" /></button>
          <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.5, z + 0.15))} className="p-1 hover:bg-slate-100 rounded"><ZoomIn className="w-4 h-4 text-slate-400" /></button>
          <button onClick={() => setZoom(1)} className="p-1 hover:bg-slate-100 rounded"><Maximize2 className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-50 relative">
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth / zoom} ${svgHeight / zoom}`} className="mx-auto">
          <defs><pattern id="embeddedGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#embeddedGrid)" />
          {hasParents && <text x={currentX - COLUMN_GAP} y={20} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>PARENTS</text>}
          <text x={currentX} y={20} textAnchor="middle" fontSize={10} fill="#3b82f6" fontWeight={600}>SELECTED</text>
          {hasChildren && <text x={currentX + COLUMN_GAP} y={20} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600}>CHILDREN</text>}
          {connections.map((conn, i) => <ConnectionLine key={i} x1={conn.from.x + NODE_WIDTH / 2} y1={conn.from.y} x2={conn.to.x - NODE_WIDTH / 2} y2={conn.to.y} />)}
          {positions.map((pos, i) => (
            <TreeNode key={pos.node.conceptId + i} node={pos.node} x={pos.x} y={pos.y} isSelected={pos.level === 'current'}
              onClick={() => { if (pos.level === 'current' && onSelect) onSelect(pos.node.conceptId); else handleNavigate(pos.node.conceptId); }}
              onMouseEnter={(e) => handleTooltipEnter(e, pos.node)} onMouseLeave={() => setTooltip({ visible: false, x: 0, y: 0, node: null })} />
          ))}
        </svg>
        {tooltip.visible && tooltip.node && (
          <div className="absolute z-50 pointer-events-none bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-sm max-w-xs" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <div className="font-semibold mb-1">{tooltip.node.term}</div>
            <div className="text-slate-300 text-xs mb-1">{tooltip.node.fsn}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 bg-slate-700 rounded">{tooltip.node.semanticTag}</span>
              <span className="text-slate-400">SCTID: {tooltip.node.conceptId}</span>
            </div>
          </div>
        )}
      </div>

      {onSelect && (
        <div className="px-3 py-2 border-t border-slate-100 bg-white">
          <button onClick={() => onSelect(hierarchy.concept.conceptId)} className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            Select "{hierarchy.concept.term.slice(0, 30)}{hierarchy.concept.term.length > 30 ? '...' : ''}"
          </button>
        </div>
      )}
    </div>
  );
}
