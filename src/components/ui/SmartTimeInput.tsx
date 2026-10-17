import React, { useState, useEffect } from 'react';
import { TextInput, View, Platform, StyleSheet } from 'react-native';

interface SmartTimeInputProps {
  value: string; // HH:mm format
  onChange: (val: string) => void;
  fullWidth?: boolean;
}

export function SmartTimeInput({ value, onChange, fullWidth = false }: SmartTimeInputProps) {
  const [inputValue, setInputValue] = useState('');

  // Convert HH:mm to hh:mm AM/PM for display
  const formatForDisplay = (time24: string) => {
    if (!time24) return '';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return '';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
  };

  useEffect(() => {
    setInputValue(formatForDisplay(value));
  }, [value]);

  const handleBlur = () => {
    const val = inputValue.trim().toLowerCase();
    if (!val) {
      setInputValue(formatForDisplay(value)); // revert to current if empty
      return;
    }

    // Clean up string: keep only numbers, 'a', 'p', 'm'
    const clean = val.replace(/[^0-9amp]/g, '');
    const match = clean.match(/^(\d{1,2})(\d{2})?(a|p)?m?$/);

    if (!match) {
      setInputValue(formatForDisplay(value)); // invalid input, revert
      return;
    }

    let h = parseInt(match[1], 10);
    let m = parseInt(match[2] || '0', 10);
    const isPm = match[3] === 'p';
    const isAm = match[3] === 'a';

    if (h > 24 || m > 59) {
      setInputValue(formatForDisplay(value));
      return;
    }

    if (h > 12) {
      // 24-hour time assumed
    } else if (isPm && h < 12) {
      h += 12;
    } else if (isAm && h === 12) {
      h = 0;
    } else if (!isPm && !isAm && h < 12) {
      // If 1-11 and no am/pm specified, assume AM for 1-6 (early morning usually?), 
      // but usually 8,9,10,11 is AM. Let's just default to AM if < 12, unless it's 12 (PM).
      // Wait, 1, 2, 3 without ampm usually means 1PM, 2PM, 3PM in schedule context, 
      // but 10, 11 means 10AM, 11AM.
      // Let's strictly default 1..6 to PM, 7..11 to AM.
      if (h >= 1 && h <= 7) h += 12; // 1 -> 13 (1 PM)
    }

    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const newTime24 = `${hh}:${mm}`;

    setInputValue(formatForDisplay(newTime24));
    onChange(newTime24);
  };

  return (
    <View style={[{ flex: fullWidth ? undefined : 1.5, width: fullWidth ? '100%' : undefined }]}>
      <TextInput
        style={styles.input}
        value={inputValue}
        onChangeText={setInputValue}
        onBlur={handleBlur}
        placeholder="e.g. 1000am, 230p"
        placeholderTextColor="#9ca3af"
        keyboardType={Platform.OS === 'ios' || Platform.OS === 'android' ? 'default' : 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' } as any),
  },
});
