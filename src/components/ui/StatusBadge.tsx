import React from 'react';
import { View, Text, ViewProps } from 'react-native';

interface StatusBadgeProps extends ViewProps {
 status: 'A+' | 'A' | 'B' | 'C' | 'Pending' | 'Completed' | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', ...props }) => {
 let bgColorClass = 'bg-gray-200 ';
 let textColorClass = 'text-gray-700 ';

 if (status === 'A+') {
 bgColorClass = 'bg-ssf-gold/20';
 textColorClass = 'text-ssf-gold';
 } else if (status === 'A') {
 bgColorClass = 'bg-ssf-primary/20';
 textColorClass = 'text-ssf-primary';
 } else if (status === 'B') {
 bgColorClass = 'bg-blue-500/20';
 textColorClass = 'text-blue-500';
 } else if (status === 'Pending') {
 bgColorClass = 'bg-yellow-500/20';
 textColorClass = 'text-yellow-600 ';
 } else if (status === 'Completed') {
 bgColorClass = 'bg-green-500/20';
 textColorClass = 'text-green-600 ';
 }

 return (
 <View className={`px-2 py-1 rounded-md self-start ${bgColorClass} ${className}`} {...props}>
 <Text className={`font-poppins-black text-xs uppercase tracking-wider ${textColorClass}`}>
 {status}
 </Text>
 </View>
 );
};
