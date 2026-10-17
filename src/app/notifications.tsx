import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNotificationsInbox } from '../core/hooks/useNotificationsInbox';
import { SsfTableSkeleton } from '../components/ui/SsfSkeleton';
import { Bell, Clock, AlertTriangle, CheckCircle2, Megaphone, Check, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const palette = {
  page: '#030E21',
  surface: 'rgba(255, 255, 255, 0.04)',
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.6)',
};

export default function NotificationsInbox() {
  const router = useRouter();
  const { notifications, isLoading, refetch, markAsRead, isMarkingAsRead } = useNotificationsInbox();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return '#EF4444';
      case 'HIGH': return '#F59E0B';
      case 'LOW': return '#9CA3AF';
      case 'NORMAL':
      default: return '#3B82F6';
    }
  };

  const getIcon = (type: string, color: string) => {
    switch (type) {
      case 'emergency': return <AlertTriangle size={24} color={color} />;
      case 'reminder': return <Clock size={24} color={color} />;
      case 'result': return <CheckCircle2 size={24} color={color} />;
      case 'announcement':
      default: return <Megaphone size={24} color={color} />;
    }
  };

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <LinearGradient 
      colors={['#030F26', '#021E1B', '#02241F']}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{
        flex: 1,
        width: '100%',
        maxWidth: isDesktop ? 800 : undefined,
        maxHeight: isDesktop ? 900 : undefined,
        marginVertical: isDesktop ? 40 : 0,
        backgroundColor: isDesktop ? 'rgba(255, 255, 255, 0.02)' : undefined,
        borderRadius: isDesktop ? 10 : 0,
        borderWidth: isDesktop ? 1 : 0,
        borderBottomWidth: isDesktop ? 6 : 0,
        borderColor: 'rgba(255,255,255,0.08)',
        borderBottomColor: 'rgba(0,0,0,0.4)',
        overflow: 'hidden',
        ...Platform.select({
          web: isDesktop ? { backdropFilter: 'blur(20px)' } as any : {},
          default: {}
        })
      }}>
        {/* Custom Dark Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: isDesktop ? 24 : (Platform.OS === 'web' ? 24 : 48), paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={{ padding: 10, backgroundColor: palette.surface, borderRadius: 12, marginRight: 16, borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.1)' }}
          >
            <ArrowLeft size={20} color={palette.text} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontFamily: 'Montserrat_700Bold', fontSize: 24, color: palette.text, letterSpacing: -0.5 }}>Notifications</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: palette.muted }}>Your recent alerts and updates</Text>
          </View>
        </View>
      
      {isLoading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <SsfTableSkeleton rows={8} columns={3} compact />
        </View>
      ) : (
        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 800, alignSelf: 'center', width: '100%' }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#FFF" />}
        >
          {notifications.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
              <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderBottomWidth: 4, borderColor: palette.border }}>
                <Bell size={32} color={palette.muted} />
              </View>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: palette.text }}>No notifications yet</Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: palette.muted, marginTop: 8 }}>You&apos;re all caught up!</Text>
            </View>
          ) : (
            notifications.map(item => {
              const notif = item.notification;
              const isUnread = item.status === 'sent' || item.status === 'pending';
              const priorityColor = getPriorityColor(notif.priority);

              return (
                <View 
                  key={item.id} 
                  style={{
                    backgroundColor: isUnread ? 'rgba(40, 55, 80, 0.4)' : 'rgba(255, 255, 255, 0.03)',
                    borderColor: isUnread ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: isDesktop ? 20 : 14,
                    marginBottom: 16,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.15,
                    shadowRadius: 20,
                    elevation: 5,
                    ...Platform.select({
                      web: { backdropFilter: 'blur(20px)' } as any,
                      default: {}
                    })
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ 
                      marginRight: isDesktop ? 16 : 12, 
                      marginTop: 2, 
                      padding: isDesktop ? 12 : 10, 
                      borderRadius: isDesktop ? 18 : 14, 
                      backgroundColor: isUnread ? priorityColor + '25' : palette.surface,
                    }}>
                      {getIcon(notif.type, isUnread ? priorityColor : palette.muted)}
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: isDesktop ? 16 : 15, color: isUnread ? '#FFFFFF' : palette.muted, flex: 1, marginRight: 8, letterSpacing: -0.2 }}>
                          {notif.title}
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: isDesktop ? 12 : 11, color: 'rgba(255,255,255,0.5)' }}>
                          {new Date(notif.created_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      </View>
                      
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: isDesktop ? 14 : 13, color: isUnread ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', lineHeight: isDesktop ? 22 : 20 }}>
                        {notif.message}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {notif.priority !== 'NORMAL' && (
                            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: priorityColor + '20' }}>
                              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 10, color: priorityColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{notif.priority}</Text>
                            </View>
                          )}
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>{notif.type}</Text>
                          </View>
                        </View>
                        
                        {isUnread && (
                          <TouchableOpacity 
                            onPress={() => markAsRead(item.id)}
                            disabled={isMarkingAsRead}
                            style={{ 
                              flexDirection: 'row', 
                              alignItems: 'center', 
                              backgroundColor: 'rgba(255,255,255,0.1)', 
                              paddingHorizontal: isDesktop ? 16 : 12, 
                              paddingVertical: isDesktop ? 8 : 6, 
                              borderRadius: 20, 
                            }}
                          >
                            <Check size={14} color="#FFF" />
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: isDesktop ? 12 : 11, color: '#FFF', marginLeft: 6 }}>Mark Read</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      </View>
    </LinearGradient>
  );
}
