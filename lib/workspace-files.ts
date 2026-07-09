import { database, type WorkspaceFile } from './db.ts';

export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_SESSION_FILES = 50;
export const MAX_FILE_NAME_CHARS = 120;

const FILE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u;

export const textMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
]);

export function mimeTypeForFileName(name: string): string {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'md' || extension === 'markdown') return 'text/markdown';
  if (extension === 'txt') return 'text/plain';
  if (extension === 'html' || extension === 'htm') return 'text/html';
  if (extension === 'csv') return 'text/csv';
  if (extension === 'json') return 'application/json';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function normalizeFileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_FILE_NAME_CHARS) throw new Error(`File name must be 1-${MAX_FILE_NAME_CHARS} characters`);
  if (!FILE_NAME_PATTERN.test(name) || name.includes('/') || name.includes('..')) throw new Error(`Invalid file name: ${value}`);
  return name;
}

export async function listSessionFiles(sessionId: number): Promise<WorkspaceFile[]> {
  const files = await database.files.where('sessionId').equals(sessionId).toArray();
  return files.sort((left, right) => right.updatedAt - left.updatedAt || right.id - left.id);
}

export async function readSessionFile(sessionId: number, name: string): Promise<WorkspaceFile | undefined> {
  return database.files.where('[sessionId+name]').equals([sessionId, normalizeFileName(name)]).first();
}

export async function writeSessionFile(record: { sessionId: number; name: string; data: ArrayBuffer; mimeType?: string }): Promise<WorkspaceFile> {
  const name = normalizeFileName(record.name);
  if (record.data.byteLength > MAX_FILE_BYTES) throw new Error(`File exceeds ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB limit`);
  const mimeType = record.mimeType ?? mimeTypeForFileName(name);
  const now = Date.now();
  return database.transaction('rw', database.files, async () => {
    const existing = await database.files.where('[sessionId+name]').equals([record.sessionId, name]).first();
    if (existing) {
      const next: WorkspaceFile = { ...existing, data: record.data, mimeType, size: record.data.byteLength, updatedAt: now };
      await database.files.put(next);
      return next;
    }
    const count = await database.files.where('sessionId').equals(record.sessionId).count();
    if (count >= MAX_SESSION_FILES) throw new Error(`Session file limit reached (${MAX_SESSION_FILES}). Delete unused files first.`);
    const id = await database.files.add({ sessionId: record.sessionId, name, mimeType, data: record.data, size: record.data.byteLength, createdAt: now, updatedAt: now } as WorkspaceFile);
    return (await database.files.get(Number(id)))!;
  });
}

export async function deleteSessionFile(id: number) {
  await database.files.delete(id);
}
