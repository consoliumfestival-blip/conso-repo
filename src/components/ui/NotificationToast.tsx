import React, { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { X, Bell, AlertTriangle, Info, AlertCircle } from 'lucide-react-native';
import { useNotification } from '../../core/contexts/NotificationContext';

export const NotificationToast = () => {
  const { notification } = useNotification();
  const isTeamPortal = usePathname().startsWith('/team');
  const [visible, setVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(-100));
  const [currentNotif, setCurrentNotif] = useState<any>(null);

  useEffect(() => {
    if (notification) {
      const { title, body, data } = notification.request.content;
      setCurrentNotif({ title, body, data });
      showToast();
      
      const priority = data?.priority || 'NORMAL';
      let timeout = 5000;
      
      switch (priority) {
        case 'LOW': timeout = 3000; break;
        case 'HIGH': timeout = 8000; break;
        case 'URGENT': timeout = 0; break; // Manual dismiss
      }

      if (timeout > 0) {
        const timer = setTimeout(() => {
          hideToast();
        }, timeout);
        return () => clearTimeout(timer);
      }
    }
  }, [notification]);

  const showToast = () => {
    setVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setCurrentNotif(null);
    });
  };

  if (!visible || !currentNotif) return null;

  const getIcon = () => {
    switch (currentNotif.data?.priority) {
      case 'URGENT': return <AlertTriangle size={24} color={isTeamPortal ? '#B84015' : '#EF4444'} />;
      case 'HIGH': return <AlertCircle size={24} color={isTeamPortal ? '#EC5E27' : '#F59E0B'} />;
      default: return <Bell size={24} color={isTeamPortal ? '#EC5E27' : '#3B82F6'} />;
    }
  };

  const getBgColor = () => {
    switch (currentNotif.data?.priority) {
      case 'URGENT': return 'bg-red-50 border-red-200';
      case 'HIGH': return 'bg-amber-50 border-amber-200';
      default: return 'bg-white border-gray-200';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          ...(isTeamPortal ? { backgroundColor: '#FFFEF8', borderColor: '#EADBCB', borderWidth: 1 } : {}),
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
      className={`absolute top-12 left-4 right-4 z-50 flex-row items-center p-4 rounded-xl border shadow-lg ${isTeamPortal ? '' : getBgColor()}`}
    >
      <View className="mr-3">
        {getIcon()}
      </View>
      <View className="flex-1">
        <Text className={isTeamPortal ? "font-bold text-base" : "font-bold text-gray-900 text-base"} style={isTeamPortal ? { color: '#2D1C14' } : undefined}>{currentNotif.title}</Text>
        <Text className={isTeamPortal ? "mt-1" : "text-gray-700 mt-1"} style={isTeamPortal ? { color: '#796252' } : undefined}>{currentNotif.body}</Text>
      </View>
      <TouchableOpacity onPress={hideToast} className="p-2 ml-2">
        <X size={20} color={isTeamPortal ? "#796252" : "#6B7280"} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    elevation: 5,
  },
});
