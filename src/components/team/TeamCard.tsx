import React from 'react';
import { View, ViewProps, TextProps } from 'react-native';
import { ui } from '@/constants/designSystem';
import { TeamText } from './TeamText';

export const Card = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => (
    <View
      ref={ref}
      {...props}
      style={[{
        backgroundColor: ui.colors.surface,
        borderRadius: ui.radius.xl,
        borderWidth: 1,
        borderColor: ui.colors.border,
        shadowColor: ui.colors.text,
        shadowOpacity: 0.025,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
      }, style]}
    />
  ),
);

export const CardHeader = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => <View ref={ref} {...props} style={[{ padding: 16, paddingBottom: 4 }, style]} />,
);

export const CardContent = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => <View ref={ref} {...props} style={[{ padding: 16 }, style]} />,
);

export const CardTitle = React.forwardRef<React.ElementRef<typeof TeamText>, TextProps>(
  ({ style, ...props }, ref) => (
    <TeamText ref={ref} {...props} style={[{ color: ui.colors.text, fontSize: 16, fontWeight: '700' }, style]} />
  ),
);

Card.displayName = 'TeamCard';
CardHeader.displayName = 'TeamCardHeader';
CardContent.displayName = 'TeamCardContent';
CardTitle.displayName = 'TeamCardTitle';
