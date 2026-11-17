import type { SystemRepresentationGraph, Threat } from './backend/types';

export const THREAT_COLORS: Record<string, string> = {
  Critical: '#dc2626', High: '#ea580c', Medium: '#b45309', Low: '#2563eb', Unrated: '#64748b',
};

export interface MappedThreat {
  threat: Threat;
  componentIds: string[];
  flowIds: string[];
  unresolved: string[];
}

const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];

export function mapThreats(srg: SystemRepresentationGraph, threats: readonly Threat[]): MappedThreat[] {
  const components = srg.components || [];
  const edges = srg.edges || [];
  return threats.map(threat => {
    const componentIds: string[] = [];
    const flowIds: string[] = [];
    const unresolved: string[] = [];
    const explicit = Array.isArray(threat.affectedComponentIds);
    const legacy = threat.componentId?.trim() || '';
    const exactLegacy = components.some(component => component.id === legacy
      || component.name.toLowerCase() === legacy.toLowerCase()) || edges.some(edge => edge.id === legacy);
    const references = explicit ? threat.affectedComponentIds!
      : exactLegacy ? [legacy] : legacy.split(/[,;]/);

    for (const reference of unique(references)) {
      const byId = components.find(component => component.id === reference);
      const byName = components.filter(component => component.name.toLowerCase() === reference.toLowerCase());
      const component = byId || (byName.length === 1 ? byName[0] : undefined);
      if (component) componentIds.push(component.id);
      else if (!explicit && edges.some(edge => edge.id === reference)) flowIds.push(reference);
      else unresolved.push(`Component: ${reference}${byName.length > 1 ? ' (ambiguous name)' : ''}`);
    }
    for (const reference of unique(threat.affectedFlowIds || [])) {
      if (edges.some(edge => edge.id === reference
        && components.some(component => component.id === edge.sourceId)
        && components.some(component => component.id === edge.targetId))) flowIds.push(reference);
      else unresolved.push(`Flow: ${reference}`);
    }
    if (!componentIds.length && !flowIds.length && !unresolved.length) unresolved.push('No affected component or flow recorded');
    return { threat, componentIds: unique(componentIds), flowIds: unique(flowIds), unresolved };
  });
}

export function visibleThreatTargets(mapping: MappedThreat, srg: SystemRepresentationGraph, visibleIds: Set<string>) {
  return {
    componentIds: mapping.componentIds.filter(id => visibleIds.has(id)),
    flowIds: mapping.flowIds.filter(id => srg.edges.some(edge => edge.id === id
      && visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId))),
  };
}

export function threatColor(threats: readonly Threat[]): string {
  for (const severity of ['Critical', 'High', 'Medium', 'Low']) {
    if (threats.some(threat => threat.severity === severity)) return THREAT_COLORS[severity];
  }
  return THREAT_COLORS.Unrated;
}
