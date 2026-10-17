// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (req) => {
  // CORS headers for browser requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth token
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Verify user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id, is_superadmin')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_superadmin && !['admin', 'admin_leader'].includes(profile.role))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { title, message, priority, type } = await req.json();

    if (!title || !message) {
      return new Response(JSON.stringify({ error: 'Missing title or message' }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let profilesQuery = supabase.from('profiles').select('id');
    if (type !== 'emergency') {
      profilesQuery = profilesQuery.eq("notification_enabled", true);
    }
    if (!profile.is_superadmin) {
      profilesQuery = profilesQuery.eq("tenant_id", profile.tenant_id);
    }
    
    const { data: eligibleProfiles, error: profError } = await profilesQuery;
    if (profError) throw profError;
    
    let userIds = eligibleProfiles.map(p => p.id);

    // ALWAYS include the sender in the recipients so they can see their own message in the Inbox
    if (!userIds.includes(user.id)) {
      userIds.push(user.id);
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ message: "No users found to send." }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Save notification record FIRST so it appears in the app even if no push tokens exist
    const { data: notifData, error: insertError } = await supabase
      .from("notifications")
      .insert({
        title,
        message,
        type: type || 'announcement',
        priority: priority || 'NORMAL',
        sender_id: user.id,
        tenant_id: profile.is_superadmin ? null : profile.tenant_id,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (insertError) {
      throw insertError;
    }

    if (notifData) {
      // Log deliveries for ALL eligible users (so it shows in their Inbox)
      const logs = userIds.map(uid => ({
        notification_id: notifData.id,
        user_id: uid,
        status: "sent",
        delivered_at: new Date().toISOString()
      }));
      
      await supabase.from("notification_logs").insert(logs);
    }

    const { data: userTokens, error: tokenError } = await supabase
      .from("user_notification_tokens")
      .select('token, user_id')
      .in('user_id', userIds);

    if (tokenError) {
      throw tokenError;
    }

    if (!userTokens || userTokens.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Saved to database, but no push tokens found to send mobile alerts." }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const tokens = userTokens.map(t => t.token);
    const expoPushUrl = "https://exp.host/--/api/v2/push/send";

    const pushMessage = {
      to: tokens,
      sound: "default",
      title: title,
      body: message,
      data: { type, priority },
    };

    let receipt = null;
    try {
      const response = await fetch(expoPushUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pushMessage),
      });
      receipt = await response.json();
    } catch (e) {
      console.error("Expo push error:", e);
    }

    return new Response(JSON.stringify({ success: true, receipt }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (err: any) {
    console.error("Send Error", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
