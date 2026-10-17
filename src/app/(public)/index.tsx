import { Redirect } from 'expo-router';

export default function PublicLandingRoute() {
  return <Redirect href="/(auth)/login" />;
}
