import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Modular AI Interface
interface AIProvider {
  generateResponse(prompt: string, systemInstruction: string, tools: any[], context: any): Promise<string>;
}

// Gemini Provider
class GeminiProvider implements AIProvider {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  async generateResponse(prompt: string, systemInstruction: string, tools: any[], context: any): Promise<string> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    // Use gemini-2.5-flash as it supports system instructions and function calling
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction,
    });
    
    // Convert our internal tool format to Gemini format if necessary,
    // or we can handle tools manually by executing the logic before passing to Gemini if it's too complex.
    // For safety and control, we inject the context as JSON directly into the prompt/system instruction
    // so Gemini has all the deep analytics pre-calculated without needing to make iterative API calls.
    
    const enhancedPrompt = `Context Data:\n${JSON.stringify(context, null, 2)}\n\nUser Question:\n${prompt}`;
    
    const result = await model.generateContent(enhancedPrompt);
    return result.response.text();
  }
}

// Local AI Provider (Ollama Qwen Integration)
class LocalAIProvider implements AIProvider {
  async generateResponse(prompt: string, systemInstruction: string, tools: any[], context: any): Promise<string> {
    try {
      console.log("Routing request to Local AI (Ollama Qwen)...");
      const enhancedPrompt = `System: ${systemInstruction}\n\nContext Data:\n${JSON.stringify(context, null, 2)}\n\nUser Question:\n${prompt}`;
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen', // Target Qwen model installed on Ollama
          prompt: enhancedPrompt,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error! Status: ${response.status}`);
      }

      const data = await response.json();
      return data.response || "No response from Local AI.";
    } catch (error: any) {
      console.error("Local AI (Ollama) Request Failed:", error);
      return "ക്ഷമിക്കണം, നിലവിൽ AI നെറ്റ്വർക്ക് ഡൌൺ ആണ് (Local AI connection failed). ദയവായി പിന്നീട് ശ്രമിക്കുക.";
    }
  }
}

// Get Supabase Admin Client (Bypasses RLS)
function getAdminSupabase() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or Service Role Key");
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Deep Analytics Functions (100% Read-Only)
async function fetchDeepAnalytics(supabaseAdmin: any, tenantId: string, festivalId: string | null) {
  const analytics: any = {};
  
  try {
    let baseQuerySchedules = supabaseAdmin.from('schedules').select('id, item_id, status, items(item_name_en, item_name_ml)').eq('tenant_id', tenantId);
    if (festivalId) baseQuerySchedules = baseQuerySchedules.eq('festival_id', festivalId);
    const { data: schedules } = await baseQuerySchedules;

    let baseQueryRegistrations = supabaseAdmin.from('registrations').select('id, status, code_letter, item_id').eq('tenant_id', tenantId);
    if (festivalId) baseQueryRegistrations = baseQueryRegistrations.eq('festival_id', festivalId);
    const { data: registrations } = await baseQueryRegistrations;

    let baseQueryMarks = supabaseAdmin.from('mark_entries').select('id, schedule_id, is_draft, is_final').eq('tenant_id', tenantId);
    const { data: marks } = await baseQueryMarks;

    let baseQueryAttendance = supabaseAdmin.from('attendance').select('id, schedule_id, status').eq('tenant_id', tenantId);
    const { data: attendance } = await baseQueryAttendance;

    // 1. Total & Event Counts
    analytics.total_schedules = schedules?.length || 0;
    analytics.completed_schedules = schedules?.filter((s: any) => s.status === 'completed').length || 0;
    analytics.live_schedules = schedules?.filter((s: any) => s.status === 'live').length || 0;

    // 2. Duplicates Detection (Same item_id in schedules multiple times)
    const itemCounts: Record<string, number> = {};
    const duplicates: string[] = [];
    schedules?.forEach((s: any) => {
      if (s.item_id) {
        itemCounts[s.item_id] = (itemCounts[s.item_id] || 0) + 1;
        if (itemCounts[s.item_id] === 2) {
          duplicates.push(s.items?.item_name_en || 'Unknown Item');
        }
      }
    });
    analytics.duplicate_schedules_detected = duplicates;

    // 3. Check-in Status
    analytics.total_checkins = attendance?.filter((a: any) => a.status === 'present').length || 0;

    // 4. Code Shuffle Analysis (Registrations with assigned code_letter)
    analytics.registrations_with_code_shuffle = registrations?.filter((r: any) => r.code_letter != null).length || 0;
    analytics.total_registrations = registrations?.length || 0;

    // 5. Incomplete Marks Analysis
    const incompleteMarkSchedules = new Set();
    marks?.forEach((m: any) => {
      if (m.is_draft === true || m.is_final === false) {
        incompleteMarkSchedules.add(m.schedule_id);
      }
    });
    analytics.schedules_with_incomplete_marks = incompleteMarkSchedules.size;

    // 6. Anomalies
    const anomalies = [];
    if (analytics.completed_schedules > 0 && analytics.schedules_with_incomplete_marks > 0) {
      // Find overlap
      schedules?.forEach((s: any) => {
        if (s.status === 'completed' && incompleteMarkSchedules.has(s.id)) {
          anomalies.push(`Schedule ${s.items?.item_name_en} is marked complete but has draft marks.`);
        }
      });
    }
    analytics.system_anomalies = anomalies;

  } catch (error) {
    console.error("Analytics Error:", error);
    analytics.error = "Could not fetch full deep analytics.";
  }
  
  return analytics;
}

// Single Write Action (Safe)
async function publishResultToPublic(supabaseAdmin: any, tenantId: string, resultId: string) {
  // Only updates public_visible status, zero changes to scores
  const { data, error } = await supabaseAdmin
    .from('results')
    .update({ public_visible: true, published: true })
    .eq('id', resultId)
    .eq('tenant_id', tenantId) // Safety check
    .select();
    
  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, tenantId, festivalId, adminAction } = body;

    if (!tenantId) {
      return Response.json({ error: 'Tenant ID is required for Admin actions.' }, { status: 400 });
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = getAdminSupabase();
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 500 });
    }

    // Handle Direct Action (Publish) bypass
    if (adminAction && adminAction.type === 'publish_result') {
      try {
        await publishResultToPublic(supabaseAdmin, tenantId, adminAction.resultId);
        return Response.json({ response: "Result successfully published to public." });
      } catch (e: any) {
        return Response.json({ error: "Failed to publish: " + e.message }, { status: 500 });
      }
    }

    // Pre-fetch all deep analytics for this tenant safely
    const deepAnalytics = await fetchDeepAnalytics(supabaseAdmin, tenantId, festivalId);

    const systemInstruction = `You are a highly secure, read-only Admin Assistant for a Festival Management System.
CRITICAL SAFETY RULES:
1. You act as a plugin. You do not modify existing options or break any frontend UI.
2. You have access to deep analytics (duplicates, check-ins, code shuffles, incomplete marks). 
3. If duplicates are detected, gently notify the admin (e.g. "There are duplicate schedules for X, please remove one").
4. ALWAYS reply in the language the user asks (Malayalam, English, or Manglish).
5. If the admin asks to publish a result, inform them they can use the manual 'Publish' button on the page.

Analyze this data and answer the user's question precisely:`;

    // Try Gemini First (Fallback Logic)
    let aiResponse = "";
    
    // Fetch system api keys from database for Gemini
    const { data: dbKeys } = await supabaseAdmin.from('system_api_keys').select('key_value').eq('provider', 'gemini').eq('is_active', true);
    const geminiKey = dbKeys && dbKeys.length > 0 ? dbKeys[0].key_value : (process.env.GEMINI_API_KEY || '');
    
    if (geminiKey) {
      try {
        const geminiProvider = new GeminiProvider(geminiKey);
        aiResponse = await geminiProvider.generateResponse(message, systemInstruction, [], deepAnalytics);
      } catch (e: any) {
        console.warn("Gemini Failed (possibly rate limit), falling back to Local AI:", e.message);
        const localProvider = new LocalAIProvider();
        aiResponse = await localProvider.generateResponse(message, systemInstruction, [], deepAnalytics);
      }
    } else {
      // Direct to Local AI if no Gemini key
      const localProvider = new LocalAIProvider();
      aiResponse = await localProvider.generateResponse(message, systemInstruction, [], deepAnalytics);
    }

    return Response.json({ response: aiResponse });

  } catch (error: any) {
    console.error('Admin AI API Error:', error);
    return Response.json(
      { error: 'Something went wrong: ' + error.message },
      { status: 500 }
    );
  }
}
