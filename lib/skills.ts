import { database, type Skill, type SkillSource } from './db.ts';

export const MAX_SKILL_CONTENT_CHARS = 8_000;
export const MAX_SKILL_DESCRIPTION_CHARS = 300;
export const MAX_SKILL_NAME_CHARS = 60;
export const MAX_SKILL_HOSTS = 10;
export const MAX_SKILLS = 200;

export async function listSkills(): Promise<Skill[]> {
  const skills = await database.skills.toArray();
  return skills.sort((left, right) => right.updatedAt - left.updatedAt || right.id - left.id);
}

export async function matchSkillsForUrl(url: string | undefined): Promise<Skill[]> {
  const host = hostFromUrl(url);
  if (!host) return [];
  const skills = await listSkills();
  return skills.filter((skill) => skill.enabled && skill.hosts.some((skillHost) => hostMatches(host, skillHost)));
}

export async function saveSkill(record: { name: string; hosts: string[]; description: string; content: string; source: SkillSource }): Promise<Skill> {
  const name = requireText(record.name, 'name', MAX_SKILL_NAME_CHARS);
  const hosts = parseHosts(record.hosts);
  const description = requireText(record.description, 'description', MAX_SKILL_DESCRIPTION_CHARS);
  const content = requireText(record.content, 'content', MAX_SKILL_CONTENT_CHARS);
  const now = Date.now();
  return database.transaction('rw', database.skills, async () => {
    const skills = await database.skills.toArray();
    const target = name.toLowerCase();
    const existing = skills.find((skill) => skill.name.toLowerCase() === target);
    // /skills/<slug>.md paths must stay unique: reject names that collide on slug.
    const fileName = skillFileName({ name });
    const collision = skills.find((skill) => skill.id !== existing?.id && skillFileName(skill) === fileName);
    if (collision) throw new Error(`Skill name conflict: "${name}" and "${collision.name}" both map to /skills/${fileName}. Use a different name.`);
    if (existing) {
      const next: Skill = { ...existing, name, hosts, description, content, source: record.source, updatedAt: now };
      await database.skills.put(next);
      return next;
    }
    if (skills.length >= MAX_SKILLS) throw new Error(`Skill limit reached (${MAX_SKILLS}). Delete unused skills before saving new ones.`);
    const id = await database.skills.add({ name, hosts, description, content, source: record.source, enabled: true, createdAt: now, updatedAt: now } as Skill);
    return (await database.skills.get(Number(id)))!;
  });
}

export async function deleteSkill(id: number) {
  await database.skills.delete(id);
}

export async function setSkillEnabled(id: number, enabled: boolean) {
  const updated = await database.skills.update(id, { enabled, updatedAt: Date.now() });
  if (updated === 0) throw new Error(`Skill not found: ${id}`);
}

// Skills are exposed to the model as /skills/<slug>.md files with frontmatter.

export function skillFileName(skill: Pick<Skill, 'name'>): string {
  const slug = skill.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'skill';
  return `${slug}.md`;
}

export async function findSkillByFileName(fileName: string): Promise<Skill | undefined> {
  const skills = await listSkills();
  return skills.find((skill) => skillFileName(skill) === fileName);
}

export function serializeSkillFile(skill: Pick<Skill, 'name' | 'hosts' | 'description' | 'content'>): string {
  return [
    '---',
    `name: ${skill.name}`,
    `hosts: ${skill.hosts.join(', ')}`,
    `description: ${skill.description}`,
    '---',
    '',
    skill.content,
  ].join('\n');
}

export function parseSkillFile(markdown: string): { name: string; hosts: string[]; description: string; content: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown.trim());
  if (!match) throw new Error('Skill file must start with frontmatter: ---\\nname: ...\\nhosts: ...\\ndescription: ...\\n---');
  const fields = new Map<string, string>();
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  const name = requireText(fields.get('name'), 'name', MAX_SKILL_NAME_CHARS);
  const hosts = parseHosts((fields.get('hosts') ?? '').split(',').map((host) => host.trim()).filter(Boolean));
  const description = requireText(fields.get('description'), 'description', MAX_SKILL_DESCRIPTION_CHARS);
  const content = requireText(match[2], 'content', MAX_SKILL_CONTENT_CHARS);
  return { name, hosts, description, content };
}

export async function skillsDigestForUrl(url: string | undefined): Promise<string> {
  const matched = await matchSkillsForUrl(url);
  if (matched.length === 0) return '';
  const lines = matched.map((skill) => `- /skills/${skillFileName(skill)}: ${skill.description}`);
  return [
    '## Site skills',
    'Stored prior knowledge for the current site. Not ground truth: live page state always wins; re-save the skill file when guidance is outdated.',
    'Read the matching skill with fs read before exploring blindly:',
    ...lines,
  ].join('\n');
}

export async function availableSkillPathsForUrl(url: string | undefined): Promise<string[]> {
  const matched = await matchSkillsForUrl(url);
  return matched.map((skill) => `/skills/${skillFileName(skill)}`);
}

export function normalizeSkillHost(value: string): string {
  const text = value.trim().toLowerCase();
  const host = text.includes('://') ? hostFromUrl(text) : text.replace(/^www\./, '').replace(/[/?#].*$/, '');
  if (!host || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new Error(`Invalid skill host: ${value}. Use a bare host like "example.com".`);
  }
  return host;
}

export function hostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function hostMatches(pageHost: string, skillHost: string): boolean {
  return pageHost === skillHost || pageHost.endsWith(`.${skillHost}`);
}

function parseHosts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Skill hosts must be a non-empty list of hosts');
  if (value.length > MAX_SKILL_HOSTS) throw new Error(`Skill hosts must have at most ${MAX_SKILL_HOSTS} entries`);
  const hosts = value.map((host) => normalizeSkillHost(String(host)));
  return [...new Set(hosts)];
}

function requireText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Skill ${field} is required`);
  const text = value.trim();
  if (text.length > maxChars) throw new Error(`Skill ${field} must be at most ${maxChars} characters`);
  return text;
}
