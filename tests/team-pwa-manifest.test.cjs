/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/team-manifest.json'), 'utf8'));
const mainManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const htmlShell = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('Team Portal install manifest is scoped to the team routes and has a real high-resolution icon', () => {
  assert.equal(manifest.scope, '/team/');
  assert.ok(manifest.start_url.startsWith(manifest.scope));
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
  assert.equal(manifest.theme_color, '#1D1B19');
  assert.equal(manifest.background_color, '#1D1B19');
  assert.ok(manifest.icons.length > 0);
  assert.ok(manifest.icons.some((icon) => icon.sizes.split(/\\s+/).includes('192x192')));
  assert.ok(manifest.icons.some((icon) => icon.sizes.split(/\\s+/).includes('512x512')));

  for (const icon of manifest.icons) {
    const iconPath = path.resolve(root, 'public', `.${icon.src}`);
    assert.ok(iconPath.startsWith(path.resolve(root, 'public') + path.sep));
    const bytes = fs.readFileSync(iconPath);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    const actualSize = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
    assert.ok(icon.sizes.split(/\s+/).includes(actualSize), `${icon.src} manifest size matches ${actualSize}`);
  }
});

test('Team Portal manifest stays isolated from the main app manifest', () => {
  assert.equal(mainManifest.start_url, '/');
  assert.equal(mainManifest.scope, undefined);
  assert.equal(mainManifest.name, 'Alviora-2k26');
  assert.equal(mainManifest.theme_color, '#0F766E');
});

test('Team routes select their manifest and capture the browser install event before the app mounts', () => {
  assert.match(htmlShell, /manifestLink\.href = isTeamRoute\(\) \? '\/team-manifest\.json' : '\/manifest\.json'/);
  assert.match(htmlShell, /viewport-fit=cover/);
  assert.match(htmlShell, /beforeinstallprompt/);
});
