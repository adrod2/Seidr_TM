import { mkdir, writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { assessmentExportSchema } from '../src/lib/backend/assessmentQuality.ts';

const directory = new URL('../public/schemas/', import.meta.url);
await mkdir(directory, { recursive: true });
const schema = zodToJsonSchema(assessmentExportSchema, { name: 'SeidrAssessment', target: 'jsonSchema7' });
await writeFile(new URL('assessment-v1.schema.json', directory), JSON.stringify(schema, null, 2) + '\n');
