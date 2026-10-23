import React from 'react';
import { ActivityIndicator, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { teamUi as ui } from '@/constants/teamLeaderTheme';
import { TeamText } from './TeamText';

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
type Size = 'default' | 'sm' | 'lg' | 'icon';

interface TeamButtonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export const Button = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, TeamButtonProps>(
  ({ variant = 'default', size = 'default', children, onPress, disabled, loading, style, className }, ref) => {
    const primary = variant === 'default';
    const destructive = variant === 'destructive';
    const buttonStyle: ViewStyle = {
      minHeight: size === 'sm' ? 36 : size === 'lg' ? 52 : 44,
      minWidth: size === 'icon' ? 44 : undefined,
      paddingHorizontal: size === 'sm' ? 16 : size === 'lg' ? 28 : 20,
      borderRadius: ui.radius.xl,
      borderWidth: primary || variant === 'ghost' || variant === 'link' ? 0 : 1,
      borderColor: destructive ? ui.colors.borderStrong : ui.colors.border,
      backgroundColor: primary ? ui.colors.primary
        : destructive ? ui.colors.dangerSoft
          : variant === 'ghost' || variant === 'link' ? 'transparent' : ui.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      opacity: disabled || loading ? 0.5 : 1,
    };
    const textStyle: TextStyle = {
      color: primary ? ui.colors.onPrimary : destructive ? ui.colors.danger
        : variant === 'outline' || variant === 'secondary' ? ui.colors.text : ui.colors.primary,
      fontSize: size === 'sm' ? 14 : size === 'lg' ? 18 : 16,
      fontWeight: '700',
      textAlign: 'center',
    };
    const label = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
    return (
      <TouchableOpacity ref={ref} onPress={onPress} disabled={disabled || loading} accessibilityRole="button" className={className}
        accessibilityLabel={label} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} style={[buttonStyle, style]}>
        {loading ? <ActivityIndicator color={primary ? ui.colors.onPrimary : ui.colors.primary} style={{ marginRight: 8 }} /> : null}
        {label !== undefined ? <TeamText style={textStyle}>{label}</TeamText> : children}
      </TouchableOpacity>
    );
  },
);

Button.displayName = 'TeamButton';
