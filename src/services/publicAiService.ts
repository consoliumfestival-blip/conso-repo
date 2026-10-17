import { supabase } from '../core/config/supabase';

export interface PublicFestivalStats {
  published_results_count: number;
  live_stages_count: number;
  active_venues_count: number;
  total_items_count: number;
}

export interface PublicLeaderboardRow {
  organisation_name: string;
  total_points: number;
  first_place_count: number;
  second_place_count: number;
}

export interface PublicResultRow {
  item_name: string;
  item_name_ml: string | null;
  participant_name: string;
  organisation_name: string;
  rank: number;
  grade: string | null;
  points_awarded: number;
}

export interface PublicScheduleRow {
  item_name: string;
  item_name_ml: string | null;
  venue_name: string;
  start_time: string | null;
  status: string;
  item_category_codes?: string[];
}

export interface PublicParticipantRow {
  participant_id: string;
  festival_id: string;
  participant_name: string;
  chest_number: string | null;
  profile_slug: string | null;
  item_code: string | null;
  item_name: string | null;
  item_name_ml: string | null;
  rank: number | null;
  grade: string | null;
  points_awarded: number;
}

// Formats UTC date string to Kolkatta time for user display in context
function formatTime(timeStr: string | null): string {
  if (!timeStr) return 'Time TBA';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(timeStr));
  } catch (e) {
    return 'Time TBA';
  }
}

/**
 * Builds a lightweight context string containing public-safe statistics, standings,
 * active schedules, and latest results to supply to the Gemini API.
 * Keeps context payload under 2KB.
 */
export async function buildPublicFestivalContext(festivalId: string): Promise<string> {
  try {
    // 1. Fetch live status counts
    const { data: statsData, error: statsError } = await supabase
      .from('vw_public_live_status')
      .select('*')
      .eq('festival_id', festivalId)
      .maybeSingle();

    const stats: PublicFestivalStats = statsData || {
      published_results_count: 0,
      live_stages_count: 0,
      active_venues_count: 0,
      total_items_count: 0,
    };

    // 2. Fetch top 5 organisations on the leaderboard
    const { data: leadersData } = await supabase
      .from('vw_public_leaderboard')
      .select('organisation_name, total_points, first_place_count, second_place_count')
      .eq('festival_id', festivalId)
      .order('total_points', { ascending: false })
      .limit(5);

    const leaders: PublicLeaderboardRow[] = leadersData || [];

    // 3. Fetch latest 5 published results
    const { data: resultsData } = await supabase
      .from('vw_public_results')
      .select('item_name, item_name_ml, participant_name, organisation_name, rank, grade, points_awarded')
      .eq('festival_id', festivalId)
      .order('published_at', { ascending: false })
      .limit(5);

    const results: PublicResultRow[] = resultsData || [];

    // 4. Fetch all schedules to give complete calendar awareness (yesterday, today, completed, scheduled, live)
    const { data: allSchedulesData } = await supabase
      .from('vw_public_schedule')
      .select('item_name, item_name_ml, venue_name, start_time, status, item_category_codes')
      .eq('festival_id', festivalId)
      .order('start_time', { ascending: true });

    const allSchedules: PublicScheduleRow[] = allSchedulesData || [];

    // 5. Fetch public participant summaries (name, chest number, items, public visible results)
    const { data: participantsData } = await supabase
      .from('vw_public_participants')
      .select('*')
      .eq('festival_id', festivalId);

    const participantRows: PublicParticipantRow[] = participantsData || [];
    
    // Group participants in memory
    const participantMap = new Map<string, {
      name: string;
      chest_number: string | null;
      profile_slug: string | null;
      items: string[];
      results: string[];
    }>();

    participantRows.forEach(row => {
      let pt = participantMap.get(row.participant_id);
      if (!pt) {
        pt = {
          name: row.participant_name,
          chest_number: row.chest_number,
          profile_slug: row.profile_slug,
          items: [],
          results: []
        };
        participantMap.set(row.participant_id, pt);
      }
      
      if (row.item_code) {
        const itemDisplayName = row.item_name_ml || row.item_name || row.item_code;
        if (!pt.items.includes(itemDisplayName)) {
          pt.items.push(itemDisplayName);
        }
        
        if (row.rank !== null && row.rank !== undefined) {
          const resultStr = `${itemDisplayName} (Rank: ${row.rank}${row.grade ? `, Grade: ${row.grade}` : ''})`;
          if (!pt.results.includes(resultStr)) {
            pt.results.push(resultStr);
          }
        }
      }
    });

    // 6. Build Context Block
    const statsContext = `Festival Public Status:
- Total Published Results: ${stats.published_results_count}
- Currently Live Stages: ${stats.live_stages_count}
- Active Venues: ${stats.active_venues_count}
- Total Scheduled Items: ${stats.total_items_count}`;

    const standingsContext = `Top 5 Units Standings:
${leaders.length > 0 
  ? leaders.map((l, i) => `${i + 1}. ${l.organisation_name}: ${l.total_points} points (${l.first_place_count} first places)`).join('\n')
  : '- No standings calculated yet.'}`;

    const resultsContext = `Latest 5 Published Results:
${results.length > 0
  ? results.map(r => `- Event: "${r.item_name}" (${r.item_name_ml || ''}) | Winner: ${r.participant_name} from Unit ${r.organisation_name} | Rank: ${r.rank} | Grade: ${r.grade || 'No Grade'} | Points: ${r.points_awarded}`).join('\n')
  : '- No results published yet.'}`;

    const schedulesContext = `All Festival Event Schedules & Timelines:
${allSchedules.length > 0
  ? allSchedules.map(s => {
      const dateStr = s.start_time ? s.start_time.split('T')[0] : 'Date TBA';
      const categoriesStr = s.item_category_codes && s.item_category_codes.length > 0 
        ? ` | Category: ${s.item_category_codes.join(', ')}` 
        : '';
      return `- Event: "${s.item_name}" (${s.item_name_ml || ''})${categoriesStr} | Venue: ${s.venue_name} | Date: ${dateStr} | Time: ${formatTime(s.start_time)} | Status: ${s.status}`;
    }).join('\n')
  : '- No events scheduled.'}`;

    const participantsContext = `Safe Participant Profiles:
${participantMap.size > 0
  ? Array.from(participantMap.values()).map(p => {
      const itemsStr = p.items.length > 0 ? p.items.join(', ') : 'None';
      const resultsStr = p.results.length > 0 ? p.results.join('; ') : 'No public results yet';
      return `- Candidate: ${p.name} (Chest No: ${p.chest_number || 'N/A'}, Slug: ${p.profile_slug || 'N/A'}) | Registered Items: ${itemsStr} | Public Results: ${resultsStr}`;
    }).join('\n')
  : '- No participant records available.'}`;

    return [
      statsContext,
      standingsContext,
      resultsContext,
      schedulesContext,
      participantsContext
    ].join('\n\n');
  } catch (error) {
    console.error('Error building public AI context:', error);
    return 'Error building festival context. Please answer queries using general knowledge or politely ask the user to wait.';
  }
}

/**
 * Ensures the response does not leak internal terminology or bypass guardrails.
 */
export function sanitizeResponse(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  
  // Strict block words representing restricted data
  const blockWords = [
    'unpublished',
    'restricted data',
    'service role',
    'judging sheet',
    'raw marks',
    'internal api',
    'audit logs',
    'moderation status'
  ];

  for (const word of blockWords) {
    if (lower.includes(word)) {
      return 'That information is not publicly available yet.';
    }
  }

  return text;
}
