// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronAuthKey = Deno.env.get("CRON_AUTH_KEY");

    if (!supabaseUrl || !supabaseKey || !cronAuthKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // The scheduler is the only permitted caller. A valid end-user JWT alone
    // must not be enough to trigger service-role notification writes.
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (req.headers.get('Authorization') !== `Bearer ${cronAuthKey}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current time and time 10 minutes from now
    const now = new Date();
    const tenMinsFromNow = new Date(now.getTime() + 10 * 60000);

    // Fetch published schedules starting within the next 10 minutes that haven't been notified
    const { data: schedules, error: scheduleError } = await supabase
      .from("schedules")
      .select(`
        id,
        item_id,
        start_time,
        items!inner (
          item_name_en,
          item_name_ml
        )
      `)
      .eq("status", "published")
      .eq("notification_sent", false)
      .lte("start_time", tenMinsFromNow.toISOString())
      .gte("start_time", now.toISOString());

    if (scheduleError) {
      throw scheduleError;
    }

    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No upcoming schedules to notify." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all user tokens for users who have notifications enabled
    const { data: userTokens, error: tokenError } = await supabase
      .from("user_notification_tokens")
      .select(`
        token,
        user_id,
        profiles!inner (
          notification_enabled
        )
      `)
      .eq("profiles.notification_enabled", true);

    if (tokenError) {
      throw tokenError;
    }

    if (!userTokens || userTokens.length === 0) {
      // Mark as sent anyway so we don't keep checking
      for (const schedule of schedules) {
        await supabase
          .from("schedules")
          .update({ notification_sent: true })
          .eq("id", schedule.id);
      }
      return new Response(JSON.stringify({ message: "No tokens found to send." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokens = userTokens.map(t => t.token);

    const expoPushUrl = "https://exp.host/--/api/v2/push/send";
    const sentLogs: any[] = [];

    // Process each schedule
    for (const schedule of schedules) {
      const itemName = schedule.items?.item_name_en || "Upcoming Event";
      
      const message = {
        to: tokens,
        sound: "default",
        title: "📢 Competition Reminder",
        body: `${itemName} starts in 10 minutes. Please report to the venue.`,
        data: { scheduleId: schedule.id, type: "reminder" },
      };

      try {
        const response = await fetch(expoPushUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        const receipt = await response.json();

        // Save notification record
        const { data: notifData } = await supabase
          .from("notifications")
          .insert({
            title: message.title,
            message: message.body,
            type: "reminder",
            priority: "HIGH",
            sent_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (notifData) {
          // Log deliveries
          const logs = userTokens.map(ut => ({
            notification_id: notifData.id,
            user_id: ut.user_id,
            status: "sent",
            delivered_at: new Date().toISOString()
          }));
          
          await supabase.from("notification_logs").insert(logs);
        }

        // Update schedule
        await supabase
          .from("schedules")
          .update({ notification_sent: true })
          .eq("id", schedule.id);

        sentLogs.push({ scheduleId: schedule.id, receipt });
      } catch (err: any) {
        console.error("Push Error", err);
      }
    }

    return new Response(JSON.stringify({ message: "Notifications sent", details: sentLogs }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Cron Error", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
