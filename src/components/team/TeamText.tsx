import React from 'react';
import { StyleSheet, Text as NativeText, TextProps } from 'react-native';

/** Use the same Poppins weights as the admin shell for Team Leader copy. */
export const TeamText = React.forwardRef<React.ElementRef<typeof NativeText>, TextProps>(
  ({ style, ...props }, ref) => {
    const resolved = StyleSheet.flatten(style) || {};
    const weight = String(resolved.fontWeight || '400');
    const fontFamily = resolved.fontFamily || (
      Number(weight) >= 800 ? 'Poppins_800ExtraBold'
        : Number(weight) >= 700 ? 'Poppins_700Bold'
          : Number(weight) >= 600 ? 'Poppins_600SemiBold'
            : Number(weight) >= 500 ? 'Poppins_500Medium'
              : 'Poppins_400Regular'
    );
    return <NativeText ref={ref} {...props} style={[{ fontFamily }, style]} />;
  },
);

TeamText.displayName = 'TeamText';
