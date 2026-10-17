import { Stack } from 'expo-router';

export default function StageManagementLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Completely isolated, no headers
        contentStyle: { backgroundColor: '#F9FAFB' },
      }}
    />
  );
}
