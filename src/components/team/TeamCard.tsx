import React from 'react';
import { Platform, View, ViewProps, TextProps } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';

export const Card = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => {
    const ui = useTeamUi();
    const glassStyle = Platform.OS === 'web' ? {
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    } as any : {};
    return <View
      ref={ref}
      {...props}
      style={[style, {
        ...glassStyle,
        backgroundColor: ui.colors.surfaceGlass,
        borderRadius: ui.radius.card,
        borderWidth: 1,
        borderColor: ui.colors.border,
        shadowColor: ui.colors.text,
        shadowOpacity: 0.035,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }]}
    />;
  },
);

export const CardHeader = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => <View ref={ref} {...props} style={[{ padding: 16, paddingBottom: 4 }, style]} />,
);

export const CardContent = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => <View ref={ref} {...props} style={[{ padding: 16 }, style]} />,
);

export const CardTitle = React.forwardRef<React.ElementRef<typeof TeamText>, TextProps>(
  ({ style, ...props }, ref) => {
    const ui = useTeamUi();
    return <TeamText ref={ref} {...props} style={[{ color: ui.colors.text, fontSize: 16, fontWeight: '700' }, style]} />;
  },
);

Card.displayName = 'TeamCard';
CardHeader.displayName = 'TeamCardHeader';
CardContent.displayName = 'TeamCardContent';
CardTitle.displayName = 'TeamCardTitle';
