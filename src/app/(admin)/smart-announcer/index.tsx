import React from 'react';
import { Redirect } from 'expo-router';

export default function SmartAnnouncerRedirect() {
  return <Redirect href="/(admin)/settings/leaderboard/item-results" />;
}
