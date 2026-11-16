import React from 'react';
import { Link } from 'expo-router';
import { Platform, Text, View } from 'react-native';

export function PublicUnavailableScreen({ title = 'This public page is unavailable.', message }: { title?: string; message?: string }) {
  const content = <View style={{ flex: 1, minHeight: Platform.OS === 'web' ? '100vh' as any : undefined, backgroundColor: '#071426', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <View style={{ width: '100%', maxWidth: 460, backgroundColor: '#10233A', borderColor: '#29425C', borderWidth: 1, borderRadius: 18, padding: 24 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: '#B9C9D9', fontSize: 14, lineHeight: 22, marginTop: 9 }}>{message || 'The festival administrator has disabled this section.'}</Text>
      <Link href="/(auth)/login" style={{ color: '#7DD3C7', fontSize: 14, fontWeight: '700', marginTop: 20 }}>Admin sign in</Link>
    </View>
  </View>;
  return content;
}
