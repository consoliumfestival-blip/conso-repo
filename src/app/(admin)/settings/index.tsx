import React from 'react';
import { Redirect } from 'expo-router';

export default function SettingsIndex() {
  return <Redirect href="/(admin)/settings/calendar" />;
}
