import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const R2_BUCKET = Deno.env.get('R2_BUCKET') ?? 'sahi-assets';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing R2 Environment Variables");
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedObjectKey = (value: string) => {
  if (value.startsWith('templates/')) {
    return /^templates\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/.test(value);
  }
  if (value.startsWith('generated-posters/')) {
    return /^generated-posters\/[a-zA-Z0-9._-]+$/.test(value);
  }
  return /^festivals\/[a-zA-Z0-9-]+\/(profiles\/[a-zA-Z0-9-]+\/|certificates\/|exports\/|results\/|backups\/|posters\/|logos\/)[a-zA-Z0-9._-]+$/.test(value);
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user to verify authentication
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('tenant_id, role, is_superadmin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Administrator profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isAdmin = Boolean(profile.is_superadmin) || ['admin', 'admin_leader'].includes(profile.role);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only festival administrators may access managed assets' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { objectKey, contentType, operation = 'upload' } = await req.json();

    if (!objectKey) {
      return new Response(JSON.stringify({ error: 'Missing objectKey' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!allowedObjectKey(objectKey)) {
      return new Response(JSON.stringify({ error: 'Invalid objectKey' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const festivalMatch = /^festivals\/([a-zA-Z0-9-]+)\//.exec(objectKey);
    if (festivalMatch) {
      const { data: festival, error: festivalError } = await supabaseClient
        .from('festival_calendar')
        .select('id, tenant_id')
        .eq('id', festivalMatch[1])
        .maybeSingle();
      if (festivalError || !festival || (!profile.is_superadmin && festival.tenant_id !== profile.tenant_id)) {
        return new Response(JSON.stringify({ error: 'Asset is outside your festival scope' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (!profile.is_superadmin && (objectKey.startsWith('templates/') || objectKey.startsWith('generated-posters/'))) {
      // Legacy shared prefixes are still supported, but metadata is the
      // ownership contract. An admin may create a new key; existing keys can
      // only be used by the tenant that owns their metadata.
      if (!profile.tenant_id) {
        return new Response(JSON.stringify({ error: 'Tenant scope is required for shared assets' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const metadataTable = objectKey.startsWith('templates/') ? 'file_metadata' : 'generated_posters';
      const { data: metadata, error: metadataError } = await supabaseAdmin
        .from(metadataTable)
        .select('tenant_id')
        .eq('object_key', objectKey)
        .maybeSingle();
      if (metadataError) {
        return new Response(JSON.stringify({ error: 'Unable to verify shared asset ownership' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (metadata && metadata.tenant_id !== profile.tenant_id) {
        return new Response(JSON.stringify({ error: 'Asset is owned by another tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (operation !== 'upload' && operation !== 'verify' && !metadata) {
        return new Response(JSON.stringify({ error: 'Shared asset ownership metadata was not found' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!['upload', 'download', 'delete', 'verify'].includes(operation)) {
      return new Response(JSON.stringify({ error: 'Invalid operation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (operation === 'upload' && objectKey.includes('/profiles/') && !allowedImageTypes.has(contentType)) {
      return new Response(JSON.stringify({ error: 'Only JPG, PNG, and WEBP profile photos are allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let url;
    const publicDomain = Deno.env.get('R2_PUBLIC_DOMAIN') ?? '';
    if (operation === 'upload') {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        ContentType: contentType,
      });
      // Expiry 120 seconds as requested
      url = await getSignedUrl(s3Client, command, { expiresIn: 120 });
    } else if (operation === 'download') {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
      });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } else if (operation === 'delete') {
      const { error: auditError } = await supabaseClient.from('audit_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        action: 'R2_OBJECT_DELETE_REQUESTED',
        table_name: 'r2_objects',
        record_id: null,
        old_value: { object_key: objectKey },
        new_value: { operation, requested_at: new Date().toISOString() },
      });
      if (auditError) console.warn('R2 delete audit failed', auditError.message);
      const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
      });
      await s3Client.send(command);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else if (operation === 'verify') {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
      });
      let head;
      try {
        head = await s3Client.send(command);
      } catch (error: any) {
        return new Response(JSON.stringify({
          exists: false,
          objectKey,
          bucket: R2_BUCKET,
          error: error.message,
          publicUrl: publicDomain ? `https://${publicDomain}/${objectKey}` : null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      return new Response(JSON.stringify({
        exists: true,
        objectKey,
        bucket: R2_BUCKET,
        contentType: head.ContentType ?? null,
        contentLength: head.ContentLength ?? null,
        eTag: head.ETag ?? null,
        lastModified: head.LastModified?.toISOString() ?? null,
        publicUrl: publicDomain ? `https://${publicDomain}/${objectKey}` : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({
      url,
      objectKey,
      bucket: R2_BUCKET,
      publicUrl: publicDomain ? `https://${publicDomain}/${objectKey}` : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
