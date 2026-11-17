import { z } from 'zod';
import { coverageSchema, initialCoverage, referenceIssue, referenceSchema, riskSchema, threatSchema, type AssessmentQuality, type EvidenceSource } from './assessmentQuality.ts';
import type { SystemRepresentationGraph } from './types.ts';

const profiles = [
  { id: 'ai', name: 'AI systems', match: /\b(LLM|language model|generative AI|machine learning|OpenAI|Copilot|prompt injection)\b/i,
    checks: ['Untrusted and hidden input / prompt injection', 'Output handling and tool authority', 'Model/provider drift and repeatability', 'Resource exhaustion and inference limits'] },
  { id: 'decision', name: 'Consequential decisions', match: /\b(eligibility|credit scor\w*|hiring|recruitment|medical triage|automated decision|benefit entitlement|fraud scor\w*)\b/i,
    checks: ['Accuracy, fairness and representative validation', 'Human oversight, automation bias and appeals', 'Score use, workflow integrity and privileged misuse', 'Silent failures and unintended exclusion'] },
  { id: 'privacy', name: 'Privacy / governance', match: /\b(personal data|PII|GDPR|biometric|patient|customer record|tenant record|privacy|retention)\b/i,
    checks: ['Actual purposes, applicable jurisdictions and lawful basis', 'Notice, retention, deletion and downstream propagation', 'Sensitive copies, third parties and data-subject impacts'] },
];

export function selectedProfiles(sources: readonly EvidenceSource[]) {
  return profiles.map(profile => {
    for (const source of sources) {
      if (source.derived || source.status === 'Unavailable') continue;
      const lines = source.text.split(/\r?\n/);
      const index = lines.findIndex(line => profile.match.test(line));
      if (index >= 0) return { ...profile, references: [{ sourceId: source.id, startLine: index + 1, endLine: index + 1, quote: lines[index] }] };
    }
    return { ...profile, references: [] };
  });
}

const pendingRow = (id: string, kind: AssessmentQuality['coverage'][number]['kind'], name: string, question: string) => coverageSchema.parse({
  id, kind, name, state: 'Not assessed', rationale: '', owner: '', references: [],
  requests: [{ question, supplier: 'System/service owner (role to confirm)', verification: 'Provide located design/configuration evidence and an environment-specific verification result.',
    resolved: false, artifactSourceIds: [] }],
});

export function buildReviewInventory(graph: SystemRepresentationGraph, sources: readonly EvidenceSource[]): AssessmentQuality['coverage'] {
  const rows = initialCoverage(graph).map(row => coverageSchema.parse(row));
  for (const edge of graph.edges) rows.push(pendingRow(`integration:${edge.id}`, 'Integration',
    `${edge.sourceId} -> ${edge.targetId}: caller, identity, destination, credentials, data contract, owner, environment and regional routes`,
    `For ${edge.id}, establish caller authorization, destination/redirect allowlists, credential authority, data contract, accountable owner, environment/regional routing, state changes, retries/idempotency, duplicate processing, reconciliation, error propagation, auditability and system-of-record impact. Retain positive and negative/failure-case tests; do not execute live probes without authorized scope.`));
  for (const destination of ['logs / monitoring', 'caches', 'exports', 'backups / recovery', 'derived copies', 'third parties']) {
    rows.push(pendingRow(`destination:${destination}`, 'Sensitive destination', `Potential sensitive destination: ${destination} (verify applicability)`,
      `Does sensitive data or a credential reach ${destination} in transit, in use or at rest? Identify actual locations, authority, retention, deletion and downstream propagation, or justify non-applicability.`));
  }
  for (const item of ['administrative paths', 'jobs / queues / asynchronous state', 'regions / failure routes', 'identity / model providers', 'trust-boundary crossings']) {
    rows.push(pendingRow(`inventory:${item}`, 'Specialist check', `Inventory completeness: ${item}`,
      `Identify ${item}, owners and evidence independently of findings; list absent information explicitly rather than assuming these paths are safe or absent.`));
  }
  for (const profile of selectedProfiles(sources)) {
    if (!profile.references.length) {
      rows.push(pendingRow(`profile:${profile.id}:applicability`, 'Specialist check', `${profile.name}: applicability unverified`,
        `Confirm whether ${profile.name.toLowerCase()} features exist in scope; lack of documentation is not proof of non-applicability.`));
    } else for (const [index, check] of profile.checks.entries()) {
      const row = pendingRow(`profile:${profile.id}:${index}`, 'Specialist check', `${profile.name}: ${check}`,
        `Assess ${check.toLowerCase()} against the actual evidenced system. Distinguish documented claims from deployment behavior; request specialist verification and do not invent applicable law or certify compliance.`);
      row.proposal = { result: 'Documented', rationale: 'A primary-source signal selects this review profile; feature applicability, controls and effectiveness still require review.',
        references: profile.references };
      rows.push(row);
    }
  }
  return rows;
}

export const assessmentAnalysisSchema = z.object({
  coverage: z.array(z.object({
    id: z.string().min(1), result: z.enum(['Documented', 'Unknown', 'Not applicable', 'Conflicting']),
    rationale: z.string().min(1), references: z.array(referenceSchema), requests: riskSchema.shape.missingEvidence,
  })),
  conflicts: z.array(z.object({
    description: z.string().min(1), references: z.array(referenceSchema).min(2), verification: z.string().min(1),
    componentIds: z.array(z.string()), flowIds: z.array(z.string()),
  })),
  inventoryAdditions: z.array(z.object({
    name: z.string().min(1), kind: z.enum(['Component', 'Flow', 'Sensitive destination', 'Integration', 'Specialist check']),
    rationale: z.string().min(1), references: z.array(referenceSchema).min(1),
    question: z.string().min(1), supplier: z.string().min(1), verification: z.string().min(1),
  })),
  additionalFindings: z.array(threatSchema.extend({ qualityProposal: threatSchema.shape.qualityProposal.unwrap() })),
  requirements: z.array(z.object({ externalId: z.string(), description: z.string().min(1), references: z.array(referenceSchema).min(1) })).default([]),
});

export function parseAssessmentAnalysis(value: unknown, inventory: AssessmentQuality['coverage'], sources: readonly EvidenceSource[], graph?: SystemRepresentationGraph) {
  const result = assessmentAnalysisSchema.parse(value);
  const expected = new Set(inventory.map(row => row.id));
  const seen = new Set<string>();
  for (const row of result.coverage) {
    if (!expected.has(row.id) || seen.has(row.id)) throw new Error('Review coverage contains an unknown or duplicate inventory ID.');
    seen.add(row.id);
    if (row.result !== 'Unknown' && !row.references.length) throw new Error(`${row.id}: a non-unknown proposal needs located evidence.`);
    if (row.result === 'Unknown' && !row.requests.length) throw new Error(`${row.id}: unknown coverage needs an owner-role verification request.`);
    if (row.requests.some(request => !request.question.trim() || !request.supplier.trim() || !request.verification.trim()
      || request.resolved || request.artifactSourceIds.length)) throw new Error('AI evidence requests need a question, supplier role and check, and cannot assert verification.');
    for (const reference of row.references) {
      const issue = referenceIssue(reference, sources); if (issue) throw new Error(`${row.id}: ${issue}`);
    }
  }
  if (seen.size !== expected.size) throw new Error('The review omitted inventory rows; omitted is not examined.');
  for (const item of [...result.conflicts, ...result.inventoryAdditions, ...result.requirements]) {
    for (const reference of item.references) {
      const issue = referenceIssue(reference, sources); if (issue) throw new Error(issue);
    }
  }
  for (const conflict of result.conflicts) if (new Set(conflict.references.map(reference => JSON.stringify(reference))).size < 2) {
    throw new Error('A conflict must retain two distinct located claims.');
  }
  if (graph) {
    for (const item of [...result.conflicts, ...result.additionalFindings.map(finding => ({
      componentIds: finding.affectedComponentIds || [finding.componentId], flowIds: finding.affectedFlowIds || [],
    }))]) if (item.componentIds.some(id => !graph.components.some(component => component.id === id))
      || item.flowIds.some(id => !graph.edges.some(edge => edge.id === id))) throw new Error('Review references an unknown component or flow ID.');
  }
  return result;
}
