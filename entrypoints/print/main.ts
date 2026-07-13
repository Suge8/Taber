// Print/export view for /workspace files: renders a Markdown/HTML file from
// the local database and opens the browser print dialog (user saves as PDF).
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { database, initializeDatabase } from '../../lib/db.ts';

async function render() {
  const content = document.getElementById('content')!;
  const fileId = Number(new URLSearchParams(location.search).get('file'));
  if (!Number.isInteger(fileId) || fileId <= 0) {
    content.textContent = 'Missing file id.';
    return;
  }
  await initializeDatabase();
  const file = await database.files.get(fileId);
  if (!file) {
    content.textContent = 'File not found. It may belong to a deleted session.';
    return;
  }
  document.title = file.name;
  const text = new TextDecoder().decode(file.data);
  const html = file.mimeType === 'text/html' ? text : await marked.parse(text);
  content.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'img', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'object', 'embed', 'link', 'meta'],
    FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'background', 'ping', 'formaction'],
  });
  for (const link of content.querySelectorAll('a[href]')) link.setAttribute('rel', 'noreferrer noopener');
  requestAnimationFrame(() => window.print());
}

void render();
