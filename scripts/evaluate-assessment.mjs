import { readFile } from 'node:fs/promises';
import { evaluateAssessment } from '../src/lib/backend/assessmentEvaluation.ts';
import { validateAssessmentBackup } from '../src/lib/backend/assessmentBackupFormat.ts';

const [backupPath, modelId, casePath, reviewPath] = process.argv.slice(2);
if (!backupPath || !modelId || !casePath) {
  console.error('Usage: node scripts\\evaluate-assessment.mjs <private-backup.json> <model-id> <case.json> [independent-review.json]');
  process.exitCode = 1;
} else {
  try {
    const read = async file => JSON.parse(await readFile(file, 'utf8'));
    const backup = await validateAssessmentBackup(await read(backupPath));
    const model = backup.models.find(model => model.id === modelId);
    if (!model?.quality) throw new Error('Select a versioned assessment in the supplied private backup.');
    const sources = backup.sources.filter(source => model.quality.sourceIds.includes(source.id));
    console.log(JSON.stringify(evaluateAssessment(model.quality, sources, await read(casePath), reviewPath ? await read(reviewPath) : undefined), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
