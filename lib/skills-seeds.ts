// Builtin site skills: verified fetch-first shortcuts for major sites.
// Seeded once per version; agents and users can extend them like any skill.
import { database } from './db.ts';
import { listSkills, saveSkill } from './skills.ts';

export const BUILTIN_SKILLS_VERSION = 2;
export const builtinSkillsVersionKey = 'builtinSkillsVersion';

type SeedSkill = { name: string; hosts: string[]; description: string; content: string };

export const builtinSkillSeeds: SeedSkill[] = [
  {
    name: 'Hacker News data API',
    hosts: ['news.ycombinator.com'],
    description: 'Read HN stories and comments via the official JSON API instead of scraping pages',
    content: [
      'Fetch-first: use getDocument source:"url" or sandbox fetch on the official Firebase API. No auth needed.',
      '',
      '- Top story ids: https://hacker-news.firebaseio.com/v0/topstories.json (also newstories, beststories, askstories, showstories)',
      '- Item (story/comment): https://hacker-news.firebaseio.com/v0/item/<id>.json — fields: title, url, score, by, time, kids (comment ids)',
      '- User: https://hacker-news.firebaseio.com/v0/user/<username>.json',
      '',
      'Flow: fetch topstories ids → fetch first N items in parallel via sandbox. Only open news.ycombinator.com pages when the user wants the live page.',
    ].join('\n'),
  },
  {
    name: 'Reddit JSON endpoints',
    hosts: ['reddit.com'],
    description: 'Read subreddits, posts, and comments by appending .json to any Reddit URL',
    content: [
      'Fetch-first: append .json to almost any reddit.com URL and read it with getDocument source:"url" or sandbox fetch.',
      '',
      '- Subreddit listing: https://www.reddit.com/r/<sub>/hot.json?limit=25 (also new, top?t=week)',
      '- Post with comments: https://www.reddit.com/r/<sub>/comments/<id>.json',
      '- Search: https://www.reddit.com/search.json?q=<query>&sort=relevance',
      '',
      'Data shape: data.children[].data holds title, score, permalink, selftext, num_comments.',
      'Pitfall: heavy use can hit 429 rate limits; slow down or open the page in the browser instead.',
    ].join('\n'),
  },
  {
    name: 'GitHub REST API',
    hosts: ['github.com'],
    description: 'Read repos, issues, PRs, files, and releases via api.github.com instead of scraping',
    content: [
      'Fetch-first: public data is available unauthenticated at api.github.com (60 req/h per IP).',
      '',
      '- Repo: https://api.github.com/repos/<owner>/<repo> — stars, forks, topics, default_branch',
      '- Issues/PRs: https://api.github.com/repos/<owner>/<repo>/issues?state=open (PRs have a pull_request key)',
      '- File content: https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>',
      '- Releases: https://api.github.com/repos/<owner>/<repo>/releases/latest',
      '- Search: https://api.github.com/search/repositories?q=<query>&sort=stars',
      '',
      'Pitfall: 403 with "rate limit exceeded" means the IP quota ran out; fall back to reading github.com pages in the browser.',
    ].join('\n'),
  },
  {
    name: 'Wikipedia REST API',
    hosts: ['wikipedia.org'],
    description: 'Read article summaries and full text via the Wikimedia REST API',
    content: [
      'Fetch-first, works for any language edition (replace en with the language code).',
      '',
      '- Summary: https://en.wikipedia.org/api/rest_v1/page/summary/<Title> — extract, description, thumbnail',
      '- Full HTML: https://en.wikipedia.org/api/rest_v1/page/html/<Title> (parse with getDocument source:"url")',
      '- Search: https://en.wikipedia.org/w/rest.php/v1/search/page?q=<query>&limit=5',
      '',
      'Titles use underscores for spaces and are case-sensitive after the first letter.',
    ].join('\n'),
  },
  {
    name: 'Stack Exchange API',
    hosts: ['stackoverflow.com', 'stackexchange.com'],
    description: 'Search questions and answers via the Stack Exchange JSON API instead of scraping',
    content: [
      'Fetch-first, no key needed for light use (shared IP quota ~300/day; responses are gzip JSON).',
      '',
      '- Search: https://api.stackexchange.com/2.3/search/advanced?q=<query>&site=stackoverflow&sort=relevance&filter=withbody',
      '- Question with answers: https://api.stackexchange.com/2.3/questions/<id>?site=stackoverflow&filter=withbody then /questions/<id>/answers?filter=withbody',
      '',
      'Data shape: items[] with title, link, score, is_answered, body (HTML). Pitfall: quota exhaustion returns error_id 502; fall back to opening the page.',
    ].join('\n'),
  },
  {
    name: 'npm registry API',
    hosts: ['npmjs.com'],
    description: 'Read package metadata and search npm via registry.npmjs.org instead of scraping',
    content: [
      'Fetch-first, no auth.',
      '',
      '- Package (all versions): https://registry.npmjs.org/<name> — dist-tags.latest, versions, repository, maintainers',
      '- Latest only (small): https://registry.npmjs.org/<name>/latest',
      '- Search: https://registry.npmjs.org/-/v1/search?text=<query>&size=10 — objects[].package with name, description, links',
      '- Weekly downloads: https://api.npmjs.org/downloads/point/last-week/<name>',
      '',
      'Scoped packages URL-encode the slash: @scope%2Fname.',
    ].join('\n'),
  },
  {
    name: 'PyPI JSON API',
    hosts: ['pypi.org'],
    description: 'Read Python package metadata via the PyPI JSON API instead of scraping',
    content: [
      'Fetch-first, no auth.',
      '',
      '- Package: https://pypi.org/pypi/<name>/json — info.version, info.summary, info.project_urls, releases',
      '- Specific version: https://pypi.org/pypi/<name>/<version>/json',
      '',
      'There is no official search endpoint; for search, fetch https://pypi.org/search/?q=<query> as a page or use getDocument source:"url".',
    ].join('\n'),
  },
  {
    name: 'arXiv export API',
    hosts: ['arxiv.org'],
    description: 'Search papers and read abstracts via the arXiv Atom API instead of scraping',
    content: [
      'Fetch-first, no auth. Responses are Atom XML; parse titles/summaries from <entry> blocks.',
      '',
      '- Search: http://export.arxiv.org/api/query?search_query=all:<query>&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending',
      '- By id: http://export.arxiv.org/api/query?id_list=2401.00001',
      '- PDF: https://arxiv.org/pdf/<id> (read directly with getDocument source:"url")',
      '',
      'Pitfall: fielded queries use prefixes like ti: (title), au: (author), cat: (category), combined with +AND+.',
    ].join('\n'),
  },
];

export async function seedBuiltinSkills() {
  const setting = await database.settings.get(builtinSkillsVersionKey);
  if (setting?.value === BUILTIN_SKILLS_VERSION) return false;
  const existingByName = new Map((await listSkills()).map((skill) => [skill.name.toLowerCase(), skill]));
  for (const seed of builtinSkillSeeds) {
    // Never overwrite user- or agent-authored skills; only refresh builtin rows.
    const existing = existingByName.get(seed.name.toLowerCase());
    if (existing && existing.source !== 'builtin') continue;
    try {
      await saveSkill({ ...seed, source: 'builtin' });
    } catch (error) {
      console.warn(`Taber builtin skill "${seed.name}" skipped:`, error);
    }
  }
  await database.settings.put({ key: builtinSkillsVersionKey, value: BUILTIN_SKILLS_VERSION });
  return true;
}
