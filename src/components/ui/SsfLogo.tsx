import React from 'react';
import { Text, View } from 'react-native';

interface SsfLogoProps {
 size?: 'sm' | 'md' | 'lg' | 'xl';
 showText?: boolean;
}

export const SsfLogo: React.FC<SsfLogoProps> = ({ size = 'md', showText = true }) => {
 const sizeClasses = {
 sm: 'text-2xl',
 md: 'text-4xl',
 lg: 'text-6xl',
 xl: 'text-8xl',
 };

 return (
 <View className="flex-row items-center justify-center">
 <Text className={`${sizeClasses[size]} font-cooper text-ssf-primary tracking-tighter`}>
 SS<Text className="text-ssf-gold">F</Text>
 </Text>
 {showText && (
 <View className="ml-3 justify-center">
 <Text className="text-ssf-primary font-poppins text-xs uppercase tracking-widest leading-tight">
 Sahithyolsav
 </Text>
 <Text className="text-ssf-gold font-poppins-black text-[10px] uppercase tracking-widest leading-none">
 Festival
 </Text>
 </View>
 )}
 </View>
 );
};
