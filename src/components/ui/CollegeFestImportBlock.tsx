import React from 'react';
import { View, Text } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { SsfButton } from './SsfButton';
import { useGoBack } from '../../core/hooks/useGoBack';

export function CollegeFestImportBlock() {
  const goBack = useGoBack('/(admin)/participants');

  return (
    <View className="flex-1 bg-ssf-bg p-6 items-center justify-center">
      <View className="bg-amber-50 border border-amber-200 rounded-2xl p-6 max-w-md w-full items-center">
        <ShieldAlert size={40} color="#B45309" className="mb-3" />
        <Text className="font-poppins-bold text-base text-amber-900 text-center mb-2">
          Bulk import is not available for College Fest
        </Text>
        <Text className="font-poppins text-sm text-amber-800 text-center leading-5">
          Participants for College Fest must be added manually with their
          category selected as Sub Junior, Junior, or Senior.
        </Text>
        <SsfButton label="Go to Participants" onPress={goBack} className="mt-5" />
      </View>
    </View>
  );
}
