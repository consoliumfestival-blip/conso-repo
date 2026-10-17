import React from 'react';
import { Stack } from 'expo-router';

// Midnight Blue Theme Token
// Background:  #0B1524 (Deep Midnight)
// Surface:     #111E35 (Dark Navy)
// Border:      #1E3A5F (Steel Blue border)
// Accent:      #FBBF24 (Gold)
// Text:        #E2E8F0 (Light Slate)

export default function SuperadminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: {
          backgroundColor: '#0B1524',
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
            backgroundColor: '#0B1524',
          },
        }}
      />
    </Stack>
  );
}
