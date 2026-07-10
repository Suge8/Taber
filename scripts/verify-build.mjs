import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

let extensionDirs = process.argv.slice(2);
const expectDebugger = extensionDirs.includes('--debugger') || process.env.TABER_EXPECT_DEBUGGER === '1';
extensionDirs = extensionDirs.filter((value) => value !== '--debugger');
if (extensionDirs.length === 0) extensionDirs.push('.output/chrome-mv3', '.output/edge-mv3');

const MAX_INITIAL_ENTRY_BYTES = 500_000;

const requiredPermissions = [
  'storage',
  'sidePanel',
  'scripting',
  'userScripts',
  'webNavigation',
  'activeTab',
  'offscreen',
  'identity',
];

for (const extensionDir of extensionDirs) {
  await verifyExtension(extensionDir);
}

async function verifyExtension(extensionDir) {
  const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
  const permissions = manifest.permissions ?? [];
  const hostPermissions = manifest.host_permissions ?? [];
  const optionalHostPermissions = manifest.optional_host_permissions ?? [];

  assert(manifest.manifest_version === 3, `${extensionDir}: manifest_version must be 3`);
  assert(manifest.minimum_chrome_version === '135', `${extensionDir}: minimum_chrome_version must be 135`);
  assert(manifest.background?.service_worker === 'background.js', `${extensionDir}: missing background service worker`);
  assert(manifest.side_panel?.default_path === 'sidepanel.html', `${extensionDir}: missing sidepanel entry`);
  assert(manifest.sandbox?.pages?.includes('sandbox.html'), `${extensionDir}: missing sandbox entry`);
  assert(!hostPermissions.includes('<all_urls>'), `${extensionDir}: production host_permissions must not include <all_urls>`);
  assert(hostPermissions.includes('https://auth.openai.com/*'), `${extensionDir}: missing auth.openai.com host permission`);
  assert(hostPermissions.includes('https://chatgpt.com/*'), `${extensionDir}: missing chatgpt.com host permission`);
  assert(hostPermissions.includes('https://auth.x.ai/*'), `${extensionDir}: missing auth.x.ai host permission`);
  assert(hostPermissions.includes('https://api.x.ai/*'), `${extensionDir}: missing api.x.ai host permission`);
  assert(optionalHostPermissions.includes('http://*/*'), `${extensionDir}: missing optional http host permission`);
  assert(optionalHostPermissions.includes('https://*/*'), `${extensionDir}: missing optional https host permission`);

  for (const permission of requiredPermissions) {
    assert(permissions.includes(permission), `${extensionDir}: missing ${permission} permission`);
  }
  assert(expectDebugger === permissions.includes('debugger'), `${extensionDir}: debugger permission mismatch`);

  for (const file of ['background.js', 'sidepanel.html', 'offscreen.html', 'sandbox.html']) {
    await access(path.join(extensionDir, file));
  }

  const agentHostEntryBytes = await entryScriptBytes(extensionDir, 'offscreen.html');
  const sidepanelEntryBytes = await entryScriptBytes(extensionDir, 'sidepanel.html');
  assert(agentHostEntryBytes <= MAX_INITIAL_ENTRY_BYTES, `${extensionDir}: AgentHost entry is ${agentHostEntryBytes} bytes; budget is ${MAX_INITIAL_ENTRY_BYTES}`);
  assert(sidepanelEntryBytes <= MAX_INITIAL_ENTRY_BYTES, `${extensionDir}: sidepanel entry is ${sidepanelEntryBytes} bytes; budget is ${MAX_INITIAL_ENTRY_BYTES}`);
  console.info(JSON.stringify({ extensionDir, hasDebugger: permissions.includes('debugger'), hasCookies: permissions.includes('cookies'), agentHostEntryBytes, sidepanelEntryBytes }));
}

async function entryScriptBytes(extensionDir, htmlFile) {
  const html = await readFile(path.join(extensionDir, htmlFile), 'utf8');
  const source = /<script\b[^>]*\bsrc="([^"]+\.js)"/.exec(html)?.[1];
  assert(source, `${extensionDir}: ${htmlFile} entry script is missing`);
  return (await stat(path.join(extensionDir, source.replace(/^\//, '')))).size;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
