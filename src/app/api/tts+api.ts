import { getAllAudioUrls } from 'google-tts-api';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Split text into chunks and get Google TTS URLs
    const urlObjects = getAllAudioUrls(text, {
      lang: 'ml',
      slow: false,
      host: 'https://translate.google.com',
      splitPunct: ',.!?\n',
    });

    // Fetch all audio chunks sequentially to maintain order and avoid rate limits
    const buffers: Uint8Array[] = [];
    for (const urlObj of urlObjects) {
      const response = await fetch(urlObj.url);
      if (!response.ok) {
        throw new Error('Failed to fetch TTS chunk from Google');
      }
      const arrayBuffer = await response.arrayBuffer();
      buffers.push(new Uint8Array(arrayBuffer));
      
      // Small delay to prevent rate-limiting by Google
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Combine all Uint8Array chunks into one single array
    const totalLength = buffers.reduce((acc, curr) => acc + curr.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
      combinedBuffer.set(buffer, offset);
      offset += buffer.length;
    }

    // Return the combined MP3 file
    return new Response(combinedBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('TTS API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'TTS generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
