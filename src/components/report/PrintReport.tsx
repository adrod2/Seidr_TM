import React from 'react';
import { SeidrLogo } from '../SeidrLogo';
import { DREAD_DIMENSIONS, SEVERITIES, dreadMean, reportArchitecture, reportFindings, reportOverview,
  reportStrings, scoreLabel, severityKey, validScore, type ExportReport } from '@/lib/reportExport';
import './PrintReport.css';

const SectionHeading = ({ number, title }: { number: string; title: string }) => (
  <h2 className="report-section-heading"><span>{number}</span>{title}</h2>
);

const Field = ({ label, value, missing }: { label: string; value?: string; missing: string }) => (
  <div className="report-field"><h4>{label}</h4><p className="report-text">{value?.trim() ? value : missing}</p></div>
);

export const PrintReport = ({ modelData, diagramSvg = '' }: { modelData: ExportReport; diagramSvg?: string }) => {
  if (!modelData) return null;
  const t = reportStrings(modelData);
  const findings = reportFindings(modelData);
  const architecture = reportArchitecture(modelData.srg);
  const overview = reportOverview(modelData);
  const componentNames = new Map(architecture.elements.map(c => [c.id, c.name]));
  const counts = Object.fromEntries([...SEVERITIES, 'Unrated'].map(severity => [
    severity.toLowerCase(), findings.filter(({ threat }) => severityKey(threat.severity) === severity.toLowerCase()).length,
  ]));
  const meta = modelData.assessmentMeta;
  const repositories = meta?.repositoryUrls ?? (meta?.repositoryUrl ? [meta.repositoryUrl] : []);
  const date = new Date(modelData.date);

  return (
    <article className="seidr-report" aria-label={t.reportTitle}>
      <header className="report-header">
        <div className="report-brand"><SeidrLogo className="report-logo" /><span>SEIDR</span><small>{t.reportSubtitle}</small></div>
        <h1>{t.reportTitle}</h1>
        <p className="report-system-name">{modelData.name}</p>
        <dl className="report-metadata">
          <div><dt>{t.modelId}</dt><dd>{modelData.id}</dd></div>
          <div><dt>{t.dateGenerated}</dt><dd>{Number.isNaN(date.getTime()) ? t.notRecorded : date.toLocaleDateString()}</dd></div>
          <div><dt>{t.framework}</dt><dd>{modelData.framework || t.notRecorded}</dd></div>
          <div><dt>{t.riskScore}</dt><dd>{Number.isFinite(modelData.riskScore) ? `${modelData.riskScore} / 100` : t.notRecorded}</dd></div>
        </dl>
      </header>

      <section>
        <SectionHeading number="01" title={t.findingsSummary} />
        <div className="report-metrics">
          <div><strong>{findings.length}</strong><span>{t.totalFindings}</span></div>
          {SEVERITIES.map(severity => <div key={severity} data-severity={severityKey(severity)}>
            <strong>{counts[severity.toLowerCase()]}</strong><span>{t[severityKey(severity)]}</span>
          </div>)}
        </div>
        {counts.unrated > 0 && <p>{t.unrated}: <strong>{counts.unrated}</strong></p>}
        <p className="report-component-count">{t.affectedComponents}: <strong>{new Set(findings.filter(f => f.threat.componentId?.trim()).map(f => f.component)).size}</strong></p>
        <h3>{t.systemOverview}</h3>
        <p className="report-text">{overview || t.noDescription}</p>
        <p className="report-callout">{t.riskNote}</p>
      </section>

      <section className="report-priority-section">
        <SectionHeading number="02" title={t.priorityFindings} />
        <p className="report-caption">{t.priorityNote}</p>
        {!findings.length ? <p>{t.noThreats}</p> : (
          <table className="report-priority-table">
            <thead><tr><th>{t.priority}</th><th>{t.title}</th><th>{t.severity}</th><th>{t.cvss}</th><th>{t.component}</th></tr></thead>
            <tbody>{findings.map(({ threat, priority, anchor, component }) => (
              <tr key={anchor}>
                <td><a href={`#${anchor}`} className="report-priority">{String(priority).padStart(2, '0')}</a></td>
                <td><a href={`#${anchor}`}><strong>{threat.title}</strong></a><small>{threat.id}<br />{threat.category || t.notRecorded}</small></td>
                <td><span className="report-severity" data-severity={severityKey(threat.severity)}>{t[severityKey(threat.severity)]}</span></td>
                <td className="report-score">{scoreLabel(threat.cvssScore, t.notRecorded)}</td>
                <td>{component}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="report-architecture">
        <SectionHeading number="03" title={t.architecture} />
        <p className="report-caption">{architecture.hasComponentDetail ? t.architectureNote : t.legacyArchitectureNote}</p>
        {diagramSvg ? (
          <figure>
            {/* Only strict-mode Mermaid output generated from escaped C4 labels is inserted. */}
            <div className="report-diagram" role="img" aria-label={t.architecture} dangerouslySetInnerHTML={{ __html: diagramSvg }} />
            <figcaption>{modelData.name} | {modelData.id} | {t.componentRegister} / {t.relationshipRegister}</figcaption>
          </figure>
        ) : <p className="report-callout">{architecture.elements.length ? t.diagramNotPrepared : t.noArchitecture}</p>}
      </section>

      {architecture.elements.length > 0 && <section className="report-architecture-register">
        <h2 className="report-section-heading">{t.architectureRegister}</h2>
        <h3>{t.componentRegister}</h3>
        <table>
          <thead><tr><th>{t.component}</th><th>{t.technology}</th><th>{t.description}</th></tr></thead>
          <tbody>{architecture.elements.map(c => <tr key={c.id}>
            <td><strong>{c.name}</strong><small>{c.id}</small></td>
            <td>{c.c4Type}{c.technology && <small>{c.technology}</small>}</td>
            <td className="report-text">{c.description || t.notRecorded}</td>
          </tr>)}</tbody>
        </table>
        {architecture.relations.length > 0 && <>
          <h3>{t.relationshipRegister}</h3>
          <table>
            <thead><tr><th>{t.component}</th><th>{t.relationship}</th></tr></thead>
            <tbody>{architecture.relations.map((r, index) => <tr key={`${r.id}-${index}`}>
              <td>{componentNames.get(r.sourceId)} [{r.sourceId}] &rarr; {componentNames.get(r.targetId)} [{r.targetId}]</td>
              <td>{r.label || t.notRecorded}{r.protocol && <small>{r.protocol}</small>}</td>
            </tr>)}</tbody>
          </table>
        </>}
        {!!modelData.srg?.trustBoundaries?.length && <Field label={t.trustBoundaries} value={modelData.srg.trustBoundaries.join('\n')} missing={t.notRecorded} />}
      </section>}

      <section className="report-findings">
        <SectionHeading number="04" title={t.identifiedThreats} />
        {!findings.length && <p>{t.noThreats}</p>}
        {findings.map(({ threat, priority, anchor, component, mitigations }) => (
          <article className="report-finding" id={anchor} key={anchor}>
            <header className="report-finding-header" data-severity={severityKey(threat.severity)}>
              <p>{t.priority} {String(priority).padStart(2, '0')} <span className="report-finding-id">{threat.id}</span></p>
              <h3>{threat.title}</h3>
              <span className="report-severity" data-severity={severityKey(threat.severity)}>{t[severityKey(threat.severity)]}</span>
              <span className="report-cvss">{t.cvss}: <strong>{scoreLabel(threat.cvssScore, t.notRecorded)}</strong> / 10</span>
            </header>
            <dl className="report-finding-metadata">
              <div><dt>{t.framework}</dt><dd>{modelData.framework || t.notRecorded}</dd></div>
              <div><dt>{t.category}</dt><dd>{threat.category || t.notRecorded}</dd></div>
              <div><dt>{t.component}</dt><dd>{component}</dd></div>
              <div><dt>{t.treatmentStatus}</dt><dd>{threat.status || t.notRecorded}</dd></div>
            </dl>
            <Field label={t.description} value={threat.description} missing={t.notRecorded} />
            <Field label={t.evidence} value={threat.evidence} missing={t.notRecorded} />
            <Field label={t.exploitationPath} value={threat.reasoning} missing={t.notRecorded} />
            <div className="report-risk"><Field label={t.exploitationRisk} value={threat.exploitationRisk} missing={t.missingRisk} /></div>
            {(threat.dread || /\bDREAD\b/i.test(threat.reasoning || '')) && <div className="report-field">
              <h4>{t.dread}</h4>
              <p className="report-caption">{t.dreadNote}</p>
              {threat.dread && <dl className="report-dread">
                {DREAD_DIMENSIONS.map(key => <div key={key}><dt>{t[key]}</dt><dd>{validScore(threat.dread[key], 1) ? threat.dread[key] : t.notRecorded}</dd></div>)}
                <div><dt>{t.dreadMean}</dt><dd>{scoreLabel(dreadMean(threat), t.notRecorded)} / 10</dd></div>
              </dl>}
            </div>}
            <div className="report-mitigation">
              <h4>{t.suggestedMitigation}</h4>
              {mitigations.length ? <ol>{mitigations.map((action, index) => <li className="report-text" key={index}>{action}</li>)}</ol> : <p>{t.noMitigation}</p>}
            </div>
            {threat.justification && <Field label={t.justification} value={threat.justification} missing={t.notRecorded} />}
          </article>
        ))}
      </section>

      <section className="report-appendix">
        <SectionHeading number="05" title={t.complianceGaps} />
        {!modelData.complianceGaps?.length ? <p>{t.noGaps}</p> : (
          <table><thead><tr><th>{t.controlId}</th><th>{t.title}</th><th>{t.status}</th><th>{t.details}</th></tr></thead>
            <tbody>{modelData.complianceGaps.map((gap, index) => <tr key={`${gap.controlId}-${index}`}>
              <td>{gap.controlId}</td><td>{gap.title}</td><td>{gap.status}</td><td className="report-text">{gap.description}</td>
            </tr>)}</tbody>
          </table>
        )}
      </section>

      <section>
        <SectionHeading number="06" title={t.scope} />
        <p className="report-caption">{t.scopeNote}</p>
        {repositories.length > 0 && <p className="report-text">{repositories.join('\n')}</p>}
        {meta?.sourceUrl && <p className="report-text">{meta.sourceUrl}</p>}
        {!!meta?.localDocuments?.length && <p className="report-text">{meta.localDocuments.join('\n')}</p>}
        {!!meta?.globalDocuments?.length && <p className="report-text">{meta.globalDocuments.join('\n')}</p>}
        {meta?.inputs?.length ? <table>
          <thead><tr><th>{t.source}</th><th>{t.inputKind}</th><th>{t.status}</th><th>{t.retained}</th></tr></thead>
          <tbody>{meta.inputs.map((input, index) => <tr key={index}>
            <td>{input.name}{input.note && <small className="report-text">{input.note}</small>}</td>
            <td>{input.kind}{input.method && <small>{input.method}</small>}</td>
            <td>{input.status}</td><td>{input.chars} / {input.sourceChars ?? t.notRecorded}</td>
          </tr>)}</tbody>
        </table> : <p>{t.noInputs}</p>}
      </section>
      <footer className="report-footer">{t.generatedBy} | {modelData.id}</footer>
    </article>
  );
};
