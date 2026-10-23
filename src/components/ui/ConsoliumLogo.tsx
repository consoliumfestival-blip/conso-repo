import React from 'react';
import { Image, View, type ViewStyle } from 'react-native';

type ConsoliumLogoProps = {
  size?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function ConsoliumLogo({ size = 36, borderRadius, style }: ConsoliumLogoProps) {
  const radius = borderRadius ?? Math.round(size * 0.22);

  return (
    <View
      accessibilityLabel="Consolium logo"
      accessible
      style={[{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }, style]}
    >
      <Image
        source={require('../../assets/images/icon.png')}
        resizeMode="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
