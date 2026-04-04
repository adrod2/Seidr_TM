/**
 * Gate 1: Structural & Size Validation
 */
export const validateStructure = (input: string): boolean => {
  // Max 100KB per field (approx 100,000 chars)
  if (input.length > 100000) return false;
  // Check for null bytes or control characters (excluding standard whitespace)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(input)) return false;
  return true;
};

/**
 * Gate 2: PII Detection & Redaction
 */
export const redactPII = (input: string): { redacted: string; count: number } => {
  let count = 0;
  let redacted = input;

  // Simple Email Redaction
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  redacted = redacted.replace(emailRegex, () => {
    count++;
    return `[EMAIL-${count}]`;
  });

  // Public IP Redaction (ignores RFC-1918 private IPs per architecture doc)
  const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
  redacted = redacted.replace(ipRegex, (match) => {
    // Check if private IP (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
    const parts = match.split('.').map(Number);
    if (
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    ) {
      return match; // Legit architecture IP, don't redact
    }
    count++;
    return `[PUBLIC-IP-${count}]`;
  });

  // Note: Add AWS keys, SSN, Credit Cards here as needed
  return { redacted, count };
};

/**
 * Gate 3: Prompt Injection Scanning
 */
export const scanForPromptInjection = (input: string): { passed: boolean; reason?: string } => {
  // Pattern scan for known jailbreaks (ignore, disregard, system prompt extraction)
  const injectionPatterns = [
    /ignore (all )?previous instructions/i,
    /disregard (all )?previous instructions/i,
    /you are now (a )?DAN/i,
    /extract (the )?system prompt/i,
    /<\/seidr:data>/i, // Delimiter smuggling
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(input)) {
      return { passed: false, reason: 'Pattern match: Possible prompt injection/jailbreak detected' };
    }
  }

  // Phase 2: Send to sandboxed classifier LLM (mocked here)
  return { passed: true };
};

export const runSecurityPipeline = (rawInput: string) => {
  if (!validateStructure(rawInput)) {
    throw new Error('Gate 1 Failed: Invalid structure or size exceeded.');
  }

  const { passed, reason } = scanForPromptInjection(rawInput);
  if (!passed) {
    throw new Error(`Gate 3 Failed: ${reason}`);
  }

  const { redacted, count } = redactPII(rawInput);
  
  return {
    sanitisedInput: redacted,
    piiRedactedCount: count
  };
};