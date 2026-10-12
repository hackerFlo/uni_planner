import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let EnrollmentForm;
let smokeBrowser;
let browserBundle;
test.before(async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('./AgentConnectionsSection.jsx', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'], logLevel: 'silent' });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url) });
  EnrollmentForm = module.exports.EnrollmentForm;
  if (!process.env.PLAYWRIGHT_MODULE) return;
  const playwright = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  smokeBrowser = await (playwright.chromium || playwright.default.chromium).launch({ headless: true });
  const browser = await build({ stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import Section from './src/components/settings/AgentConnectionsSection.jsx';
    (${syntheticConnectionBackend.toString()})();
    createRoot(document.getElementById('root')).render(<Section />);`,
  resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' });
  browserBundle = browser.outputFiles[0].text;
});
test.after(async () => { await smokeBrowser?.close(); });

test('an existing linked account renders its saved optional grants with fresh password and consent', () => {
  const status = { linked: true, requiresReenrollment: false, revokedAt: null,
    capabilities: ['planner_read', 'planner_write', 'notifications', 'export'] };
  const html = renderToStaticMarkup(createElement(EnrollmentForm, { status,
    reenrollment: true, busy: false, onEnroll: () => {} }));
  const checkboxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(match => match[0]);
  assert.deepEqual(checkboxes.map(input => input.includes('checked=""')), [true, true, true, false]);
  assert.match(html, /type="password"[^>]*value=""/);
  assert.match(html, /<button[^>]*disabled=""/);
});

test('saved account write permission remains checked while the server-wide write restriction is explained', () => {
  const status = { linked: true, requiresReenrollment: false, revokedAt: null, writesEnabled: false,
    capabilities: ['planner_read', 'planner_write', 'notifications'] };
  const render = writesEnabled => renderToStaticMarkup(createElement(EnrollmentForm, {
    status: { ...status, writesEnabled }, reenrollment: true, busy: false, onEnroll: () => {},
  }));
  const html = render(false);
  const checkboxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(match => match[0]);
  assert.deepEqual(checkboxes.map(input => input.includes('checked=""')), [true, true, false, false]);
  assert.match(html, /Permission to create, edit and delete planner items and preferences/);
  assert.match(html, /These choices save permissions for your account/);
  assert.match(html, /Planner changes and test emails are currently disabled for the whole server/);
  assert.match(html, /server operator must enable them/);
  assert.doesNotMatch(render(true), /server operator must enable them/);
});

function inputsIn(element) {
  if (!element || typeof element !== 'object') return [];
  if (element.type === 'input') return [element];
  const children = [element.props?.children].flat(Infinity);
  return children.flatMap(inputsIn);
}

test('the real form submit clears password and consent while preserving the exact selected permissions', () => {
  const status = { linked: true, requiresReenrollment: false, revokedAt: null,
    capabilities: ['planner_read', 'planner_write', 'notifications', 'export'] };
  let phase = 0;
  let submitted;
  function InteractionHarness() {
    const form = EnrollmentForm({ status, reenrollment: true, busy: false,
      onEnroll: (password, consent, capabilities) => { submitted = { password, consent, capabilities: [...capabilities] }; } });
    const [password, write, notifications, exportData, consent] = inputsIn(form);
    // Server rendering applies render-phase updates through React's real hooks;
    // exercise the form's event handlers without inventing a DOM implementation.
    if (phase === 0) {
      phase = 1;
      password.props.onChange({ target: { value: 'synthetic-password' } });
      exportData.props.onChange({ target: { checked: false } });
      consent.props.onChange({ target: { checked: true } });
    } else if (phase === 1) {
      phase = 2;
      form.props.onSubmit({ preventDefault() {} });
    } else {
      assert.equal(password.props.value, '');
      assert.equal(consent.props.checked, false);
      assert.deepEqual([write, notifications, exportData].map(input => input.props.checked), [true, true, false]);
    }
    return form;
  }
  const html = renderToStaticMarkup(createElement(InteractionHarness));
  assert.equal(phase, 2);
  assert.deepEqual(submitted, { password: 'synthetic-password', consent: true,
    capabilities: ['planner_read', 'planner_write', 'notifications'] });
  assert.match(html, /<button[^>]*disabled=""/);
});

function syntheticConnectionBackend() {
  const all = ['planner_read', 'planner_write', 'notifications', 'export'];
  const status = { enabled: true, configured: true, writesEnabled: false, publicUrl: null,
    linked: true, requiresReenrollment: false, revokedAt: null, capabilities: all };
  const state = { status, posts: [], failPosts: 0, failGets: 0, holdPosts: false, holdGets: false,
    releasePosts: [], releaseGets: [], getReplies: [], getCompleted: 0, revokeAfterPost: false };
  const json = (value, code = 200) => new Response(JSON.stringify(value), {
    status: code, headers: { 'Content-Type': 'application/json' },
  });
  window.connectionSmoke = state;
  window.fetch = async (_url, options = {}) => {
    if (options.method === 'GET') {
      if (state.failGets-- > 0) return json({ error: 'Synthetic refresh failed' }, 500);
      const reply = state.getReplies.shift() || { ...state.status };
      if (state.holdGets) await new Promise(resolve => state.releaseGets.push(resolve));
      state.getCompleted++;
      return json(reply);
    }
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      state.posts.push(body);
      if (state.holdPosts) await new Promise(resolve => state.releasePosts.push(resolve));
      if (state.failPosts-- > 0) return json({ error: 'Synthetic save failed' }, 400);
      state.status = { ...state.status, linked: !state.revokeAfterPost,
        requiresReenrollment: state.revokeAfterPost, revokedAt: null,
        capabilities: state.revokeAfterPost ? [] : body.capabilities };
    }
    if (options.method === 'DELETE') state.status = { ...state.status, linked: false,
      requiresReenrollment: false, revokedAt: '2026-10-11T12:00:00Z', capabilities: [] };
    return json(state.status);
  };
}

async function browserPage(t) {
  const page = await smokeBrowser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(5000);
  await page.route('**/*', route => route.abort());
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: browserBundle });
  await page.getByLabel('Current website password').waitFor();
  return page;
}

async function expectChoices(page, values) {
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('input[type="checkbox"]')]
    .map(input => input.checked)) === JSON.stringify(expected), [...values, false]);
  assert.equal(await page.getByLabel('Current website password').inputValue(), '');
  assert.equal(await page.getByLabel(/I authorize these permissions/).isChecked(), false);
}

async function authorize(page) {
  await page.getByLabel('Current website password').fill('synthetic-password');
  await page.getByLabel(/I authorize these permissions/).check();
  await page.locator('button[type="submit"]').click();
}

const browserOptions = { skip: !process.env.PLAYWRIGHT_MODULE, timeout: 30000 };
test('browser effects preserve exact grants through saves, failed requests and refreshes', browserOptions, async t => {
  const page = await browserPage(t);
  await expectChoices(page, [true, true, true]);
  await page.getByLabel(/Export all planner data/).uncheck();
  await authorize(page);
  await page.getByText('Selected agent permissions authorized.', { exact: true }).waitFor();
  await expectChoices(page, [true, true, false]);
  assert.deepEqual(await page.evaluate(() => window.connectionSmoke.status.capabilities),
    ['planner_read', 'planner_write', 'notifications']);
  await page.getByLabel(/Export all planner data/).check();
  await authorize(page);
  await expectChoices(page, [true, true, true]);
  await page.evaluate(() => { window.connectionSmoke.failPosts = 1; });
  await page.getByLabel(/Read and change notification settings/).uncheck();
  await authorize(page);
  await page.getByText('Synthetic save failed', { exact: true }).waitFor();
  await expectChoices(page, [true, false, true]);
  await page.evaluate(() => { window.connectionSmoke.failGets = 1; });
  await page.getByRole('button', { name: 'Refresh connection status', exact: true }).click();
  await page.getByText('Synthetic refresh failed', { exact: true }).waitFor();
  await expectChoices(page, [true, false, true]);
  assert.equal(await page.getByLabel('Current website password').isDisabled(), true);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('input[type="password"]').disabled);
  await expectChoices(page, [true, false, true]);
  await authorize(page);
  await page.getByText('Selected agent permissions authorized.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.connectionSmoke.status.capabilities),
    ['planner_read', 'planner_write', 'export']);
});

test('browser same-tick duplicate submissions start one request and disable the form until confirmation', browserOptions, async t => {
  const page = await browserPage(t);
  await page.evaluate(() => { window.connectionSmoke.holdPosts = true; });
  await page.getByLabel('Current website password').fill('synthetic-password');
  await page.getByLabel(/I authorize these permissions/).check();
  await page.evaluate(() => {
    const form = document.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.connectionSmoke.posts.length > 0);
  assert.equal(await page.evaluate(() => window.connectionSmoke.posts.length), 1);
  await expectChoices(page, [true, true, true]);
  assert.equal(await page.getByLabel(/Permission to create, edit and delete/).isDisabled(), true);
  assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
  await page.evaluate(() => { window.connectionSmoke.releasePosts.forEach(resolve => resolve()); });
  await page.getByText('Selected agent permissions authorized.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Current website password').isDisabled(), false);
});

test('browser disabling, re-enrollment and a concurrent revocation require fresh exact consent', browserOptions, async t => {
  const page = await browserPage(t);
  await page.getByLabel('Current website password').fill('synthetic-password');
  await page.getByLabel(/I authorize these permissions/).check();
  await page.getByRole('button', { name: 'Disable all agent access', exact: true }).click();
  await page.getByText('All agent access to UniPlanner is disabled.', { exact: true }).waitFor();
  await expectChoices(page, [false, false, false]);
  await page.getByLabel(/Read and change notification settings/).check();
  await authorize(page);
  await page.getByText('Selected agent permissions authorized.', { exact: true }).waitFor();
  await expectChoices(page, [false, true, false]);
  assert.deepEqual(await page.evaluate(() => window.connectionSmoke.status.capabilities), ['planner_read', 'notifications']);
  await page.evaluate(() => { window.connectionSmoke.revokeAfterPost = true; });
  await page.getByLabel(/Export all planner data/).check();
  await authorize(page);
  await page.getByText('Connection status changed before it could be confirmed. Review the current status before trying again.', { exact: true }).waitFor();
  await expectChoices(page, [false, false, false]);
  assert.equal(await page.getByText('Selected agent permissions authorized.', { exact: true }).count(), 0);
});

test('browser ignores an older status response arriving after a newer revoked status', browserOptions, async t => {
  const page = await browserPage(t);
  await page.evaluate(() => { window.connectionSmoke.failPosts = 1; });
  await authorize(page);
  await page.getByText('Synthetic save failed', { exact: true }).waitFor();
  await page.evaluate(() => {
    const state = window.connectionSmoke;
    state.holdGets = true;
    state.getReplies = [{ ...state.status }, { ...state.status, linked: false,
      requiresReenrollment: true, capabilities: [] }];
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === 'Refresh connection status');
    button.click();
    button.click();
  });
  await page.waitForFunction(() => window.connectionSmoke.releaseGets.length === 2);
  await page.evaluate(() => { window.connectionSmoke.releaseGets[1](); });
  await page.getByText('Your account has not authorized agent access.', { exact: true }).waitFor();
  await page.evaluate(() => { window.connectionSmoke.releaseGets[0](); });
  await page.waitForFunction(() => window.connectionSmoke.getCompleted === 3);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByText('Your account has not authorized agent access.', { exact: true }).count(), 1);
  await expectChoices(page, [false, false, false]);
});
