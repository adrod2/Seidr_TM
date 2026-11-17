import { z } from 'zod';
import type { Threat, SystemRepresentationGraph } from './types.ts';
import { hashInput } from './inputUtils.ts';

const text = z.string();
const ratingLevel = z.number().int().min(1).max(5).nullable();
export const ratingSchema = z.object({
  likelihood: ratingLevel, impact: ratingLevel, rationale: text, reviewer: text,
});
export const referenceSchema = z.object({
  sourceId: text.min(1), startLine: z.number().int().positive(), endLine: z.number().int().positive(), quote: text.min(1),
});
export const scenarioSchema = z.object({
  actor: text, preconditions: text, action: text, asset: text, consequence: text,
});
const scenarioValues = (scenario: z.infer<typeof scenarioSchema>) =>
  [scenario.actor, scenario.preconditions, scenario.action, scenario.asset, scenario.consequence];
export const actionSchema = z.object({
  id: text.min(1), description: text, owner: text, proposedOwner: text.default(''), priority: z.enum(['Before launch', 'High', 'Normal']),
  milestone: text, dependencies: z.array(text), requirements: z.array(text),
  acceptanceTest: text, expectedArtifact: text, incompleteRisk: text,
  status: z.enum(['Open', 'In Progress', 'Awaiting verification', 'Verified']),
  verification: z.object({
    result: z.enum(['Not run', 'Pass', 'Fail']), artifactSourceIds: z.array(text),
    reviewer: text, at: text, environment: text,
  }),
});
export const releaseDecisionSchema = z.object({
  state: z.enum(['Not recorded', 'Go', 'Conditional go', 'Hold']),
  owner: text, rationale: text, at: text, expiresAt: text, reviewTrigger: text,
  conditions: z.array(z.object({ requirement: text, owner: text, riskId: text, actionId: text })),
});
export const emptyReleaseDecision = () => ({
  state: 'Not recorded' as const, owner: '', rationale: '', at: '', expiresAt: '', reviewTrigger: '', conditions: [],
});
export const mitigationProposalSchema = z.object({
  narrative: text.min(1),
  actions: z.array(actionSchema.omit({ id: true, owner: true, status: true, verification: true })).min(1),
});
export function parseMitigationProposal(value: unknown, requirementIds: readonly string[] = []) {
  const proposal = mitigationProposalSchema.parse(value);
  for (const action of proposal.actions) {
    if (![action.description, action.proposedOwner, action.milestone, action.acceptanceTest, action.expectedArtifact, action.incompleteRisk]
      .every(item => item.trim())) throw new Error('Treatment proposals require a concrete action, suggested role, gate, test, artifact and remaining risk.');
    if (action.requirements.some(id => !requirementIds.includes(id))) throw new Error('Treatment proposals may link only supplied requirement IDs.');
  }
  return proposal;
}
export const riskSchema = z.object({
  id: text.min(1), scenario: scenarioSchema, frameworkTags: z.array(text),
  evidenceStatus: z.enum(['Observed', 'Documented but unverified', 'Hypothesis', 'Not assessed']),
  confidence: z.object({ level: z.enum(['Low', 'Medium', 'High']), reason: text }),
  references: z.array(referenceSchema), owner: text,
  disposition: z.enum(['Blocker', 'Owner acceptance required', 'Proposed acceptance', 'Accepted risk', 'Closed with evidence']),
  inherent: ratingSchema, current: ratingSchema, target: ratingSchema,
  controls: z.array(z.object({
    description: text, state: z.enum(['Current', 'Proposed', 'Planned', 'Assumed']),
    verified: z.boolean(), artifactSourceIds: z.array(text),
  })),
  missingEvidence: z.array(z.object({ question: text, supplier: text, verification: text,
    resolved: z.boolean().default(false), artifactSourceIds: z.array(text).default([]) })),
  actions: z.array(actionSchema),
  decision: z.object({ owner: text, rationale: text, at: text, expiresAt: text, reviewTrigger: text }),
  reviewTrigger: text, issues: z.array(text), observationIds: z.array(text),
  treatmentState: z.enum(['Pending', 'Generated', 'Failed', 'Canceled']).default('Pending'),
  treatmentNarrative: text.default(''),
});
export const sourceSchema = z.object({
  id: text.min(1), name: text.min(1), kind: text.min(1), text,
  contentHash: text.regex(/^[a-f0-9]{64}$/), collectedAt: text, version: text,
  derived: z.boolean(), status: z.enum(['Complete', 'Partial', 'Unavailable']), note: text,
  parentSourceIds: z.array(text).default([]),
});
export const coverageSchema = z.object({
  id: text.min(1), kind: z.enum(['Component', 'Flow', 'Sensitive destination', 'Integration', 'Specialist check']),
  name: text, state: z.enum(['Examined', 'Not applicable', 'Out of scope', 'Blocked', 'Not assessed']),
  rationale: text, owner: text, references: z.array(referenceSchema),
  proposal: z.object({ result: z.enum(['Documented', 'Unknown', 'Not applicable', 'Conflicting']), rationale: text,
    references: z.array(referenceSchema) }).optional(),
  requests: riskSchema.shape.missingEvidence.default([]),
});
export const qualitySchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().positive(), systemId: text.min(1),
  parentAssessmentId: text, parentAssessmentRevision: z.number().int().min(0).default(0), evidenceCutoff: text,
  rubric: z.object({ version: z.literal('seidr-5x5-v1'), approvedBy: text, approvedAt: text }),
  scope: text, environment: text, systemVersion: text, promptVersion: text,
  sourceIds: z.array(text), risks: z.array(riskSchema), coverage: z.array(coverageSchema),
  conflicts: z.array(z.object({
    id: text, riskIds: z.array(text), description: text, references: z.array(referenceSchema),
    owner: text, verification: text, resolved: z.boolean(), resolution: text,
    artifactSourceIds: z.array(text).default([]),
  })),
  observations: z.array(z.object({ id: text, originalId: text, category: text, riskId: text, finding: z.lazy(() => threatSchema),
    origin: z.enum(['Architecture', 'Repository', 'Specialist', 'Unspecified']).default('Unspecified') })),
  reconciliation: z.array(z.object({ riskId: text, observationIds: z.array(text), reason: text,
    decision: z.enum(['Automatic', 'Merge', 'Split', 'Separate', 'Link']).default('Automatic'), relatedRiskIds: z.array(text).default([]) })),
  stageIssues: z.array(text),
  history: z.array(z.object({ at: text, actor: text, event: text, riskId: text, previousHash: text })),
  releaseDecision: releaseDecisionSchema.default(emptyReleaseDecision),
  generation: z.object({ provider: text, model: text, configurationChanged: z.boolean() })
    .default({ provider: 'Not recorded', model: 'Not recorded', configurationChanged: false }),
  run: z.object({ state: z.enum(['Running', 'Failed', 'Ready for review']), stage: z.number().int().min(0), error: text })
    .default({ state: 'Ready for review', stage: 8, error: '' }),
  requirements: z.array(z.object({ id: text.min(1), externalId: text, description: text.min(1), references: z.array(referenceSchema).min(1) })).default([]),
});

export type EvidenceSource = z.infer<typeof sourceSchema>;
export type EvidenceReference = z.infer<typeof referenceSchema>;
export type RiskRecord = z.infer<typeof riskSchema>;
export type TreatmentAction = z.infer<typeof actionSchema>;
export type AssessmentQuality = z.infer<typeof qualitySchema>;
export const registeredRequirementIds = (requirements: AssessmentQuality['requirements']) => requirements.flatMap(requirement => [
  requirement.id, ...(requirement.externalId && requirements.filter(item => item.externalId === requirement.externalId).length === 1 ? [requirement.externalId] : []),
]);
export type RiskRating = z.infer<typeof ratingSchema>;
export const riskProposalSchema = riskSchema.pick({
  scenario: true, frameworkTags: true, evidenceStatus: true, confidence: true, references: true, controls: true, missingEvidence: true,
});
export type RiskProposal = z.infer<typeof riskProposalSchema>;

export const threatSchema = z.object({
  id: text.min(1), title: text.min(1), description: text.min(1), category: text.min(1), componentId: text,
  affectedComponentIds: z.array(text).optional(), affectedFlowIds: z.array(text).optional(),
  cvssScore: z.number().min(0).max(10), severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
  evidence: text.optional(), reasoning: text.optional(), exploitationRisk: text.optional(),
  mitigation: text.optional(), mitigations: z.array(text).optional(), status: text.optional(), justification: text.optional(),
  dread: z.object({ damage: z.number().min(1).max(10), reproducibility: z.number().min(1).max(10),
    exploitability: z.number().min(1).max(10), affectedUsers: z.number().min(1).max(10), discoverability: z.number().min(1).max(10) }).optional(),
  qualityProposal: riskProposalSchema.optional(),
  analysisOrigin: z.enum(['Architecture', 'Repository', 'Specialist']).optional(),
  cvssVersion: text.optional(), cvssVector: text.optional(), cvssRationale: text.optional(),
});

export function parseThreats(value: unknown, requireQuality = false): Threat[] {
  if (requireQuality) z.array(threatSchema.extend({ qualityProposal: riskProposalSchema })).parse(value);
  return z.array(threatSchema).parse(value).map(threat => ({
    ...threat, id: threat.id, title: threat.title, description: threat.description,
    category: threat.category, componentId: threat.componentId, cvssScore: threat.cvssScore, severity: threat.severity,
    dread: threat.dread ? {
      damage: threat.dread.damage, reproducibility: threat.dread.reproducibility, exploitability: threat.dread.exploitability,
      affectedUsers: threat.dread.affectedUsers, discoverability: threat.dread.discoverability,
    } : undefined,
  }));
}

export const graphSchema = z.object({
  components: z.array(z.object({
    id: text.min(1), name: text.min(1), type: z.enum(['Process', 'DataStore', 'ExternalEntity', 'DataFlow']),
    c4Type: z.enum(['Person', 'System', 'Container', 'Database', 'Component']).optional(),
    c4Level: z.enum(['L1', 'L2', 'L3', 'Global']).optional(), description: text,
    technology: text.optional(), external: z.boolean().optional(), metadata: z.record(z.unknown()).optional(),
  })),
  edges: z.array(z.object({ id: text.min(1), sourceId: text.min(1), targetId: text.min(1),
    protocol: text.optional(), label: text.optional(), dataClassification: text.optional() })),
  trustBoundaries: z.array(text),
}).superRefine((graph, context) => {
  const componentIds = graph.components.map(component => component.id);
  const edgeIds = graph.edges.map(edge => edge.id);
  if (new Set(componentIds).size !== componentIds.length || new Set(edgeIds).size !== edgeIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Architecture contains duplicate component or flow IDs.' });
  }
  if (graph.edges.some(edge => !componentIds.includes(edge.sourceId) || !componentIds.includes(edge.targetId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Architecture contains a flow with missing endpoints.' });
  }
});

export const assessmentExportSchema = z.object({
  schemaVersion: z.literal('seidr-assessment-v1'),
  metadata: z.object({ id: text.min(1), name: text, date: text, framework: text, language: text }),
  assessment: qualitySchema, graph: graphSchema, findings: z.array(threatSchema),
  controlMappings: z.array(z.object({ controlId: text.min(1), title: text, status: z.enum(['Met', 'Partially Met', 'Gap Identified']), description: text })),
  sourceManifest: z.array(sourceSchema.omit({ text: true })),
});

export const unknownRating = (): RiskRating => ({ likelihood: null, impact: null, rationale: '', reviewer: '' });
export const LIKELIHOOD_LEVELS = ['Rare: exceptional prerequisites', 'Unlikely: several credible obstacles', 'Possible: feasible with meaningful prerequisites', 'Likely: accessible, repeatable conditions', 'Almost certain: routine exposure with few effective barriers'];
export const IMPACT_LEVELS = ['Negligible: contained inconvenience', 'Minor: limited, recoverable disruption or disclosure', 'Moderate: material operational or affected-person harm', 'Major: serious business, privacy or safety consequences', 'Severe: systemic, lasting or catastrophic consequences'];

export function rateRisk(rating: RiskRating) {
  const parsed = ratingSchema.parse(rating);
  if (parsed.likelihood === null || parsed.impact === null) return { band: 'Not rated', score: null };
  const score = parsed.likelihood * parsed.impact;
  return { score, band: score >= 20 ? 'Critical' : score >= 12 ? 'High' : score >= 6 ? 'Medium' : 'Low' };
}

export async function makeEvidenceSource(input: Omit<EvidenceSource, 'id' | 'contentHash' | 'parentSourceIds'> & { parentSourceIds?: string[] }): Promise<EvidenceSource> {
  const contentHash = await hashInput(input.text);
  const identity = await hashInput(JSON.stringify([input.kind, input.name, input.version, input.derived, input.status, input.note, input.collectedAt, contentHash, input.parentSourceIds || []]));
  return sourceSchema.parse({ ...input, contentHash, id: `SRC-${identity}` });
}

export function primaryEvidenceExcerpts(sources: readonly EvidenceSource[], query: string, budget = 24_000): string {
  const terms = [...new Set(query.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])]
    .filter(term => !['the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'system', 'process', 'component', 'description'].includes(term));
  const candidates: { source: EvidenceSource; start: number; lines: string[]; score: number }[] = [];
  for (const source of sources) {
    if (source.derived || source.status === 'Unavailable' || source.kind === 'attachment-metadata') continue;
    const lines = source.text.split(/\r?\n/);
    for (let start = 0; start < lines.length;) {
      const end = start;
      const chunk: string[] = [];
      let size = 0;
      while (start < lines.length && size < 1500) {
        const line = lines[start++].slice(0, 1500);
        chunk.push(line); size += line.length + 1;
      }
      const text = chunk.join('\n').toLowerCase();
      const score = terms.filter(term => text.includes(term)).length;
      if (score) candidates.push({ source, start: end + 1, lines: chunk, score });
    }
  }
  const selected: string[] = [];
  const perSource = new Map<string, number>();
  let length = 0;
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if ((perSource.get(candidate.source.id) || 0) >= 2) continue;
    const excerpt = `[Source ID: ${candidate.source.id}; original line numbers below; status ${candidate.source.status}; ${candidate.source.name}]\n`
      + candidate.lines.map((line, index) => `L${candidate.start + index}: ${line}`).join('\n');
    if (length + excerpt.length + 2 > budget) continue;
    selected.push(excerpt); length += excerpt.length + 2;
    perSource.set(candidate.source.id, (perSource.get(candidate.source.id) || 0) + 1);
  }
  return selected.join('\n\n');
}

export function referenceIssue(reference: EvidenceReference, sources: readonly EvidenceSource[]): string | undefined {
  const parsed = referenceSchema.safeParse(reference);
  if (!parsed.success) return 'Source reference is invalid.';
  const source = sources.find(item => item.id === reference.sourceId);
  if (!source || source.status === 'Unavailable') return 'Source is unavailable.';
  const lines = source.text.split(/\r?\n/);
  if (reference.endLine < reference.startLine || reference.endLine > lines.length) return 'Source line range is invalid.';
  if (!lines.slice(reference.startLine - 1, reference.endLine).join('\n').includes(reference.quote.replace(/\r\n/g, '\n'))) return 'Quoted evidence does not match the recorded lines.';
  return undefined;
}

export function actionIssues(action: TreatmentAction, sourceIds: readonly string[]): string[] {
  const issues: string[] = [];
  for (const [label, value] of Object.entries({
    action: action.description, owner: action.owner, milestone: action.milestone,
    'acceptance test': action.acceptanceTest, 'expected artifact': action.expectedArtifact, 'remaining risk': action.incompleteRisk,
  })) if (!value.trim()) issues.push(`Missing ${label}.`);
  if (action.status === 'Verified') {
    if (action.verification.result !== 'Pass') issues.push('Verification has not passed.');
    if (!action.verification.reviewer.trim() || !Number.isFinite(Date.parse(action.verification.at)) || !action.verification.environment.trim()) issues.push('Verification reviewer, valid date and environment are required.');
    if (!action.verification.artifactSourceIds.length || action.verification.artifactSourceIds.some(id => !sourceIds.includes(id))) issues.push('Verification artifacts are missing or unavailable.');
  }
  return issues;
}

export function evidenceAttestationIssues(risk: RiskRecord, quality: AssessmentQuality, sources: readonly EvidenceSource[]): string[] {
  const issues: string[] = [];
  const availableIds = sources.filter(source => source.status === 'Complete' && !source.derived
    && source.kind === 'verification-artifact' && quality.sourceIds.includes(source.id)).map(source => source.id);
  if (risk.controls.some(control => control.state !== 'Current' && control.verified)) issues.push('Planned, proposed or assumed controls cannot be verified current controls.');
  if (risk.controls.some(control => control.verified && (!control.artifactSourceIds.length
    || control.artifactSourceIds.some(id => !availableIds.includes(id))))) issues.push('Verified current controls require available primary-source artifacts.');
  if (risk.missingEvidence.some(request => request.resolved && (!request.supplier.trim() || !request.verification.trim()
    || !request.artifactSourceIds.length || request.artifactSourceIds.some(id => !availableIds.includes(id))))) {
    issues.push('Resolved evidence requests require a supplier, verification check and retained primary-source artifacts.');
  }
  return issues;
}

export function riskIssues(risk: RiskRecord, quality: AssessmentQuality, sources: readonly EvidenceSource[], now = new Date()): string[] {
  const issues = [...risk.issues, ...evidenceAttestationIssues(risk, quality, sources)];
  if (!scenarioValues(risk.scenario).every(value => value.trim())) issues.push('Scenario actor, preconditions, action, asset and consequence must be recorded.');
  if (!risk.owner.trim()) issues.push('Risk owner is unconfirmed.');
  if (!risk.confidence.reason.trim()) issues.push('Confidence rationale is missing.');
  for (const reference of risk.references) {
    const issue = referenceIssue(reference, sources);
    if (issue) issues.push(`${reference.sourceId}: ${issue}`);
  }
  if (risk.evidenceStatus === 'Observed' && !risk.references.length) issues.push('Observed claim has no reproducible source.');
  if (risk.evidenceStatus === 'Observed' && risk.references.some(ref => sources.find(source => source.id === ref.sourceId)?.derived)) issues.push('A generated digest cannot establish a primary-source observation.');
  const availableIds = sources.filter(source => source.status === 'Complete' && !source.derived
    && source.kind === 'verification-artifact' && quality.sourceIds.includes(source.id)).map(source => source.id);
  const evidencedControls = risk.controls.filter(control => control.state === 'Current' && control.verified
    && control.artifactSourceIds.length && control.artifactSourceIds.every(id => availableIds.includes(id)));
  const inherent = rateRisk(risk.inherent).score;
  const current = rateRisk(risk.current).score;
  if (inherent !== null && current !== null && current < inherent && !evidencedControls.length) issues.push('Current risk cannot be reduced by unevidenced controls.');
  if (rateRisk(risk.current).score !== null && (!risk.current.rationale.trim() || !risk.current.reviewer.trim())) issues.push('Current risk rating requires rationale and a reviewer.');
  if (quality.conflicts.some(conflict => !conflict.resolved && (!conflict.riskIds.length || conflict.riskIds.includes(risk.id)))) issues.push('Material conflicting claims remain unresolved.');
  if (current === null) issues.push('Current business risk is not rated.');
  if (['Closed with evidence', 'Accepted risk'].includes(risk.disposition)) {
    if (current === null) issues.push('A terminal decision requires a reviewed current risk rating.');
    if (!quality.rubric.approvedBy.trim() || !Number.isFinite(Date.parse(quality.rubric.approvedAt))) issues.push('The business risk rubric has not been approved.');
  }
  if (risk.disposition === 'Closed with evidence') {
    if (risk.missingEvidence.some(request => !request.resolved || !request.supplier.trim() || !request.verification.trim()
      || !request.artifactSourceIds.length || request.artifactSourceIds.some(id => !availableIds.includes(id)))) issues.push('Closure requires resolution and verification artifacts for outstanding evidence requests.');
    if (!risk.actions.length || risk.actions.some(action => action.status !== 'Verified' || actionIssues(action, availableIds).length
      || action.verification.environment !== quality.environment)) issues.push('Closure requires complete actions and passing verification evidence for the assessed environment.');
    if (!risk.decision.owner.trim() || !risk.decision.rationale.trim() || !Number.isFinite(Date.parse(risk.decision.at))) issues.push('Closure reviewer, rationale and valid date are required.');
  }
  if (risk.disposition === 'Accepted risk') {
    if (!risk.decision.owner.trim() || !risk.decision.rationale.trim() || !Number.isFinite(Date.parse(risk.decision.at)) || !risk.decision.reviewTrigger.trim()) issues.push('Acceptance requires a decision owner, valid date, rationale and review trigger.');
    const expires = Date.parse(risk.decision.expiresAt);
    if (!Number.isFinite(expires) || expires <= now.getTime()) issues.push('Acceptance is missing an expiry or has expired.');
    if (rateRisk(risk.current).score === null) issues.push('Acceptance cannot hide an unrated current risk.');
  }
  return [...new Set(issues)];
}

export function riskDefinition(risk: RiskRecord): string {
  return JSON.stringify([scenarioValues(risk.scenario), risk.references, risk.missingEvidence.map(request => [request.question, request.verification]),
    risk.controls.map(control => [control.description, control.state]),
    risk.actions.map(action => [action.id, action.description, action.acceptanceTest, action.expectedArtifact, action.dependencies, action.requirements])]);
}

export function resetRiskReview(risk: RiskRecord): void {
  risk.inherent = unknownRating(); risk.current = unknownRating(); risk.target = unknownRating();
  if (['Closed with evidence', 'Accepted risk'].includes(risk.disposition)) risk.disposition = 'Owner acceptance required';
  risk.decision = { owner: '', rationale: '', at: '', expiresAt: '', reviewTrigger: '' };
  risk.controls.forEach(control => { control.verified = false; });
  risk.missingEvidence.forEach(request => { request.resolved = false; });
  risk.actions.forEach(action => {
    if (action.status === 'Verified') action.status = 'Awaiting verification';
    action.verification = { result: 'Not run', artifactSourceIds: [], reviewer: '', at: '', environment: '' };
  });
}

export function changeAssessmentScope(quality: AssessmentQuality, change: Partial<Pick<AssessmentQuality, 'scope' | 'environment' | 'systemVersion'>>): AssessmentQuality {
  const next = structuredClone(quality);
  if (!(Object.keys(change) as (keyof typeof change)[]).some(key => next[key] !== change[key])) return next;
  Object.assign(next, change);
  next.releaseDecision = emptyReleaseDecision();
  next.risks.forEach(resetRiskReview);
  next.coverage.forEach(row => { row.state = 'Not assessed'; row.owner = ''; });
  next.coverage.forEach(row => row.requests?.forEach(request => { request.resolved = false; }));
  next.conflicts.forEach(conflict => { conflict.resolved = false; conflict.resolution = ''; });
  return next;
}

export function reviewChangeIssues(previous: AssessmentQuality, next: AssessmentQuality): string[] {
  const contextChanged = (['scope', 'environment', 'systemVersion'] as const).some(key => previous[key] !== next[key]);
  const issues: string[] = [];
  for (const risk of next.risks) {
    const old = previous.risks.find(item => item.id === risk.id);
    if (!old || (!contextChanged && riskDefinition(old) === riskDefinition(risk))) continue;
    if ((['inherent', 'current', 'target'] as const).some(key => risk[key].likelihood !== null || risk[key].impact !== null)
      || risk.controls.some(control => control.verified) || risk.missingEvidence.some(request => request.resolved)
      || risk.actions.some(action => action.status === 'Verified' || action.verification.result !== 'Not run')
      || ['Closed with evidence', 'Accepted risk'].includes(risk.disposition)) {
      issues.push(`${risk.id}: save changed scope, scenario or treatment definitions with ratings and verification reset before recording a fresh review.`);
    }
  }
  if (contextChanged && next.coverage.some(row => row.state !== 'Not assessed')) issues.push('Changed scope requires coverage to be saved as Not assessed before re-review.');
  return issues;
}

export function architectureDefinition(graph: SystemRepresentationGraph): string {
  return JSON.stringify({
    components: [...graph.components].sort((a, b) => a.id.localeCompare(b.id)).map(component => ({
      ...component, metadata: Object.entries(component.metadata || {}).filter(([key]) => !['position', 'positions'].includes(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    })),
    edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)), trustBoundaries: [...graph.trustBoundaries].sort(),
  });
}

export function assessmentSummary(quality?: AssessmentQuality) {
  if (!quality) return { label: 'Legacy / unverified', blockers: 0, accepted: 0, closed: 0, unrated: 0, rated: 0, highest: 'Not rated' };
  const ratings = quality.risks.map(risk => rateRisk(risk.current));
  const highest = ratings.reduce<{ score: number | null; band: string }>((top, rating) =>
    (rating.score ?? -1) > (top.score ?? -1) ? rating : top, { score: null, band: 'Not rated' });
  const unrated = ratings.filter(rating => rating.score === null).length;
  return {
    label: unrated && highest.score !== null ? `Incomplete: ${unrated} not rated; highest rated ${highest.band}` : highest.band,
    highest: highest.band,
    blockers: quality.risks.filter(risk => risk.disposition === 'Blocker').length,
    accepted: quality.risks.filter(risk => risk.disposition === 'Accepted risk' && Date.parse(risk.decision.expiresAt) > Date.now()).length,
    closed: quality.risks.filter(risk => risk.disposition === 'Closed with evidence').length,
    unrated, rated: ratings.length - unrated,
  };
}

export function initialCoverage(graph: SystemRepresentationGraph): AssessmentQuality['coverage'] {
  return [
    ...graph.components.map(component => ({ id: `component:${component.id}`, kind: 'Component' as const, name: component.name })),
    ...graph.edges.map(edge => ({ id: `flow:${edge.id}`, kind: 'Flow' as const, name: `${edge.sourceId} -> ${edge.targetId}: ${edge.label || edge.id}` })),
  ].map(item => ({ ...item, state: 'Not assessed', rationale: '', owner: '', references: [] }));
}

export async function scenarioIdentity(systemId: string, scenario: RiskRecord['scenario'], componentIds: string[], flowIds: string[], environment = '') {
  if (!scenarioValues(scenario).every(value => value.trim() && !/^(?:unknown\b|not (?:known|provided|assessed|specified)\b|tbd\b)/i.test(value.trim()))) return undefined;
  return `RISK-${await hashInput(JSON.stringify([systemId, environment, ...scenarioValues(scenario).map(value => value.trim().replace(/\s+/g, ' ')),
    [...new Set(componentIds)].sort(), [...new Set(flowIds)].sort()]))}`;
}

export function unknownRisk(threat: Threat): RiskRecord {
  return {
    id: threat.id, scenario: { actor: '', preconditions: '', action: '', asset: '', consequence: '' },
    frameworkTags: [threat.category], evidenceStatus: 'Hypothesis', confidence: { level: 'Low', reason: 'Source support and scenario details require review.' },
    references: [], owner: '', disposition: ['Critical', 'High'].includes(threat.severity) ? 'Blocker' : 'Owner acceptance required',
    inherent: unknownRating(), current: unknownRating(), target: unknownRating(), controls: [],
    missingEvidence: [{ question: 'Validate the scenario and its implementation/deployment assumptions.', supplier: '', verification: 'Provide located source excerpts and deployment/control verification evidence.', resolved: false, artifactSourceIds: [] }],
    actions: [], decision: { owner: '', rationale: '', at: '', expiresAt: '', reviewTrigger: '' },
    reviewTrigger: 'Source, architecture, deployment, control or incident changes.', issues: [], observationIds: [],
  };
}

export async function createAssessmentQuality(
  inputThreats: Threat[], graph: SystemRepresentationGraph, sources: EvidenceSource[],
  options: { systemId: string; parentAssessmentId?: string; parentAssessmentRevision?: number; scope: string; environment?: string; systemVersion?: string; stageIssues?: string[] },
): Promise<{ threats: Threat[]; quality: AssessmentQuality }> {
  const threats: Threat[] = [];
  const quality: AssessmentQuality = {
    schemaVersion: 1, revision: 1, systemId: options.systemId, parentAssessmentId: options.parentAssessmentId || '',
    parentAssessmentRevision: options.parentAssessmentRevision || 0,
    evidenceCutoff: new Date().toISOString(), rubric: { version: 'seidr-5x5-v1', approvedBy: '', approvedAt: '' },
    scope: options.scope, environment: options.environment || '', systemVersion: options.systemVersion || '',
    promptVersion: 'evidence-v1', sourceIds: [...new Set(sources.map(source => source.id))],
    risks: [], coverage: initialCoverage(graph), conflicts: [], observations: [], reconciliation: [],
    stageIssues: options.stageIssues || [], history: [],
  };
  for (const raw of inputThreats) {
    const [threat] = parseThreats([raw]);
    const observationId = `OBS-${crypto.randomUUID()}`;
    const risk = unknownRisk(threat);
    if (threat.qualityProposal) Object.assign(risk, threat.qualityProposal);
    for (const reference of risk.references) {
      const issue = referenceIssue(reference, sources);
      if (issue) { risk.issues.push(`${reference.sourceId}: ${issue}`); risk.evidenceStatus = 'Hypothesis'; }
    }
    if (risk.evidenceStatus === 'Observed' && (!risk.references.length || risk.references.some(reference => sources.find(source => source.id === reference.sourceId)?.derived))) {
      risk.evidenceStatus = 'Hypothesis';
      risk.issues.push('The proposed observation has no reproducible primary-source reference; verify before relying on it.');
    }
    if (risk.evidenceStatus !== 'Observed' && !risk.missingEvidence.length) risk.missingEvidence = unknownRisk(threat).missingEvidence;
    // Agent-proposed controls cannot attest to runtime effectiveness.
    risk.controls = risk.controls.map(control => ({ ...control, verified: false }));
    risk.missingEvidence = risk.missingEvidence.map(request => ({ ...request, resolved: false, artifactSourceIds: [] }));
    const identity = await scenarioIdentity(options.systemId, risk.scenario, threat.affectedComponentIds ?? [threat.componentId], threat.affectedFlowIds || [], options.environment);
    const riskId = identity || `RISK-${crypto.randomUUID()}`;
    quality.observations.push({ id: observationId, originalId: threat.id, category: threat.category, riskId, finding: structuredClone(threat), origin: threat.analysisOrigin || 'Unspecified' });
    const existing = quality.risks.find(item => item.id === riskId);
    if (existing) {
      existing.observationIds.push(observationId);
      existing.frameworkTags = [...new Set([...existing.frameworkTags, ...risk.frameworkTags])];
      existing.references = [...new Map([...existing.references, ...risk.references].map(ref => [JSON.stringify(ref), ref])).values()];
      existing.missingEvidence = [...new Map([...existing.missingEvidence, ...risk.missingEvidence].map(request => [JSON.stringify(request), request])).values()];
      existing.controls = [...new Map([...existing.controls, ...risk.controls].map(control => [JSON.stringify(control), control])).values()];
      quality.reconciliation.find(item => item.riskId === riskId)!.observationIds.push(observationId);
      continue;
    }
    risk.id = riskId;
    risk.observationIds = [observationId];
    quality.risks.push(risk);
    quality.reconciliation.push({ riskId, observationIds: [observationId], reason: identity
      ? 'Exact normalized scenario, system, environment, component and flow match only; no title-based merge.'
      : 'Incomplete structured scenario; retained separately for human reconciliation.' });
    threats.push({ ...threat, id: riskId });
  }
  return { threats, quality: qualitySchema.parse(quality) };
}
