import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

export function Footer() {
  const router = useRouter();

  return (
    <View className="w-full items-center px-5 pb-7">
      <TouchableOpacity onPress={() => router.push('/login' as never)} activeOpacity={0.72} className="rounded-full px-4 py-2">
        <Text className="font-poppins" style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>
          Staff Login
        </Text>
      </TouchableOpacity>
    </View>
  );
}
