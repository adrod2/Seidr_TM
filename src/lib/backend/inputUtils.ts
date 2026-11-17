import { ZodError } from 'zod';

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ZodError) return error.issues.map(issue => `${issue.path.join('.') || 'Response'}: ${issue.message}`).join('; ');
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

export const readAsDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') resolve(reader.result);
    else reject(new Error('File reader did not return a data URL.'));
  };
  reader.onerror = () => reject(reader.error || new Error('Failed to read the file.'));
  reader.onabort = () => reject(new Error('File reading was cancelled.'));
  reader.readAsDataURL(file);
});

export const looksBinaryDocument = (text = ''): boolean =>
  /^\s*(%PDF-|PK)/.test(text) || /\b(endobj|endstream|FlateDecode)\b/.test(text.slice(0, 5000));

export const hashBytes = async (input: ArrayBuffer): Promise<string> => {
  const buffer = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
};
export const hashInput = (input: string): Promise<string> => hashBytes(new TextEncoder().encode(input).buffer);

export const hashImageInput = (dataUrl: string, label = ''): Promise<string> =>
  hashInput(JSON.stringify([dataUrl, label]));
