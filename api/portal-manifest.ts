import { createPortalManifest } from '../src/core/utils/createPortalManifest';

type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  send: (body: string) => void;
};

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return response.status(405).send('Method not allowed');
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : 'https';
  if (!host) return response.status(400).send('Host unavailable');

  const origin = `${protocol}://${Array.isArray(host) ? host[0] : host}`;
  const requestUrl = new URL(request.url || '/portal-manifest', origin);
  const manifest = createPortalManifest(requestUrl, requestUrl.searchParams.get('portal'));
  if (!manifest) return response.status(400).send('Unknown portal');

  response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(200).send(JSON.stringify(manifest));
}
