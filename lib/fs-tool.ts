import {
  MAX_SKILL_CONTENT_CHARS,
  deleteSkill,
  findSkillByFileName,
  listSkills,
  parseSkillFile,
  saveSkill,
  serializeSkillFile,
  skillFileName,
} from './skills.ts';
import { listSessionFiles, mimeTypeForFileName, normalizeFileName, readSessionFile, textMimeTypes, writeSessionFile } from './workspace-files.ts';

export const FS_READ_LIMIT_CHARS = 40_000;
export const MAX_FS_WRITE_CHARS = 200_000;

export type FsAction = 'ls' | 'read' | 'write';

export type FsInput = { action: FsAction; path?: string; content?: string };

export type FsEntry = { path: string; size?: number; mimeType?: string; description?: string; enabled?: boolean };

export type FsResult =
  | { action: 'ls'; workspace: FsEntry[]; skills: FsEntry[] }
  | { action: 'read'; path: string; content: string; contentChars: number; truncated: boolean }
  | { action: 'read'; path: string; binary: true; mimeType: string; size: number; hint: string }
  | { action: 'write'; path: string; size: number; mimeType: string };

export const fsInputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['ls', 'read', 'write'] },
    path: {
      type: 'string',
      description: 'File path. Required for read and write. Workspace files: "/workspace/<name>" (session output/uploads; write .md/.txt/.html/.csv/.json as text, .docx converts Markdown content to Word). Site skills: "/skills/<name>.md" (persistent site knowledge with frontmatter).',
    },
    content: {
      type: 'string',
      maxLength: MAX_FS_WRITE_CHARS,
      description: 'Required for write. Text or Markdown. For /skills files start with frontmatter: ---\\nname: <skill name>\\nhosts: <host1, host2>\\ndescription: <when to read this>\\n--- then the body: trigger conditions, verified flow, failure signals, recovery. For .docx the Markdown is converted to Word.',
    },
  },
} as const;

export function parseFsInput(value: unknown): FsInput {
  if (!isRecord(value)) throw new Error('fs input must be an object');
  const action = value.action;
  if (action !== 'ls' && action !== 'read' && action !== 'write') throw new Error('fs action must be one of: ls, read, write');
  if (action === 'ls') return { action };
  const path = typeof value.path === 'string' ? value.path.trim() : '';
  if (!path) throw new Error(`fs ${action} requires path`);
  if (action === 'read') return { action, path };
  const content = typeof value.content === 'string' ? value.content : '';
  if (!content) throw new Error('fs write requires content');
  if (content.length > MAX_FS_WRITE_CHARS) throw new Error(`fs write content must be at most ${MAX_FS_WRITE_CHARS} characters`);
  return { action, path, content };
}

export function createFsController(options: { sessionId: number }) {
  async function run(input: FsInput): Promise<FsResult> {
    if (input.action === 'ls') return list();
    const target = parsePath(input.path!);
    if (input.action === 'read') {
      return target.space === 'skills' ? readSkill(target.name) : readWorkspace(target.name);
    }
    return target.space === 'skills' ? writeSkill(target.name, input.content!) : writeWorkspace(target.name, input.content!);
  }

  async function list(): Promise<FsResult> {
    const [files, skills] = await Promise.all([listSessionFiles(options.sessionId), listSkills()]);
    return {
      action: 'ls',
      workspace: files.map((file) => ({ path: `/workspace/${file.name}`, size: file.size, mimeType: file.mimeType })),
      skills: skills.map((skill) => ({ path: `/skills/${skillFileName(skill)}`, description: skill.description, ...(skill.enabled ? {} : { enabled: false }) })),
    };
  }

  async function readSkill(fileName: string): Promise<FsResult> {
    const skill = await findSkillByFileName(fileName);
    if (!skill) throw new Error(`Skill file not found: /skills/${fileName}. Use fs ls to see available files.`);
    const content = serializeSkillFile(skill);
    return { action: 'read', path: `/skills/${fileName}`, content, contentChars: content.length, truncated: false };
  }

  async function readWorkspace(name: string): Promise<FsResult> {
    const file = await readSessionFile(options.sessionId, name);
    if (!file) throw new Error(`File not found: /workspace/${name}. Use fs ls to see available files.`);
    if (!textMimeTypes.has(file.mimeType)) {
      return {
        action: 'read',
        path: `/workspace/${name}`,
        binary: true,
        mimeType: file.mimeType,
        size: file.size,
        hint: `Binary file. Read its text content with getDocument { source: "file", name: "${name}" }.`,
      };
    }
    const text = new TextDecoder().decode(file.data);
    const truncated = text.length > FS_READ_LIMIT_CHARS;
    return { action: 'read', path: `/workspace/${name}`, content: truncated ? text.slice(0, FS_READ_LIMIT_CHARS) : text, contentChars: text.length, truncated };
  }

  async function writeSkill(fileName: string, content: string): Promise<FsResult> {
    if (!fileName.endsWith('.md')) throw new Error('Skill files must end with .md');
    if (content.length > MAX_SKILL_CONTENT_CHARS + 1_000) throw new Error(`Skill file must stay under ${MAX_SKILL_CONTENT_CHARS} characters of body`);
    const parsed = parseSkillFile(content);
    const existing = await findSkillByFileName(fileName);
    // Save first (may reject on slug conflict), only then remove the renamed-away file.
    const skill = await saveSkill({ ...parsed, source: 'agent' });
    if (existing && existing.id !== skill.id) await deleteSkill(existing.id);
    const size = serializeSkillFile(skill).length;
    return { action: 'write', path: `/skills/${skillFileName(skill)}`, size, mimeType: 'text/markdown' };
  }

  async function writeWorkspace(name: string, content: string): Promise<FsResult> {
    const fileName = normalizeFileName(name);
    const mimeType = mimeTypeForFileName(fileName);
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { markdownToDocx } = await import('./document-export.ts');
      const data = await markdownToDocx(content);
      const file = await writeSessionFile({ sessionId: options.sessionId, name: fileName, data, mimeType });
      return { action: 'write', path: `/workspace/${fileName}`, size: file.size, mimeType };
    }
    if (!textMimeTypes.has(mimeType)) {
      throw new Error(`fs write supports text files (.md/.txt/.html/.csv/.json) and .docx. For PDF output, write .md or .html; the user exports it as PDF from the sidebar.`);
    }
    const data = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const file = await writeSessionFile({ sessionId: options.sessionId, name: fileName, data, mimeType });
    return { action: 'write', path: `/workspace/${fileName}`, size: file.size, mimeType };
  }

  return { run };
}

function parsePath(path: string): { space: 'workspace' | 'skills'; name: string } {
  const match = /^\/(workspace|skills)\/([^/]+)$/.exec(path);
  if (!match) throw new Error(`Invalid fs path: ${path}. Use /workspace/<name> or /skills/<name>.md`);
  return { space: match[1] as 'workspace' | 'skills', name: match[2] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
