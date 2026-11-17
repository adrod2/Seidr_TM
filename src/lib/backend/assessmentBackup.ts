import Dexie from 'dexie';
import { db } from '../db';
import { encodeModelInputs, decodeModelInputs, MAX_BACKUP_BYTES, validateAssessmentBackup } from './assessmentBackupFormat';

export async function createAssessmentBackup(): Promise<Blob> {
  const records = await db.transaction('r', [db.threatModels, db.modelInputs, db.evidenceSources, db.assessmentRevisions, db.businessRisks, db.documents], async () => ({
    models: await db.threatModels.toArray(), inputs: await db.modelInputs.toArray(), sources: await db.evidenceSources.toArray(),
    revisions: await db.assessmentRevisions.toArray(), businessRisks: await db.businessRisks.toArray(), documents: await db.documents.toArray(),
  }));
  const bytes = records.inputs.reduce((sum, input) => sum + [...(input.payload.inputFiles?.documents || []), ...(input.payload.inputFiles?.diagrams || [])]
    .reduce((size, file) => size + (file?.contents.size || 0), 0), 0);
  if (new Blob([JSON.stringify(records)]).size + Math.ceil(bytes * 4 / 3) > MAX_BACKUP_BYTES) throw new Error('The local backup exceeds 256 MiB. Export a smaller browser profile or archive original attachments separately; no records were omitted.');
  const backup = { ...records, schemaVersion: 'seidr-local-backup-v1', exportedAt: new Date().toISOString(),
    inputs: await Promise.all(records.inputs.map(encodeModelInputs)) };
  await validateAssessmentBackup(backup);
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) throw new Error('The encoded backup exceeds 256 MiB; no partial backup was issued.');
  return blob;
}

export async function restoreAssessmentBackup(file: File): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup files must not exceed 256 MiB.');
  const backup = await validateAssessmentBackup(JSON.parse(await file.text()));
  const inputs = backup.inputs.map(decodeModelInputs);
  const equivalent = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  await db.transaction('rw', [db.threatModels, db.modelInputs, db.evidenceSources, db.assessmentRevisions, db.businessRisks, db.documents], async () => {
    for (const model of backup.models) {
      const current = await db.threatModels.get(model.id);
      if (current && !equivalent(current, model)) throw new Error(`${model.id} already has different data. Restore into a separate browser profile; existing work was not overwritten.`);
      if (!current) await db.threatModels.add(model);
    }
    for (const source of backup.sources) {
      const current = await db.evidenceSources.get(source.id);
      if (current && !equivalent({ ...current, parentSourceIds: current.parentSourceIds || [] }, source)) throw new Error('A retained source conflicts with the backup.');
      if (!current) await db.evidenceSources.add(source);
    }
    for (const revision of backup.revisions) {
      const current = await db.assessmentRevisions.get(revision.id);
      if (current && !equivalent(current, revision)) throw new Error('A saved revision conflicts with the backup.');
      if (!current) await db.assessmentRevisions.add({ ...revision, id: revision.id, modelId: revision.modelId, revision: revision.revision, recordedAt: revision.recordedAt, model: revision.model });
    }
    for (const input of inputs) {
      const current = await db.modelInputs.get(input.modelId);
      if (current) {
        const encoded = await Dexie.waitFor(Promise.all([encodeModelInputs(current), encodeModelInputs(input)]));
        if (!equivalent(encoded[0], encoded[1])) throw new Error('Original input snapshots conflict with the backup; nothing was overwritten.');
        continue;
      }
      await db.modelInputs.add(input);
    }
    for (const document of backup.documents) {
      const current = await db.documents.get(document.id);
      if (current && !equivalent(current, document)) throw new Error('A policy document conflicts with the backup; nothing was overwritten.');
      if (!current) await db.documents.add(document);
    }
    for (const risk of backup.businessRisks) {
      const current = await db.businessRisks.get(risk.id);
      if (current && !equivalent(current, risk)) throw new Error('A business-risk record conflicts with the backup; nothing was overwritten.');
      if (!current) await db.businessRisks.add(risk);
    }
  });
}
