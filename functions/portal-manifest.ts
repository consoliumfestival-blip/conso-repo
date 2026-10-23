import { createPortalManifest } from '../src/core/utils/createPortalManifest';

export async function onRequestGet({ request }: { request: Request }) {
  const requestUrl = new URL(request.url);
  const manifest = createPortalManifest(requestUrl, requestUrl.searchParams.get('portal'));
  if (!manifest) return new Response('Unknown portal', { status: 400 });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
