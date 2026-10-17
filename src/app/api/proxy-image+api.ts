import { ExpoRequest, ExpoResponse } from 'expo-router/server';

export async function GET(req: ExpoRequest) {
  const url = new URL(req.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new ExpoResponse('Missing URL', { status: 400 });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return new ExpoResponse('Failed to fetch image', { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    return new ExpoResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return new ExpoResponse('Error fetching image', { status: 500 });
  }
}
