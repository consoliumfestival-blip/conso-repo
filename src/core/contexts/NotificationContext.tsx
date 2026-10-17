import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, View, Text, Animated } from 'react-native';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../store/authStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
});

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  
  const [toastQueue, setToastQueue] = useState<{ title: string; message: string }[]>([]);
  const [toast, setToast] = useState<{ title: string; message: string; visible: boolean } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { user } = useAuthStore();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log(response);
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => {
    if (user && expoPushToken) {
      saveTokenToDatabase(user.id, expoPushToken);
    }
  }, [user, expoPushToken]);

  // Fetch past unread notifications on login/app load
  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    
    const fetchUnread = async () => {
      // Small delay to allow app to render first
      await new Promise(r => setTimeout(r, 1500));
      if (!isMounted) return;

      const { data } = await supabase
        .from('notification_logs')
        .select(`
          id,
          notifications (
            title,
            message
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(5); // Limit to latest 5 to avoid overwhelming the screen

      if (data && data.length > 0) {
        const unreadToasts = data.map(log => {
          const notif = Array.isArray(log.notifications) ? log.notifications[0] : log.notifications;
          return { title: notif?.title || 'Notification', message: notif?.message || '' };
        }).filter(t => t.message !== '');
        
        if (isMounted) {
          setToastQueue(prev => [...prev, ...unreadToasts]);
        }
      }
    };
    
    fetchUnread();
    
    return () => { isMounted = false; };
  }, [user]);

  // Supabase Realtime Subscription for Web Popups
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`public:notification_logs_${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_logs',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // Fetch the associated notification
          const { data: notifData } = await supabase
            .from('notifications')
            .select('title, message')
            .eq('id', payload.new.notification_id)
            .single();

          if (notifData) {
            setToastQueue(prev => [...prev, { title: notifData.title, message: notifData.message }]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Process the Toast Queue
  useEffect(() => {
    if (toastQueue.length > 0 && (!toast || !toast.visible)) {
      const nextToast = toastQueue[0];
      setToast({ ...nextToast, visible: true });
      setToastQueue(prev => prev.slice(1));

      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          setToast(prev => prev ? { ...prev, visible: false } : null);
        });
      }, 4000);
    }
  }, [toastQueue, toast]);

  const saveTokenToDatabase = async (userId: string, token: string) => {
    try {
      await supabase
        .from('user_notification_tokens')
        .upsert({ 
          user_id: userId, 
          token, 
          device_type: Platform.OS,
          last_seen: new Date().toISOString()
        }, { onConflict: 'user_id,token' });
    } catch (error) {
      console.error('Failed to save push token to DB:', error);
    }
  };

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
      
      {/* Toast Popup */}
      {toast && toast.visible && (
        <View style={{
          position: 'absolute',
          top: Platform.OS === 'web' ? 30 : 60,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          <Animated.View style={{
            opacity: fadeAnim,
            transform: [{
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-30, 0]
              })
            }],
            backgroundColor: 'rgba(30, 41, 59, 0.94)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.16)',
            borderRadius: 18,
            padding: 14,
            paddingHorizontal: 16,
            minWidth: Platform.OS === 'web' ? 360 : '90%',
            maxWidth: 500,
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
            flexDirection: 'row',
            alignItems: 'center',
            ...Platform.select({
              web: {
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
              } as any,
              default: {}
            })
          }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
              <Text style={{ fontSize: 20 }}>🔔</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, marginBottom: 2, fontWeight: '600', letterSpacing: -0.2 }}>{toast.title}</Text>
              <Text style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{toast.message}</Text>
            </View>
          </Animated.View>
        </View>
      )}
    </NotificationContext.Provider>
  );
};

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    console.log('Push notifications on web require VAPID key configuration.');
    return null;
  }

  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId 
        ?? Constants?.easConfig?.projectId;
        
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.error('Error getting Expo Push Token:', e);
      // Fallback for bare workflows or if config is missing
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
