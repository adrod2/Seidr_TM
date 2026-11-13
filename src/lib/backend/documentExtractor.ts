/**
 * Extracts readable text from supporting documents in the browser so every attachment can be analysed.
 * PDF -> pdf.js, DOCX -> mammoth, XLS/XLSX/ODS -> SheetJS, text formats -> UTF-8.
 * Scanned PDFs and images are rendered to images and transcribed through the optional OCR callback.
 */

export type ExtractionMethod = 'text' | 'pdf' | 'pdf-ocr' | 'docx' | 'spreadsheet' | 'legacy-binary' | 'image-ocr' | 'unsupported';

export interface ExtractedDocument {
  name: string;
  size: number;
  method: ExtractionMethod;
  status: 'ok' | 'partial' | 'empty' | 'failed';
  text: string;
  pages?: number;
  note?: string;
}

export interface ExtractOptions {
  /** Transcribes an image (data URL) to text; used for scanned PDFs and image attachments. */
  ocr?: (dataUrl: string, label: string) => Promise<string>;
  maxChars?: number;
}

export const MAX_DOCUMENT_CHARS = 400_000;
const MAX_PDF_PAGES = 300;
const MAX_OCR_PAGES = 8;
const MIN_TEXT_CHARS_PER_PAGE = 40;

export const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'log',
  'tf', 'hcl', 'ini', 'conf', 'cfg', 'toml', 'sql', 'puml', 'mmd', 'drawio'];
export const SPREADSHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xls', 'ods'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
export const SUPPORTED_DOCUMENT_ACCEPT = ['.pdf', '.docx', '.doc', ...SPREADSHEET_EXTENSIONS.map((e) => `.${e}`),
  ...TEXT_EXTENSIONS.map((e) => `.${e}`), ...IMAGE_EXTENSIONS.map((e) => `.${e}`)].join(',');

export const extensionOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '');

/** Removes control characters (which fail the structural gate) and collapses excessive whitespace. */
export const normaliseExtractedText = (text: string) => text
  .replace(/\r\n?/g, '\n')
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
  .replace(/[ \t\u00A0]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/** Best-effort recovery of readable strings (ASCII and UTF-16LE) from legacy binary formats such as .doc. */
export const extractPrintableStrings = (bytes: Uint8Array, minRun = 5) => {
  const runs: string[] = [];
  let ascii = '';
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) ascii += String.fromCharCode(b);
    else { if (ascii.length >= minRun) runs.push(ascii); ascii = ''; }
  }
  if (ascii.length >= minRun) runs.push(ascii);
  let wide = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 0x20 && code < 0x530) || (code >= 0x2010 && code <= 0x206f)) wide += String.fromCharCode(code);
    else { if (wide.length >= minRun) runs.push(wide); wide = ''; }
  }
  if (wide.length >= minRun) runs.push(wide);
  // Keep runs that look like natural language rather than binary noise.
  return runs.filter((r) => /[a-z]{3,}/i.test(r) && (r.match(/[a-z ]/gi)?.length || 0) / r.length > 0.7).join('\n');
};

const finish = (doc: Omit<ExtractedDocument, 'text' | 'status'> & { text: string; status?: ExtractedDocument['status'] }, maxChars: number): ExtractedDocument => {
  let text = normaliseExtractedText(doc.text);
  let note = doc.note;
  let status = doc.status || (text ? 'ok' : 'empty');
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    status = 'partial';
    note = [note, `Truncated to ${maxChars.toLocaleString()} characters.`].filter(Boolean).join(' ');
  }
  return { ...doc, text, status, note };
};

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
const loadPdfJs = () => {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  return pdfjsPromise;
};

const extractPdf = async (file: File, options: ExtractOptions) => {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  try {
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pageTexts: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('');
      pageTexts.push(text.trim() ? `[Page ${i}]\n${text}` : '');
      page.cleanup();
    }
    const text = pageTexts.filter(Boolean).join('\n\n');
    const notes: string[] = [];
    if (pdf.numPages > MAX_PDF_PAGES) notes.push(`Only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were read.`);

    const textChars = text.replace(/\[Page \d+\]|\s/g, '').length;
    if (textChars < pageCount * MIN_TEXT_CHARS_PER_PAGE && options.ocr && typeof document !== 'undefined') {
      // Little or no text layer: treat as a scanned document and transcribe the pages visually.
      const ocrPages = Math.min(pageCount, MAX_OCR_PAGES);
      const transcripts: string[] = [];
      for (let i = 1; i <= ocrPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport } as any).promise;
        transcripts.push(`[Page ${i}]\n${await options.ocr(canvas.toDataURL('image/jpeg', 0.85), `${file.name} page ${i}`)}`);
        page.cleanup();
      }
      if (pageCount > ocrPages) notes.push(`Scanned PDF: transcribed the first ${ocrPages} of ${pageCount} pages.`);
      else notes.push('Scanned PDF transcribed with the vision model.');
      return { method: 'pdf-ocr' as const, pages: pdf.numPages, text: [text, ...transcripts].filter(Boolean).join('\n\n'),
        note: notes.join(' '), status: pageCount > ocrPages ? 'partial' as const : undefined };
    }
    if (!textChars) notes.push('The PDF has no text layer (scanned images).');
    return { method: 'pdf' as const, pages: pdf.numPages, text, note: notes.join(' ') || undefined,
      status: pdf.numPages > MAX_PDF_PAGES ? 'partial' as const : undefined };
  } finally {
    await loadingTask.destroy();
  }
};

const extractDocx = async (file: File) => {
  const mammoth: any = await import('mammoth');
  const result = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { method: 'docx' as const, text: result.value as string };
};

const extractSpreadsheet = async (file: File) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellFormula: false, cellHTML: false });
  const text = workbook.SheetNames.map((sheetName) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false });
    return csv.trim() ? `[Sheet: ${sheetName}]\n${csv}` : '';
  }).filter(Boolean).join('\n\n');
  return { method: 'spreadsheet' as const, pages: workbook.SheetNames.length, text };
};

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export async function extractDocument(file: File, options: ExtractOptions = {}): Promise<ExtractedDocument> {
  const maxChars = options.maxChars ?? MAX_DOCUMENT_CHARS;
  const ext = extensionOf(file.name);
  const base = { name: file.name, size: file.size };
  try {
    if (ext === 'pdf' || file.type === 'application/pdf') return finish({ ...base, ...(await extractPdf(file, options)) }, maxChars);
    if (ext === 'docx') return finish({ ...base, ...(await extractDocx(file)) }, maxChars);
    if (SPREADSHEET_EXTENSIONS.includes(ext)) return finish({ ...base, ...(await extractSpreadsheet(file)) }, maxChars);
    if (ext === 'doc') {
      const text = extractPrintableStrings(new Uint8Array(await file.arrayBuffer()));
      return finish({ ...base, method: 'legacy-binary', text, status: text ? 'partial' : 'empty',
        note: 'Legacy .doc: text recovered on a best-effort basis; save as .docx or PDF for full fidelity.' }, maxChars);
    }
    if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith('image/')) {
      if (!options.ocr) return finish({ ...base, method: 'unsupported', text: '', status: 'failed', note: 'Image OCR is unavailable.' }, maxChars);
      const text = await options.ocr(await readAsDataUrl(file), file.name);
      return finish({ ...base, method: 'image-ocr', text, note: 'Transcribed with the vision model.' }, maxChars);
    }
    if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/') || !ext) {
      return finish({ ...base, method: 'text', text: await file.text() }, maxChars);
    }
    return finish({ ...base, method: 'unsupported', text: '', status: 'failed', note: `Unsupported file type .${ext}.` }, maxChars);
  } catch (error: any) {
    return { ...base, method: 'unsupported', status: 'failed', text: '', note: `Extraction failed: ${error?.message || error}` };
  }
}
