import React from 'react';
import { View, ViewProps, TextProps, useWindowDimensions } from 'react-native';
import { TEAM_DESKTOP_MIN_WIDTH, teamUi as ui } from '@/constants/teamLeaderTheme';
import { TeamText } from './TeamText';

export const Card = React.forwardRef<React.ElementRef<typeof View>, ViewProps>(
  ({ style, ...props }, ref) => {
    const { width } = useWindowDimensions();
    return <View
      ref={ref}
      {...props}
      style={[{
        backgroundColor: ui.colors.surface,
        borderRadius: width < TEAM_DESKTOP_MIN_WIDTH ? 24 : ui.radius.xl,
        borderWidth: 1,
        borderColor: ui.colors.border,
        shadowColor: ui.colors.text,
        shadowOpacity: 0.025,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
      }, style]}
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
  ({ style, ...props }, ref) => (
    <TeamText ref={ref} {...props} style={[{ color: ui.colors.text, fontSize: 16, fontWeight: '700' }, style]} />
  ),
);

Card.displayName = 'TeamCard';
CardHeader.displayName = 'TeamCardHeader';
CardContent.displayName = 'TeamCardContent';
CardTitle.displayName = 'TeamCardTitle';
