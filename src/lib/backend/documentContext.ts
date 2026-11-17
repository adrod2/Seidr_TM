import { INLINE_DOCUMENT_CHARS, sanitiseSection, type ContextInput, type InputStatus } from './analysisContext.ts';
import type { ExtractedDocument, ExtractionMethod } from './documentExtractor.ts';
import { getErrorMessage } from './inputUtils.ts';

export type DocumentDigest = (name: string, text: string) => Promise<string>;

interface PreparedText {
  text: string;
  status: InputStatus['status'];
  note?: string;
}

export const prepareSourceText = async (name: string, text: string, digest: DocumentDigest): Promise<PreparedText> => {
  const clean = sanitiseSection(text);
  if (!clean.passed) return { text: '', status: 'excluded', note: `Excluded by the prompt-injection gate: ${clean.reason}` };
  if (!clean.text) return { text: '', status: 'empty' };
  if (clean.text.length <= INLINE_DOCUMENT_CHARS) return { text: clean.text, status: 'included' };
  try {
    const condensed = sanitiseSection(await digest(name, clean.text));
    if (!condensed.passed || !condensed.text) throw new Error('Document digest was empty or unsafe.');
    return {
      text: condensed.text, status: 'digested',
      note: `Condensed by the document digest agent from ${clean.text.length.toLocaleString()} collected characters.`,
    };
  } catch (error) {
    console.warn(`Document digest failed for ${name}; retaining bounded source text.`, error);
    return {
      text: clean.text.slice(0, INLINE_DOCUMENT_CHARS), status: 'truncated',
      note: `Digest failed (${getErrorMessage(error)}); first ${INLINE_DOCUMENT_CHARS.toLocaleString()} characters retained.`,
    };
  }
};

const methodLabels: Record<ExtractionMethod, string> = {
  pdf: 'PDF', 'pdf-ocr': 'scanned PDF, OCR', docx: 'Word', spreadsheet: 'spreadsheet', 'legacy-binary': 'legacy .doc',
  'image-ocr': 'image, OCR', text: 'text', unsupported: 'unsupported',
};

export const prepareDocument = async (doc: ExtractedDocument, digest: DocumentDigest): Promise<ContextInput> => {
  const base = { kind: 'document' as const, name: doc.name, method: methodLabels[doc.method], sourceChars: doc.text.length };
  if (doc.status === 'failed' || !doc.text.trim()) {
    return { status: { ...base, status: doc.status === 'failed' ? 'failed' : 'empty', chars: 0, note: doc.note || 'No readable text found.' } };
  }
  const prepared = await prepareSourceText(doc.name, doc.text, digest);
  const detail = [
    methodLabels[doc.method],
    doc.pages ? `${doc.pages} ${doc.method === 'spreadsheet' ? 'sheet(s)' : 'page(s)'}` : '',
    prepared.status === 'digested' ? `security digest of ${doc.text.trim().length.toLocaleString()} characters` : '',
  ].filter(Boolean).join(', ');
  return {
    section: prepared.text ? { kind: 'document', name: `Document: ${doc.name}`, detail, text: prepared.text } : undefined,
    status: {
      ...base, chars: 0,
      status: prepared.status === 'included' && doc.status === 'partial' ? 'truncated' : prepared.status,
      note: [doc.note, prepared.note].filter(Boolean).join(' ') || undefined,
    },
  };
};
