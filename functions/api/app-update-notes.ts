type PagesEnvironment = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

type PagesContext = { request: Request; env: PagesEnvironment };

type BuildInfo = { commit?: unknown };

const GITHUB_COMPARE_URL = 'https://api.github.com/repos/consoliumfestival-blip/conso-repo/compare';
const COMMIT_SHA = /^[a-f0-9]{40}$/i;
const MAX_DETAILS = 3;
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CACHE_HEADERS });
}

function cleanCommitTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim().slice(0, 110);
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const from = new URL(request.url).searchParams.get('from')?.toLowerCase() || '';
  if (!COMMIT_SHA.test(from)) return jsonResponse({ error: 'A valid app build is required.' }, 400);

  try {
    const buildResponse = await env.ASSETS.fetch(new Request(new URL('/app-build-info.json', request.url)));
    if (!buildResponse.ok) return jsonResponse({ summary: 'A new app update is ready.', details: [] });

    const buildInfo = await buildResponse.json() as BuildInfo;
    const to = typeof buildInfo.commit === 'string' ? buildInfo.commit.toLowerCase() : '';
    if (!COMMIT_SHA.test(to) || to === from) {
      return jsonResponse({ summary: 'A new app update is ready.', details: [] });
    }

    const compareResponse = await fetch(`${GITHUB_COMPARE_URL}/${from}...${to}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Consolium-App-Update-Notes',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!compareResponse.ok) return jsonResponse({ summary: 'A new app update is ready.', details: [] });

    const comparison = await compareResponse.json() as {
      status?: unknown;
      ahead_by?: unknown;
      commits?: { commit?: { message?: unknown } }[];
    };
    const details = (Array.isArray(comparison.commits) ? comparison.commits : [])
      .map((commit) => cleanCommitTitle(commit.commit?.message))
      .filter((title) => title && !/^Merge (branch|pull request|remote-tracking branch)\b/i.test(title))
      .filter(Boolean)
      .slice(-MAX_DETAILS);
    const summary = details.length === 1
      ? details[0]
      : details.length > 1
        ? `App update includes ${details.length} changes.`
        : 'App improvements are ready.';

    return jsonResponse({ summary, details });
  } catch {
    return jsonResponse({ summary: 'A new app update is ready.', details: [] });
  }
}
