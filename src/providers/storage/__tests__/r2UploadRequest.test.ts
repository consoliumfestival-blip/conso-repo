import test from 'node:test';
import assert from 'node:assert/strict';
import { R2UploadError, recoverR2ObjectAfterCreateOnlyConflict, uploadWithProgress } from '../r2UploadRequest';

class FakeXMLHttpRequest {
  static status = 200;
  static responseText = '';
  static latest: FakeXMLHttpRequest | null = null;

  status = FakeXMLHttpRequest.status;
  responseText = FakeXMLHttpRequest.responseText;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  headers = new Map<string, string>();
  responseHeaders = new Map<string, string>([['etag', '"poster-etag"']]);

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open(): void {}
  setRequestHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name.toLowerCase()) ?? null;
  }
  send(): void {
    queueMicrotask(() => this.onload?.());
  }
}

function withFakeXHR<T>(run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    value: FakeXMLHttpRequest,
  });

  return run().finally(() => {
    if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original);
    else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
  });
}

test('sends the create-only condition when requested and preserves the upload response', async () => {
  FakeXMLHttpRequest.status = 200;
  FakeXMLHttpRequest.responseText = '';
  await withFakeXHR(async () => {
    const response = await uploadWithProgress(
      'https://r2.example/signed',
      new Blob(['poster']),
      'image/jpeg',
      undefined,
      '*',
    );

    assert.equal(FakeXMLHttpRequest.latest?.headers.get('content-type'), 'image/jpeg');
    assert.equal(FakeXMLHttpRequest.latest?.headers.get('if-none-match'), '*');
    assert.equal(response.status, 200);
    assert.equal(response.eTag, '"poster-etag"');
  });
});

test('does not add the poster-only condition to ordinary uploads', async () => {
  await withFakeXHR(async () => {
    await uploadWithProgress('https://r2.example/signed', new Blob(['legacy']), 'image/jpeg');
    assert.equal(FakeXMLHttpRequest.latest?.headers.has('if-none-match'), false);
  });
});

test('retains the HTTP status for conditional-write reconciliation', async () => {
  FakeXMLHttpRequest.status = 412;
  FakeXMLHttpRequest.responseText = 'PreconditionFailed';
  await withFakeXHR(async () => {
    await assert.rejects(
      uploadWithProgress('https://r2.example/signed', new Blob(['poster']), 'image/jpeg', undefined, '*'),
      (error: unknown) => error instanceof R2UploadError
        && error.status === 412
        && /PreconditionFailed/.test(error.message),
    );
  });
  FakeXMLHttpRequest.status = 200;
  FakeXMLHttpRequest.responseText = '';
});

test('reuses an existing object after a create-only conflict when verification succeeds', async () => {
  const existing = { objectKey: 'poster-key', eTag: 'poster-etag' };
  let verificationCount = 0;
  const recovered = await recoverR2ObjectAfterCreateOnlyConflict(
    new R2UploadError(412, 'PreconditionFailed'),
    async () => {
      verificationCount += 1;
      return existing;
    },
  );

  assert.equal(recovered, existing);
  assert.equal(verificationCount, 1);
});

test('keeps a create-only conflict as failure when no object can be verified', async () => {
  const conflict = new R2UploadError(412, 'PreconditionFailed');
  await assert.rejects(
    recoverR2ObjectAfterCreateOnlyConflict(conflict, async () => null),
    (error: unknown) => error === conflict,
  );
});
