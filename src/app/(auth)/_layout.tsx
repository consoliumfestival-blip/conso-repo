import React from 'react';
import { Slot } from 'expo-router';
import { CoreAppearanceProvider } from '@/core/contexts/CoreAppearanceContext';

export default function CoreLoginLayout() {
  return <CoreAppearanceProvider><Slot /></CoreAppearanceProvider>;
}
