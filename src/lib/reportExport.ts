import type { ThreatModel } from './db';
import type { ComplianceGap, SystemRepresentationGraph, Threat } from './backend/types';
import { buildC4Mermaid, systemName, toC4Element, visibleComponents, visibleRelations } from './c4Model.ts';
import { assessmentExportSchema, qualitySchema, rateRisk, type EvidenceSource } from './backend/assessmentQuality.ts';
import { assessmentReadiness } from './backend/assessmentWorkflow.ts';

export interface ExportReport extends ThreatModel {
  threats: Threat[];
  srg: SystemRepresentationGraph;
  complianceGaps: ComplianceGap[];
  uiStrings?: Record<string, string>;
  evidenceManifest?: Omit<EvidenceSource, 'text'>[];
}

export const REPORT_STRINGS = {
  reportTitle: 'Threat Model Report',
  reportSubtitle: 'Security and privacy risk assessment',
  qualityLanguageNote: 'The evidence and decision appendix retains original record language and exact state/identifier terminology. Translated summaries are reading aids, not newly approved decisions or translated source quotations.',
  systemName: 'System name',
  modelId: 'Assessment ID',
  dateGenerated: 'Assessment date',
  framework: 'Assessment methodology',
  riskScore: 'Overall risk score',
  findingsSummary: 'Findings summary',
  systemOverview: 'System overview',
  totalFindings: 'Total findings',
  affectedComponents: 'Affected components',
  priorityFindings: 'Prioritized findings',
  priorityNote: 'Ordered by severity (Critical to Low), then descending CVSS score within each severity. Unrated findings appear last. Priority numbers link to the full finding.',
  priority: 'Priority',
  findingId: 'Finding ID',
  title: 'Finding',
  severity: 'Severity',
  cvss: 'CVSS estimate',
  category: 'Framework categories',
  component: 'Components affected',
  affectedFlows: 'Data flows affected',
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unrated: 'Unrated',
  architecture: 'C4 architecture - Component level (L3)',
  architectureNote: 'Component-level view with available container context. Arrows show recorded relationships; the dashed system boundary is not a verified security control.',
  legacyArchitectureNote: 'Component-level detail was not recorded. The available architecture is shown without inventing internal components.',
  noArchitecture: 'No architecture was recorded for this assessment. Generate or update the C4 architecture before relying on this report for component coverage.',
  diagramNotPrepared: 'Use Export Report > PDF to include the rendered architecture diagram.',
  architectureRegister: 'Architecture reference',
  componentRegister: 'Component register',
  relationshipRegister: 'Relationship register',
  technology: 'Type / technology',
  relationship: 'Relationship / protocol',
  trustBoundaries: 'Recorded trust boundaries',
  identifiedThreats: 'Detailed findings and mitigation actions',
  noThreats: 'No findings were recorded. This does not establish that the system is free of threats.',
  description: 'Description and impact',
  evidence: 'Evidence and source references',
  exploitationPath: 'Exploitation path',
  exploitationRisk: 'Exploitation risk',
  riskNote: 'CVSS estimates technical severity, not the probability of exploitation. Findings are modeled risks, not proof of a successful exploit or live testing.',
  missingRisk: 'No separate exploitation-likelihood assessment was recorded. Validate attack prerequisites, existing controls and impact before accepting this risk.',
  suggestedMitigation: 'Suggested mitigation action',
  noMitigation: 'No mitigation action was recorded. Define and validate a treatment plan before closing this finding.',
  dread: 'DREAD assessment',
  dreadNote: 'DREAD dimensions are scored from 1 to 10; the mean is calculated separately from CVSS. Older assessments may record DREAD only in the exploitation-path text.',
  damage: 'Damage',
  reproducibility: 'Reproducibility',
  exploitability: 'Exploitability',
  affectedUsers: 'Affected users',
  discoverability: 'Discoverability',
  dreadMean: 'DREAD mean',
  treatmentStatus: 'Treatment status',
  justification: 'Risk acceptance / treatment justification',
  complianceGaps: 'Compliance mapping',
  noGaps: 'No compliance mappings were recorded. This is not a compliance certification.',
  controlId: 'Control ID',
  status: 'Status',
  details: 'Details',
  scope: 'Assessment scope and input coverage',
  scopeNote: 'Coverage records what reached the analysis. Failed, excluded, empty or truncated inputs limit the conclusions. Original attachment files are not embedded in this report.',
  noInputs: 'Detailed input-coverage records are unavailable for this assessment.',
  source: 'Source / input',
  inputKind: 'Input type',
  retained: 'Characters used / source',
  notRecorded: 'Not recorded',
  noDescription: 'No system description summary was recorded.',
  generatedBy: 'Prepared with Seidr AI Threat Modeling',
};

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export const DREAD_DIMENSIONS = ['damage', 'reproducibility', 'exploitability', 'affectedUsers', 'discoverability'] as const;

export const reportStrings = (model: ExportReport) => ({
  ...REPORT_STRINGS,
  ...Object.fromEntries(Object.entries(model.uiStrings || {}).filter(([, value]) => typeof value === 'string' && value.trim())),
});

export const validScore = (score: unknown, min = 0): score is number =>
  typeof score === 'number' && Number.isFinite(score) && score >= min && score <= 10;

export const scoreLabel = (score: unknown, missing: string) => validScore(score) ? score.toFixed(1) : missing;

export const severityKey = (severity: string) =>
  SEVERITIES.includes(severity as Threat['severity']) ? severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low' : 'unrated';

export const prioritizeThreats = (threats: Threat[] = []) => [...threats].sort((a, b) => {
  const rank = (severity: string) => {
    const index = SEVERITIES.indexOf(severity as Threat['severity']);
    return index === -1 ? SEVERITIES.length : index;
  };
  return rank(a.severity) - rank(b.severity)
    || (validScore(b.cvssScore) ? b.cvssScore : -1) - (validScore(a.cvssScore) ? a.cvssScore : -1);
});

export function mitigationActions(threat: Threat): string[] {
  return [...new Set([threat.mitigation, ...(threat.mitigations || [])]
    .filter((text): text is string => typeof text === 'string' && !!text.trim()).map(text => text.trim()))];
}

export function affectedComponent(threat: Threat, srg: SystemRepresentationGraph, missing: string): string {
  if (Array.isArray(threat.affectedComponentIds)) {
    return [...new Set(threat.affectedComponentIds)].map(id => {
      const component = srg?.components?.find(component => component.id === id);
      return component ? `${component.name} [${component.id}]` : `${id} (unresolved reference)`;
    }).join('; ') || missing;
  }
  const value = threat.componentId?.trim();
  if (!value) return missing;
  const component = srg?.components?.find(c => c.id.toLowerCase() === value.toLowerCase() || c.name.toLowerCase() === value.toLowerCase());
  return component ? `${component.name} [${component.id}]` : value;
}

export function dreadMean(threat: Threat): number | undefined {
  const scores = DREAD_DIMENSIONS.map(key => threat.dread?.[key]);
  return scores.every(value => validScore(value, 1))
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined;
}

export function reportOverview(model: ExportReport): string {
  if (model.assessmentMeta?.descriptionSummary?.trim()) return model.assessmentMeta.descriptionSummary;
  const raw = model.description || '';
  const description = raw.match(/=== SYSTEM DESCRIPTION[^\n]*===\s*([\s\S]*?)(?=\n=== |$)/)?.[1]
    || raw.match(/System Description:\s*([\s\S]*?)(?=\n\s*Deployment Model:|$)/)?.[1] || raw;
  const text = description.split(/\n=== |\n\s*Attached Context Documents Content:|\n\s*Architecture Diagram Analyses:/)[0].replace(/\s+/g, ' ').trim();
  return !text || text === 'Not provided' ? '' : text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}

export function reportFindings(model: ExportReport) {
  const t = reportStrings(model);
  const risks = new Map((model.quality?.risks || []).map(risk => [risk.id, risk]));
  return prioritizeThreats(model.threats).map((original, index) => {
    const risk = risks.get(original.id);
    const threat = risk?.treatmentNarrative ? { ...original, mitigation: risk.treatmentNarrative, mitigations: [] } : original;
    return {
    threat, priority: index + 1, anchor: `report-finding-${index + 1}`,
    component: affectedComponent(threat, model.srg, t.notRecorded),
    mitigations: mitigationActions(threat),
  }; });
}

export function reportArchitecture(srg: SystemRepresentationGraph) {
  const selected = visibleComponents(srg, 'L3');
  const elements = (selected.length ? selected : srg?.components || []).map(toC4Element);
  const relations = visibleRelations(srg, new Set(elements.map(c => c.id)));
  return {
    elements, relations,
    hasComponentDetail: elements.some(c => c.c4Level === 'L3' || c.c4Type === 'Component'),
    definition: elements.length ? buildC4Mermaid(elements, relations, {
      direction: 'LR', boundaryLabel: systemName(srg), showDescriptions: false,
    }) : '',
  };
}

let diagramCounter = 0;
export async function renderReportDiagram(model: ExportReport): Promise<string> {
  const { definition } = reportArchitecture(model.srg);
  if (!definition) return '';
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'neutral',
    fontFamily: 'Arial, Helvetica, sans-serif',
    flowchart: { htmlLabels: false, curve: 'basis', padding: 12, nodeSpacing: 30, rankSpacing: 45, wrappingWidth: 200 },
  });
  const { svg } = await mermaid.render(`seidr-report-c4-${++diagramCounter}`, definition);
  return svg;
}

export function buildFindingsCsv(model: ExportReport): string {
  const t = reportStrings(model);
  const headers = [t.priority, t.findingId, t.title, t.severity, `${t.cvss} / 10`, t.framework, t.category, t.component, t.affectedFlows,
    t.description, t.evidence, t.exploitationPath, t.suggestedMitigation, t.exploitationRisk,
    ...DREAD_DIMENSIONS.map(key => `DREAD: ${t[key]} / 10`), `${t.dreadMean} / 10`, t.treatmentStatus, t.justification,
    ...(model.quality ? ['Evidence status', 'Confidence level', 'Confidence rationale', 'Confirmed owner', 'Disposition',
      'Current business risk', 'Current likelihood / 5', 'Current impact / 5', 'Current rationale', 'Inherent business risk',
      'Conditional target business risk', 'Framework lenses', 'Located evidence', 'Recorded controls', 'Verification requests',
      'Actions and tests', 'Owner decision', 'Rubric', 'System ID', 'Assessment revision', 'Scope', 'Environment', 'System version',
      'Evidence cutoff', 'Collection and stage limitations', 'Source manifest', 'Owner system decision', 'Application recommendation',
      'Decision-impact checks', 'Coverage inventory and proposals', 'Material conflicts', 'Sourced requirements', 'Generation provenance',
      'Run status', 'Treatment generation state', 'Treatment narrative', 'CVSS version', 'CVSS vector', 'CVSS rationale'] : [])];
  const findings = reportFindings(model);
  const quality = model.quality ? qualitySchema.parse(model.quality) : undefined;
  const readiness = quality ? assessmentReadiness(quality) : undefined;
  const rows = findings.map(({ threat, priority, component, mitigations }) => [
    priority, threat.id, threat.title, t[severityKey(threat.severity)], scoreLabel(threat.cvssScore, t.notRecorded),
    model.framework, threat.category, component, (threat.affectedFlowIds || []).join('; ') || t.notRecorded, threat.description, threat.evidence, threat.reasoning,
    mitigations.join('\n\n') || t.noMitigation, threat.exploitationRisk || t.missingRisk,
    ...DREAD_DIMENSIONS.map(key => validScore(threat.dread?.[key], 1) ? threat.dread[key] : t.notRecorded),
    scoreLabel(dreadMean(threat), t.notRecorded), threat.status, threat.justification,
  ]);
  if (quality) rows.forEach((row, index) => {
    const risk = quality.risks.find(risk => risk.id === findings[index].threat.id);
    if (!risk) throw new Error('A finding is missing its canonical risk record.');
    row.push(risk.evidenceStatus, risk.confidence.level, risk.confidence.reason, risk.owner, risk.disposition,
      rateRisk(risk.current).band, risk.current.likelihood ?? t.notRecorded, risk.current.impact ?? t.notRecorded,
      risk.current.rationale, rateRisk(risk.inherent).band, rateRisk(risk.target).band, risk.frameworkTags.join('; '),
      JSON.stringify(risk.references), JSON.stringify(risk.controls), JSON.stringify(risk.missingEvidence),
      JSON.stringify(risk.actions), JSON.stringify(risk.decision), quality.rubric.version, quality.systemId,
      quality.revision, quality.scope, quality.environment, quality.systemVersion, quality.evidenceCutoff,
      quality.stageIssues.join('\n'), JSON.stringify(model.evidenceManifest || []), JSON.stringify(quality.releaseDecision),
      readiness!.recommendation, readiness!.reasons.join('\n'),
      JSON.stringify(quality.coverage), JSON.stringify(quality.conflicts), JSON.stringify(quality.requirements), JSON.stringify(quality.generation),
      JSON.stringify(quality.run), risk.treatmentState, risk.treatmentNarrative,
      findings[index].threat.cvssVersion || 'Not recorded', findings[index].threat.cvssVector || 'Not recorded', findings[index].threat.cvssRationale || 'Not recorded');
  });
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    // Repository and model text can be interpreted as spreadsheet formulas.
    const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}

export function buildAssessmentExport(model: ExportReport, language = 'en') {
  if (!model.quality) throw new Error('Legacy assessments have no versioned evidence/decision register. Use their explicitly labelled legacy export or redo them.');
  const parsed = assessmentExportSchema.parse({
    schemaVersion: 'seidr-assessment-v1',
    metadata: { id: model.id, name: model.name, date: model.date, framework: model.framework || '', language },
    assessment: model.quality, graph: model.srg, findings: model.threats, controlMappings: model.complianceGaps,
    sourceManifest: model.evidenceManifest || [],
  });
  if (parsed.assessment.sourceIds.some(id => !parsed.sourceManifest.some(source => source.id === id))) throw new Error('Export source manifest is incomplete.');
  if (parsed.sourceManifest.some(source => source.parentSourceIds.some(id => !parsed.sourceManifest.some(parent => parent.id === id)))) {
    throw new Error('Export source lineage is incomplete.');
  }
  if (parsed.findings.length !== parsed.assessment.risks.length || parsed.findings.some(finding => !parsed.assessment.risks.some(risk => risk.id === finding.id))) {
    throw new Error('Export findings and canonical risk register disagree.');
  }
  return parsed;
}

const TRANSLATABLE_THREAT_FIELDS = ['title', 'description', 'evidence', 'reasoning', 'mitigation', 'exploitationRisk', 'justification'] as const;

export function reportTranslationPayload(model: ExportReport) {
  return {
    name: model.name, overview: reportOverview(model),
    threats: (model.threats || []).map(threat => ({
      id: threat.id,
      ...Object.fromEntries(TRANSLATABLE_THREAT_FIELDS.filter(key => typeof threat[key] === 'string').map(key => [key, threat[key]])),
      ...(threat.mitigations ? { mitigations: threat.mitigations } : {}),
    })),
    complianceGaps: (model.complianceGaps || []).map((gap, index) => ({
      translationId: String(index), controlId: gap.controlId, title: gap.title, description: gap.description,
    })),
    uiStrings: REPORT_STRINGS,
  };
}

export function mergeReportTranslation(model: ExportReport, translated: unknown): ExportReport {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Report translation returned an invalid object.');
    return value as Record<string, unknown>;
  };
  const text = (value: unknown): string => {
    if (typeof value !== 'string') throw new Error('Report translation omitted required text.');
    return value;
  };
  const result = object(translated);
  const items = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error('Report translation omitted its finding or compliance list.');
    return value.map(object);
  };
  const actions = (value: unknown, expected: number): string[] => {
    if (!Array.isArray(value) || value.length !== expected) throw new Error('Report translation omitted mitigation actions.');
    return value.map(text);
  };
  const threats = items(result.threats);
  const gaps = items(result.complianceGaps);
  const strings = object(result.uiStrings);
  return {
    ...model, name: text(result.name),
    assessmentMeta: { ...model.assessmentMeta, descriptionSummary: text(result.overview) },
    uiStrings: Object.fromEntries(Object.keys(REPORT_STRINGS).map(key => [key, text(strings[key])])),
    threats: (model.threats || []).map(threat => {
      const translated = threats.find(item => item.id === threat.id);
      if (!translated) throw new Error(`Report translation omitted finding ${threat.id}.`);
      return {
        ...threat,
        ...Object.fromEntries(TRANSLATABLE_THREAT_FIELDS.filter(key => typeof threat[key] === 'string').map(key => [key, text(translated[key])])),
        ...(threat.mitigations ? { mitigations: actions(translated.mitigations, threat.mitigations.length) } : {}),
      };
    }),
    complianceGaps: (model.complianceGaps || []).map((gap, index) => {
      const translated = gaps.find(item => item.translationId === String(index) && item.controlId === gap.controlId);
      if (!translated) throw new Error(`Report translation omitted control ${gap.controlId}.`);
      return { ...gap, title: text(translated.title), description: text(translated.description) };
    }),
  };

}
