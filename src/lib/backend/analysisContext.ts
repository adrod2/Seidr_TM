/**
 * Builds the analysis context from every user input as clearly labelled sections, so that each input is
 * sanitised independently (one bad document cannot fail the run) and the final agents see all sources.
 */
import { redactPII, scanForPromptInjection } from './securityPipeline.ts';

export type InputKind = 'description' | 'diagram' | 'document' | 'website' | 'repository' | 'knowledge';

export interface ContextSection {
  kind: InputKind;
  name: string;
  text: string;
  /** Short qualifier shown in the section header, e.g. "PDF, 12 pages, security digest". */
  detail?: string;
}

export interface InputStatus {
  kind: InputKind;
  name: string;
  status: 'included' | 'digested' | 'truncated' | 'excluded' | 'failed' | 'empty';
  /** Characters of this input that reached the threat-modeling context. */
  chars: number;
  sourceChars?: number;
  method?: string;
  note?: string;
}

const GROUP_TITLES: Record<InputKind, string> = {
  description: 'SYSTEM DESCRIPTION (provided by the user)',
  diagram: 'ARCHITECTURE DIAGRAM ANALYSES (vision model)',
  document: 'SUPPORTING DOCUMENTS (attached by the user)',
  website: 'REFERENCE WEBSITE INTELLIGENCE (crawled third-party documentation)',
  repository: 'REPOSITORY ANALYSIS',
  knowledge: 'ORGANIZATIONAL KNOWLEDGE BASE (global policies and standards)',
};
const GROUP_ORDER: InputKind[] = ['description', 'diagram', 'document', 'website', 'repository', 'knowledge'];

/** Default budget for the context passed to the C4 and threat agents (roughly 50k tokens). */
export const CONTEXT_BUDGET_CHARS = 200_000;
/** Documents longer than this are condensed by the document digest agent instead of being inlined. */
export const INLINE_DOCUMENT_CHARS = 30_000;

export const sanitiseSection = (raw: string): { text: string; passed: boolean; reason?: string; piiRedacted: number } => {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim();
  const scan = scanForPromptInjection(cleaned);
  if (!scan.passed) return { text: '', passed: false, reason: scan.reason, piiRedacted: 0 };
  const { redacted, count } = redactPII(cleaned);
  return { text: redacted, passed: true, piiRedacted: count };
};

/**
 * Water-filling allocation: every section gets an equal share of the budget, and space unused by short
 * sections is redistributed to longer ones. Returns the number of characters each section may keep.
 */
export function allocateBudget(lengths: number[], budget: number): number[] {
  const allocation = lengths.map(() => 0);
  let remaining = Math.max(0, budget);
  let open = lengths.map((_, i) => i).filter((i) => lengths[i] > 0);
  while (open.length && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) break;
    const next: number[] = [];
    for (const i of open) {
      const take = Math.min(share, lengths[i] - allocation[i]);
      allocation[i] += take;
      remaining -= take;
      if (allocation[i] < lengths[i]) next.push(i);
    }
    open = next;
  }
  return allocation;
}

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 40));
  const lastBreak = cut.lastIndexOf('\n');
  return `${lastBreak > max * 0.8 ? cut.slice(0, lastBreak) : cut}\n[... truncated to fit the context budget ...]`;
};

export interface AssembledContext {
  text: string;
  /** Characters kept per section (same order as the input). */
  kept: number[];
}

export function assembleContext(sections: ContextSection[], budget = CONTEXT_BUDGET_CHARS): AssembledContext {
  const usable = sections.map((s, index) => ({ ...s, index })).filter((s) => s.text.trim());
  const headerCost = 160;
  const allocation = allocateBudget(usable.map((s) => s.text.length), budget - usable.length * headerCost);
  const kept = sections.map(() => 0);
  const parts: string[] = [];
  for (const kind of GROUP_ORDER) {
    const group = usable.map((s, i) => ({ s, max: allocation[i] })).filter(({ s }) => s.kind === kind);
    if (!group.length) continue;
    parts.push(`=== ${GROUP_TITLES[kind]} ===`);
    for (const { s, max } of group) {
      const body = truncate(s.text.trim(), max);
      kept[s.index] = Math.min(s.text.trim().length, max);
      const header = kind === 'description' ? '' : `--- ${s.name}${s.detail ? ` (${s.detail})` : ''} ---\n`;
      parts.push(`${header}${body}`);
    }
  }
  return { text: parts.join('\n\n'), kept };
}

/** Splits long text into chunks on paragraph boundaries where possible. */
export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n\n', size);
    if (cut < size * 0.5) cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}
