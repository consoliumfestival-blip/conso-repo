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
 primary: 'bg-button-primary',
 outline: 'border border-button-border bg-button-soft',
 ghost: 'bg-transparent',
 };

 const sizeClasses = {
 sm: 'h-9 px-4',
 md: 'h-11 px-5',
 lg: 'h-13 px-7',
 };

 const textVariantClasses = {
 primary: 'text-button-foreground',
 outline: 'text-ui-text',
 ghost: 'text-button-text',
 };

 const textSizeClasses = {
 sm: 'text-sm',
 md: 'text-base',
 lg: 'text-lg',
 };

 const isDisabled = disabled || isLoading;
 const destructiveOverride = /bg-(?:core-danger|red-|destructive)/.test(className);
 const foreground = destructiveOverride ? ui.colors.onPrimary : ui.colors.buttonForeground;

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
 <ActivityIndicator color={variant === 'primary' ? foreground : ui.colors.buttonText} className="mr-2" />
 ) : icon ? (
 <View className="mr-2">{variant === 'primary' && React.isValidElement<{ color?: string }>(icon) ? React.cloneElement(icon, { color: foreground }) : icon}</View>
 ) : null}
 <Text className={`font-poppins-bold ${destructiveOverride && variant === 'primary' ? 'text-core-on-primary-white' : textVariantClasses[variant]} ${textSizeClasses[size]}`}>
 {label}
 </Text>
 </TouchableOpacity>
 );
};
