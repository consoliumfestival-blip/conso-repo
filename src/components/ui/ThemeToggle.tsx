import React from 'react';
import { TouchableOpacity, Text, View, TouchableOpacityProps } from 'react-native';
import { useTheme } from '@/core/contexts/ThemeContext';

interface ThemeToggleProps extends TouchableOpacityProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', onPress, ...props }) => {
  const { isDark, setThemeOption } = useTheme();

  const handlePress = (e: any) => {
    setThemeOption(isDark ? 'light' : 'dark');
    onPress?.(e);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      className={`flex-row items-center rounded-full px-3 py-2 ${
        isDark ? 'bg-gray-800' : 'bg-ui-border'
      } ${className}`.trim()}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      {...props}
    >
      <View className="mr-1.5">
        <Text className="text-xs">{isDark ? '??' : '??'}</Text>
      </View>
      <Text
        className={`font-poppins-bold text-xs ${
          isDark ? 'text-gray-200' : 'text-ui-text'
        }`}
      >
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </Text>
    </TouchableOpacity>
  );
};

export default ThemeToggle;