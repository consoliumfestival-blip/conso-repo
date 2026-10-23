import { coreColor } from '@/constants/coreTheme';
import { useCoreOverlayScope } from '@/core/contexts/CoreAppearanceContext';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { X, Bell, AlertTriangle, Info, AlertCircle } from 'lucide-react-native';
import { useNotification } from '../../core/contexts/NotificationContext';

export const NotificationToast = () => {
  const { style: themeStyle, ...themeProps } = useCoreOverlayScope();
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
      case 'URGENT': return <AlertTriangle size={24} color={isTeamPortal ? coreColor('#B84015', 'danger') : coreColor('#EF4444', 'danger')} />;
      case 'HIGH': return <AlertCircle size={24} color={isTeamPortal ? coreColor('#EC5E27', 'danger') : coreColor('#F59E0B', 'warning')} />;
      default: return <Bell size={24} color={isTeamPortal ? coreColor('#EC5E27', 'danger') : coreColor('#3B82F6', 'info')} />;
    }
  };

  const getBgColor = () => {
    switch (currentNotif.data?.priority) {
      case 'URGENT': return 'bg-core-danger-soft-red-50 border-core-danger-soft-red-200';
      case 'HIGH': return 'bg-core-warning-soft-amber-50 border-core-warning-soft-amber-200';
      default: return 'bg-core-surface-white border-core-border-gray-200';
    }
  };

  return (
    <Animated.View
      {...themeProps}
      style={[
        themeStyle,
        styles.container,
        {
          ...(isTeamPortal ? { backgroundColor: coreColor('#FFFEF8', 'surface'), borderColor: coreColor('#EADBCB', 'border'), borderWidth: 1 } : {}),
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
        <Text className={isTeamPortal ? "font-bold text-base" : "font-bold text-core-text-gray-900 text-base"} style={isTeamPortal ? { color: coreColor('#2D1C14', 'text') } : undefined}>{currentNotif.title}</Text>
        <Text className={isTeamPortal ? "mt-1" : "text-core-text-gray-700 mt-1"} style={isTeamPortal ? { color: coreColor('#796252', 'text') } : undefined}>{currentNotif.body}</Text>
      </View>
      <TouchableOpacity onPress={hideToast} className="p-2 ml-2">
        <X size={20} color={isTeamPortal ? coreColor("#796252", 'text') : coreColor("#6B7280", 'text')} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    elevation: 5,
  },
});
