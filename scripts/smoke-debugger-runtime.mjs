import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  connectCdp,
  connectTarget,
  evaluateStable,
  fetchJson,
  hasCdpEndpoint,
  waitForTarget,
} from './cdp-client.mjs';

const requiredExtensionFiles = ['manifest.json', 'background.js', 'sidepanel.html', 'offscreen.html', 'sandbox.html'];
const mode = readMode();
const sourceExtensionDir = path.resolve(process.env.TABER_EXTENSION_DIR ?? defaultSourceExtensionDir(mode));
const preparedExtension = await prepareExtensionDir(sourceExtensionDir, mode);
process.env.TABER_EXTENSION_DIR = preparedExtension.dir;
if (!process.env.TABER_CDP_ORIGIN && !process.env.TABER_EXTENSION_ID) {
  process.env.TABER_CDP_ORIGIN = mode === 'debug' ? 'http://127.0.0.1:9260' : 'http://127.0.0.1:9259';
}
const { prepareRuntimeBrowser } = await import('./runtime-browser.mjs');

try {
  await runWithRetry();
} finally {
  await preparedExtension.cleanup();
}

async function runWithRetry() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await runSmoke();
      return;
    } catch (error) {
      if (attempt === 2 || !isTransientCdpError(error)) throw error;
      console.warn(`debugger runtime smoke retrying after transient CDP error: ${stringifyError(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function runSmoke() {
  const fixtureUrl = `https://chatgpt.com/taber-debugger-smoke-${Date.now()}`;
  const fixtureHtml = '<!doctype html><title>Debugger Smoke</title><main><h1>Debugger Smoke</h1><button id="save">Save</button></main>';
  let runtime;
  let browserCdp;
  let pageCdp;
  let extensionCdp;
  let pageTarget;
  let extensionTarget;

  try {
    runtime = await prepareRuntimeBrowser({ required: true, allowLaunch: true });
    if (runtime.skipped) throw new Error(runtime.reason);

    const version = await fetchJson(`${runtime.cdpOrigin}/json/version`);
    browserCdp = await connectCdp(version.webSocketDebuggerUrl);
    pageTarget = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    pageCdp = await connectTarget(await waitForTarget(runtime.cdpOrigin, (target) => target.id === pageTarget.targetId && hasCdpEndpoint(target)));
    await pageCdp.send('Runtime.enable');
    await loadFixturePage(pageCdp, fixtureUrl, fixtureHtml);
    pageCdp.close();
    pageCdp = undefined;

    extensionTarget = await browserCdp.send('Target.createTarget', { url: `chrome-extension://${runtime.extensionId}/sidepanel.html` });
    extensionCdp = await connectTarget(await waitForTarget(runtime.cdpOrigin, (target) => target.id === extensionTarget.targetId && hasCdpEndpoint(target)));
    await extensionCdp.send('Runtime.enable');
    await waitForExtensionRuntime(extensionCdp, runtime.extensionId);
    await assertExpectedManifest(extensionCdp);

    const tabId = await findTabId(extensionCdp, fixtureUrl);
    const result = await runtimeMessage(extensionCdp, { type: 'taber.debugger.request', targetTabId: tabId, input: { action: 'accessibilitySnapshot', limit: 30 } });

    if (mode === 'debug') {
      assert.equal(result.action, 'accessibilitySnapshot');
      assert.equal(result.tabId, tabId);
      assert(Array.isArray(result.nodes), 'accessibilitySnapshot nodes missing');
      assert(result.nodes.some((node) => node.name === 'Debugger Smoke' || node.name === 'Save' || node.role === 'RootWebArea'), 'AX snapshot did not include fixture semantics');
      await runtimeMessage(extensionCdp, { type: 'taber.debugger.request', targetTabId: tabId, input: { action: 'detach' } });
      console.info(`debugger runtime smoke passed (debug): accessibilitySnapshot nodes=${result.nodes.length}`);
    } else {
      assert.match(String(result.error ?? ''), /debugger is only available in the Taber debug build/);
      console.info(`debugger runtime smoke passed (production): ${result.error}`);
    }
  } finally {
    pageCdp?.close();
    extensionCdp?.close();
    if (browserCdp && pageTarget) await browserCdp.send('Target.closeTarget', { targetId: pageTarget.targetId }).catch(() => undefined);
    if (browserCdp && extensionTarget) await browserCdp.send('Target.closeTarget', { targetId: extensionTarget.targetId }).catch(() => undefined);
    browserCdp?.close();
    if (runtime && !runtime.skipped) await runtime.close();
  }
}

async function prepareExtensionDir(sourceDir, expectedMode) {
  await ensureSourceExtensionDir(sourceDir, expectedMode);
  const manifest = await readManifest(sourceDir);
  await assertCompleteExtensionDir(sourceDir, expectedMode);
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  assert.equal(
    permissions.includes('debugger'),
    expectedMode === 'debug',
    `${expectedMode} smoke source has unexpected debugger permission: ${sourceDir}`,
  );

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `taber-debugger-smoke-${expectedMode}-`));
  const destination = path.join(tempRoot, 'extension');
  await cp(sourceDir, destination, { recursive: true, dereference: true });
  await readManifest(destination);
  return { dir: destination, cleanup: () => rm(tempRoot, { recursive: true, force: true }) };
}

async function ensureSourceExtensionDir(sourceDir, expectedMode) {
  if (await isExpectedExtensionDir(sourceDir, expectedMode)) return;
  if (path.resolve(sourceDir) !== defaultSourceExtensionDir(expectedMode)) return;
  await runBuild(expectedMode);
}

async function isExpectedExtensionDir(extensionDir, expectedMode) {
  try {
    const manifest = await readManifest(extensionDir);
    await assertCompleteExtensionDir(extensionDir, expectedMode);
    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    return permissions.includes('debugger') === (expectedMode === 'debug');
  } catch {
    return false;
  }
}

async function readManifest(extensionDir) {
  try {
    return JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read runtime smoke extension manifest at ${extensionDir}: ${stringifyError(error)}`);
  }
}

async function assertCompleteExtensionDir(extensionDir, expectedMode) {
  for (const file of requiredExtensionFiles) {
    try {
      await access(path.join(extensionDir, file));
    } catch {
      const command = expectedMode === 'debug' ? 'pnpm run build:chrome:debug' : 'pnpm run build:chrome';
      throw new Error(`Runtime smoke extension output is incomplete: missing ${file} in ${extensionDir}. Run ${command} and retry.`);
    }
  }
}

function defaultSourceExtensionDir(expectedMode) {
  return path.resolve(expectedMode === 'debug' ? '.output/chrome-mv3-dev' : '.output/chrome-mv3');
}

function readMode() {
  const value = readOption('--expect') ?? (process.argv.includes('--debug') ? 'debug' : process.argv.includes('--production') ? 'production' : '');
  if (value === 'debug' || value === 'production') return value;
  throw new Error('Usage: node scripts/smoke-debugger-runtime.mjs --expect=debug|production');
}

function readOption(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function assertExpectedManifest(cdp) {
  const permissions = await evaluateStable(cdp, 'chrome.runtime.getManifest().permissions ?? []');
  assert.equal(
    Array.isArray(permissions) && permissions.includes('debugger'),
    mode === 'debug',
    `${mode} smoke loaded an extension with unexpected debugger permission; close any browser at TABER_CDP_ORIGIN or rebuild the requested TABER_EXTENSION_DIR`,
  );
}

async function loadFixturePage(cdp, url, html) {
  await cdp.send('Page.enable');
  const paused = (params) => {
    if (params.resourceType === 'Document') {
      void cdp.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html' }],
        body: Buffer.from(html).toString('base64'),
      });
      return;
    }
    void cdp.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Aborted' }).catch(() => undefined);
  };
  const off = cdp.on('Fetch.requestPaused', paused);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  try {
    await cdp.send('Page.navigate', { url });
    await evaluateStable(cdp, `new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (document.title === 'Debugger Smoke') {
          clearInterval(timer);
          resolve(true);
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error('debugger smoke fixture did not load'));
        }
      }, 50);
    })`);
  } finally {
    off();
    await cdp.send('Fetch.disable').catch(() => undefined);
  }
}

async function waitForExtensionRuntime(cdp, extensionId) {
  await evaluateStable(cdp, `new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const timer = setInterval(() => {
      if (document.readyState !== 'loading' && chrome?.runtime?.id === ${JSON.stringify(extensionId)}) {
        clearInterval(timer);
        resolve(true);
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('extension page did not become ready'));
      }
    }, 50);
  })`);
}

async function findTabId(cdp, url) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const tabs = await runtimeMessage(cdp, { type: 'taber.chromeApi.request', action: 'tabs.query', args: [{}] }).catch(() => undefined);
    const tab = Array.isArray(tabs) ? tabs.find((nextTab) => nextTab.url === url) : undefined;
    if (tab?.id) return Number(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing debugger smoke tab: ${url}`);
}

async function runtimeMessage(cdp, message) {
  return evaluateStable(cdp, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
}

function runBuild(expectedMode) {
  const script = expectedMode === 'debug' ? 'build:chrome:debug' : 'build:chrome';
  const env = {
    ...process.env,
    TABER_ENABLE_DEBUGGER: expectedMode === 'debug' ? '1' : '',
    TABER_DEBUG_ARTIFACT: expectedMode === 'debug' ? '1' : '',
  };
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['run', script], { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm run ${script} exited with ${code ?? signal ?? 1}`));
    });
  });
}

function isTransientCdpError(error) {
  return /CDP websocket (?:error|closed)|Target closed|WebSocket/i.test(stringifyError(error));
}

function stringifyError(error) {
  return error instanceof Error ? error.message : String(error);
}
