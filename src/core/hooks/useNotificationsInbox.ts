import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../store/authStore';

export interface NotificationItem {
  id: string; // from notification_logs
  status: string;
  delivered_at: string | null;
  created_at: string;
  notification: {
    id: string;
    title: string;
    message: string;
    type: string;
    priority: string;
    created_at: string;
  };
}

export function useNotificationsInbox() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('notification_logs')
        .select(`
          id,
          status,
          delivered_at,
          created_at,
          notifications (
            id,
            title,
            message,
            type,
            priority,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        throw error;
      }

      // Format response
      return (data as any[]).map(log => ({
        id: log.id,
        status: log.status,
        delivered_at: log.delivered_at,
        created_at: log.created_at,
        notification: log.notifications
      })) as NotificationItem[];
    },
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { data, error } = await supabase
        .from('notification_logs')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', logId)
        .select();

      if (error) throw error;
      
      // Supabase returns an empty array if RLS blocks the update, instead of throwing an error.
      if (!data || data.length === 0) {
        throw new Error('Permission denied: Unable to update the notification. RLS policy might be missing.');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
    onError: (error: any) => {
      console.error('Failed to mark as read:', error);
      // Let the user know if RLS or something else is failing
      alert('Could not mark as read: ' + (error.message || 'Unknown error'));
    }
  });

  return {
    notifications: data || [],
    isLoading,
    refetch,
    markAsRead: markAsReadMutation.mutate,
    isMarkingAsRead: markAsReadMutation.isPending
  };
}
