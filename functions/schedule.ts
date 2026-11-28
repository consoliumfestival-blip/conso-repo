export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const indexUrl = new URL('/index.html', request.url);
  const assetResponse = await (env as { ASSETS: { fetch: (input: RequestInfo | URL) => Promise<Response> } }).ASSETS.fetch(indexUrl);
  const headers = new Headers(assetResponse.headers);
  headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
};
