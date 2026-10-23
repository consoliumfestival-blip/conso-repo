import { coreColor } from '@/constants/coreTheme';
import React from 'react';
import { Stack } from 'expo-router';
import { CoreAppearanceProvider } from '@/core/contexts/CoreAppearanceContext';

// Core appearance also covers the superadmin workspace.

export default function SuperadminLayout() {
  return (
    <CoreAppearanceProvider><Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: {
          backgroundColor: coreColor('#0B1524', 'background'),
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="organisations/index"
        options={{
          presentation: 'card',
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: {
            backgroundColor: coreColor('#0B1524', 'background'),
          },
        }}
      />
    </Stack></CoreAppearanceProvider>
  );
}
