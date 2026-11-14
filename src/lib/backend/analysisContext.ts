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

export interface ContextInput {
  section?: ContextSection;
  status: InputStatus;
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
  if (!Number.isFinite(budget)) throw new RangeError('Context budget must be finite.');
  if (lengths.some(length => !Number.isInteger(length) || length < 0)) {
    throw new RangeError('Section lengths must be non-negative integers.');
  }
  const allocation = lengths.map(() => 0);
  let remaining = Math.max(0, Math.floor(budget));
  let open = lengths.map((_, i) => i).filter((i) => lengths[i] > 0);
  while (open.length && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) {
      for (const i of open.slice(0, remaining)) allocation[i]++;
      break;
    }
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

const TRUNCATION_MARKER = '\n[... truncated to fit the context budget ...]';

const truncate = (text: string, max: number): { text: string; kept: number } => {
  if (text.length <= max) return { text, kept: text.length };
  if (max <= TRUNCATION_MARKER.length) return { text: text.slice(0, max), kept: max };
  const cut = text.slice(0, max - TRUNCATION_MARKER.length);
  const lastBreak = cut.lastIndexOf('\n');
  const body = lastBreak > cut.length * 0.8 ? cut.slice(0, lastBreak) : cut;
  return { text: `${body}${TRUNCATION_MARKER}`, kept: body.length };
};

export interface AssembledContext {
  text: string;
  /** Characters kept per section (same order as the input). */
  kept: number[];
}

export function assembleContext(sections: ContextSection[], budget = CONTEXT_BUDGET_CHARS): AssembledContext {
  if (!Number.isFinite(budget) || budget < 0) throw new RangeError('Context budget must be finite and non-negative.');
  const kept = sections.map(() => 0);
  const usable = sections.map((s, index) => ({
    ...s, index, text: s.text.trim(),
    header: s.kind === 'description' ? '' : `--- ${s.name}${s.detail ? ` (${s.detail})` : ''} ---\n`,
  })).filter(s => s.text);
  const groups = GROUP_ORDER.map(kind => ({
    title: `=== ${GROUP_TITLES[kind]} ===`,
    sources: usable.filter(s => s.kind === kind),
  })).filter(group => group.sources.length);
  const headerChars = groups.reduce((sum, group) => sum + group.title.length, 0)
    + usable.reduce((sum, source) => sum + source.header.length, 0)
    + Math.max(0, groups.length + usable.length - 1) * 2;
  if (budget <= headerChars) return { text: '', kept };
  const allocation = allocateBudget(usable.map(s => s.text.length), budget - headerChars);
  const limits = new Map(usable.map((s, index) => [s.index, allocation[index]]));
  const parts: string[] = [];
  for (const group of groups) {
    parts.push(group.title);
    for (const source of group.sources) {
      const body = truncate(source.text, limits.get(source.index)!);
      kept[source.index] = body.kept;
      parts.push(`${source.header}${body.text}`);
    }
  }
  return { text: parts.join('\n\n'), kept };
}

/** Splits long text into chunks on paragraph boundaries where possible. */
export function chunkText(text: string, size: number): string[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Chunk size must be a positive integer.');
  const chunks: string[] = [];
  let offset = 0;
  while (text.length - offset > size) {
    let cut = text.lastIndexOf('\n\n', offset + size);
    if (cut < offset + size * 0.5) cut = text.lastIndexOf('\n', offset + size);
    if (cut < offset + size * 0.5) cut = offset + size;
    chunks.push(text.slice(offset, cut));
    offset = cut;
    while (offset < text.length && /\s/.test(text[offset])) offset++;
  }
  if (text.slice(offset).trim()) chunks.push(text.slice(offset));
  return chunks;
}
