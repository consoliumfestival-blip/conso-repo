import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';
import { ui } from '@/constants/designSystem';

interface SsfButtonProps extends TouchableOpacityProps {
 label: string;
 variant?: 'primary' | 'outline' | 'ghost';
 size?: 'sm' | 'md' | 'lg';
 isLoading?: boolean;
 icon?: React.ReactNode;
}

export const SsfButton: React.FC<SsfButtonProps> = ({
 label,
 variant = 'primary',
 size = 'md',
 isLoading = false,
 icon,
 className = '',
 disabled,
 accessibilityLabel,
 accessibilityRole,
 accessibilityState,
 ...props
}) => {
 const baseClasses = 'items-center justify-center rounded-xl flex-row active:opacity-80';
 
 const variantClasses = {
 primary: 'bg-ui-primary',
 outline: 'border border-ui-border bg-ui-primary-soft',
 ghost: 'bg-transparent',
 };

 const sizeClasses = {
 sm: 'h-9 px-4',
 md: 'h-11 px-5',
 lg: 'h-13 px-7',
 };

 const textVariantClasses = {
 primary: 'text-white',
 outline: 'text-ui-text',
 ghost: 'text-ui-primary',
 };

 const textSizeClasses = {
 sm: 'text-sm',
 md: 'text-base',
 lg: 'text-lg',
 };

 const isDisabled = disabled || isLoading;

 return (
 <TouchableOpacity
 className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
 disabled={isDisabled}
 accessibilityRole={accessibilityRole ?? 'button'}
 accessibilityLabel={accessibilityLabel ?? label}
 accessibilityState={{
  ...accessibilityState,
  disabled: isDisabled,
  busy: isLoading,
 }}
 {...props}
 >
 {isLoading ? (
 <ActivityIndicator color={variant === 'primary' ? ui.colors.surface : ui.colors.primary} className="mr-2" />
 ) : icon ? (
 <View className="mr-2">{icon}</View>
 ) : null}
 <Text className={`font-poppins-bold ${textVariantClasses[variant]} ${textSizeClasses[size]}`}>
 {label}
 </Text>
 </TouchableOpacity>
 );
};
