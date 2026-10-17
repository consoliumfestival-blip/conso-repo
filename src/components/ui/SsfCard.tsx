import { ui } from '@/constants/designSystem';
import React, { createContext, useContext } from 'react';
import { View, ViewProps } from 'react-native';

type SsfCardProps = ViewProps & {
  variant?: 'section' | 'flat';
};

const CardDepthContext = createContext(0);

export const SsfCard: React.FC<SsfCardProps> = ({
  className = '',
  children,
  style,
  variant,
  ...props
}) => {
  const depth = useContext(CardDepthContext);
  const isFlat = variant === 'flat' || (variant !== 'section' && depth > 0);

  return (
    <CardDepthContext.Provider value={depth + 1}>
      <View
        className={
          isFlat
            ? `bg-transparent rounded-none border-0 border-b border-ui-border px-0 py-3 ${className}`
            : `bg-ui-surface rounded-xl border border-ui-border p-4 ${className}`
        }
        style={[
          isFlat
            ? { shadowOpacity: 0, elevation: 0 }
            : {
                shadowColor: ui.colors.text,
                shadowOpacity: 0.025,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 1,
              },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    </CardDepthContext.Provider>
  );
};
