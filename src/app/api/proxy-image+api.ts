const PRIVATE_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|.*\.(local|internal))$/i;

function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (PRIVATE_HOST_REGEX.test(host)) return false;

  if (
    host.endsWith('.r2.cloudflarestorage.com') ||
    host.endsWith('.r2.dev') ||
    host.endsWith('.supabase.co')
  ) {
    return true;
  }

  const configuredDomain = (process.env.EXPO_PUBLIC_R2_PUB_DOMAIN || '').trim();
  if (configuredDomain) {
    const cleanDomain = configuredDomain.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    if (cleanDomain && host === cleanDomain) {
      return true;
    }
  }

  return false;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new Response('Missing URL', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return new Response('Only HTTPS URLs are allowed', { status: 403 });
  }

  if (!isAllowedImageHost(parsed.hostname)) {
    return new Response('Host is not in the image allowlist', { status: 403 });
  }

  try {
    const response = await fetch(parsed.toString(), { redirect: 'error' });
    if (!response.ok) {
      return new Response('Failed to fetch image', { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response('Target resource is not an image', { status: 415 });
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Error fetching image', { status: 500 });
  }
}
