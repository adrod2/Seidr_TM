export const buildThreatModelPrompt = (framework: string, hybridMethodText: string): string => {
  const hybridInstructions = framework === 'Hybrid TM' ? `
Apply the following Hybrid method, integrating STRIDE security analysis, LINDDUN privacy analysis and PASTA business-risk analysis.

--- HYBRID THREAT MODELING METHODOLOGY ---
${hybridMethodText}
------------------------------------------

Application rules (take precedence over stack-specific examples in the method):
- Apply the method to the ACTUAL system in the supplied context. React, Node.js, PostgreSQL, Stripe, Amazon SES and AWS in the protocol are examples, not required technologies. Never invent their presence, versions, configurations or vulnerabilities.
- Report missing information as an uncertainty, not an established vulnerability. Explain conditional attack paths and the evidence supporting each finding.
- Cover business objectives, actual data flows and trust boundaries, STRIDE security threats, applicable LINDDUN privacy threats, high-risk attack paths and business impact.
- Use categories prefixed by their taxonomy, e.g. "STRIDE: Spoofing" or "LINDDUN: Linkability". Do not force a privacy category when no relevant data handling is evidenced.
- Include the business impact and a mapped mitigation control in each threat's description. Include a concise attack path in reasoning, not private chain-of-thought.
- Include DREAD (risk scoring) in reasoning for each threat: Damage, Reproducibility, Exploitability, Affected Users and Discoverability, each 1-10, with their arithmetic mean. Keep cvssScore as a separate CVSS estimate on its existing 0-10 scale; do not substitute the DREAD mean for CVSS.
- Use the method's final checklist to check coverage before returning the JSON array. Do not append prose, checklist objects or fabricated threats to satisfy the checklist.
` : '';

  return `You are an expert threat modeler using the ${framework} framework.
${hybridInstructions}
Analyze the provided System Representation Graph (SRG) ALONG WITH the broader System Context.
The System Context is organised into labelled sections (=== SECTION === and --- source name --- headers): the user's system description, architecture diagram analyses, supporting documents (verbatim or as security digests), crawled reference website intelligence, repository analysis, and the organizational knowledge base.
You MUST review EVERY section and every source within it. Threats must reflect facts found in the supporting documents, diagrams and website as well as the description (e.g. stated processes, devices, third parties, data handling, remote access, gaps and open questions).
In the "evidence" field, name the source(s) the evidence comes from (e.g. "Document: Answers.pdf [Page 3]", "Diagram: network.png", "Website", "System description").
Identify potential threats in deep detail by correlating the architecture with the provided context.

Return ONLY a valid JSON array of objects with this EXACT structure:
[
  {
    "id": "T-001",
    "title": "string",
    "description": "string (a comprehensive summary of the threat)",
    "evidence": "string (point out the exact components, missing boundaries in the SRG, OR specific clues from the System Context that prove this threat exists)",
    "reasoning": "string (explain how an attacker would exploit this vulnerability)",
    "category": "string (the threat category according to the ${framework} framework)",
    "componentId": "string (name of the vulnerable component from the SRG id or name)",
    "cvssScore": 8.5,
    "severity": "Critical" | "High" | "Medium" | "Low"
  }
]`;
};
