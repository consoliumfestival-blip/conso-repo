import React from 'react';
import { Redirect } from 'expo-router';

export default function LeaderboardIndex() {
  return <Redirect href="/(admin)/settings/leaderboard/unit-rankings" />;
}
