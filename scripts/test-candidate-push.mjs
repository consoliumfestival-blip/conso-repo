import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createPortalManifest } from '../src/core/utils/createPortalManifest.ts';
import { createVapidJwt, encryptWebPushPayload } from '../functions/api/candidate-push.ts';

test('createPortalManifest builds scoped standalone manifest for candidate profile only', () => {
  const url = new URL(
    'https://consoulium.sabicofficial.in/portal-manifest?portal=candidate&identity=fazl-edappal-89a36f2f&name=Fazal%20Edappal',
  );
  const manifest = createPortalManifest(url, 'candidate');
  assert.ok(manifest);
  assert.equal(manifest.name, 'Fazal Edappal');
  assert.equal(manifest.scope, 'https://consoulium.sabicofficial.in/candidate/');
  assert.equal(
    manifest.start_url,
    'https://consoulium.sabicofficial.in/candidate/fazl-edappal-89a36f2f?installedPortal=candidate',
  );
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#FAFBFD');
});

test('createVapidJwt signs ES256 token and encryptWebPushPayload produces valid aes128gcm header', async () => {
  const vapid = crypto.createECDH('prime256v1');
  vapid.generateKeys();
  const pubB64 = vapid.getPublicKey().toString('base64url');
  const privB64 = vapid.getPrivateKey().toString('base64url');

  const jwt = await createVapidJwt('https://fcm.googleapis.com', pubB64, privB64, 'mailto:admin@consoulium.in');
  const parts = jwt.split('.');
  assert.equal(parts.length, 3);
  const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.equal(decodedPayload.aud, 'https://fcm.googleapis.com');
  assert.equal(decodedPayload.sub, 'mailto:admin@consoulium.in');

  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const p256dh = ua.getPublicKey().toString('base64url');
  const auth = crypto.randomBytes(16).toString('base64url');

  const encrypted = await encryptWebPushPayload(
    JSON.stringify({ title: 'Result Published', body: 'First Place!' }),
    p256dh,
    auth,
  );
  assert.ok(encrypted instanceof Uint8Array);
  // 16-byte salt + 4-byte rs + 1-byte idlen(65) + 65-byte asPublic + ciphertext
  assert.ok(encrypted.length > 86);
  assert.equal(encrypted[20], 65);
  assert.equal(encrypted[21], 4);
});
