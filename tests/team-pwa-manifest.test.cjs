/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/team-manifest.json'), 'utf8'));
const mainManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));

test('Team Portal install manifest is scoped to the team routes and has a real high-resolution icon', () => {
  assert.equal(manifest.scope, '/team/');
  assert.ok(manifest.start_url.startsWith(manifest.scope));
  assert.equal(manifest.display, 'standalone');
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
});
