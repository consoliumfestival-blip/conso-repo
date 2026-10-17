import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { ui } from '@/constants/designSystem';

interface SsfInputProps extends TextInputProps {
  label?: string;
  error?: string;
  showToggle?: boolean; // enable show/hide for password fields
}

export const SsfInput: React.FC<SsfInputProps> = ({
  label,
  error,
  className = '',
  showToggle = false,
  secureTextEntry,
  ...props
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <View className={`mb-5 ${className}`}>
      {label && (
        <Text className="text-ui-text font-poppins-bold text-xs mb-2">
          {label}
        </Text>
      )}
      <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          className={`flex-1 bg-white border ${
            error ? 'border-red-500' : 'border-ui-border'
          } rounded-xl px-4 text-ui-text font-poppins`}
          style={{ paddingRight: showToggle ? 48 : 16, minHeight: 46 }}
          placeholderTextColor={ui.colors.textSubtle}
          secureTextEntry={showToggle ? !visible : secureTextEntry}
          {...props}
        />
        {showToggle && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            style={{
              position: 'absolute',
              right: 14,
              padding: 4,
            }}
          >
            {visible ? (
              <EyeOff size={19} color={ui.colors.textMuted} />
            ) : (
              <Eye size={19} color={ui.colors.textMuted} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text className="text-red-600 font-poppins text-xs mt-1.5">{error}</Text>
      )}
    </View>
  );
};
