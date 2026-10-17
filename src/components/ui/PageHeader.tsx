import React from 'react';
import { View, Text, Platform } from 'react-native';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
}

export function PageHeader({ title, subtitle, leftComponent, rightComponent }: PageHeaderProps) {
  return (
    <View
      className="bg-ui-surface px-5 py-4 z-10 flex-row items-center border-b border-ui-border"
      style={Platform.select({
        web: { minHeight: 72 },
        default: { minHeight: 68 },
      })}
    >
      {leftComponent && <View className="mr-3">{leftComponent}</View>}
      <View className="flex-1 justify-center">
        <Text className="text-xl font-poppins-bold text-ui-text">{title}</Text>
        {subtitle && <Text className="text-xs font-poppins text-ui-text-muted mt-1">{subtitle}</Text>}
      </View>
      {rightComponent && <View className="ml-3">{rightComponent}</View>}
    </View>
  );
}
