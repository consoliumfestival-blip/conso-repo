import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';

import { ui } from '@/constants/designSystem';

export type SsfSelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
  separatorBefore?: boolean;
};

type Anchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface SsfSelectMenuProps {
  value: string;
  options: SsfSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  width?: number;
  minMenuWidth?: number;
  maxMenuHeight?: number;
  compact?: boolean;
  active?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  style?: ViewStyle;
  align?: 'left' | 'center' | 'right';
}

export function SsfSelectMenu({
  value,
  options,
  onValueChange,
  placeholder = 'Select',
  accessibilityLabel,
  width,
  minMenuWidth = 190,
  maxMenuHeight = 300,
  compact = false,
  active = false,
  searchable,
  searchPlaceholder = 'Search options...',
  style,
  align = 'left',
}: SsfSelectMenuProps) {
  const anchorRef = useRef<View>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const showSearch = searchable ?? options.length > 7;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const openMenu = () => {
    anchorRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      setAnchor({ x, y, width: measuredWidth, height: measuredHeight });
      setSearchQuery('');
      setOpen(true);
    });
  };

  const estimatedMenuHeight = Math.min(
    maxMenuHeight,
    options.length * 40 + options.filter((option) => option.separatorBefore).length * 9 + (showSearch ? 58 : 12),
  );
  const menuWidth = Math.min(
    viewportWidth - 24,
    Math.max(anchor?.width ?? width ?? 0, minMenuWidth),
  );
  const menuLeft = Math.max(
    12,
    Math.min(anchor?.x ?? 12, viewportWidth - menuWidth - 12),
  );
  const roomBelow = viewportHeight - ((anchor?.y ?? 0) + (anchor?.height ?? 0));
  const openAbove = roomBelow < estimatedMenuHeight + 16 && (anchor?.y ?? 0) > estimatedMenuHeight;
  const menuTop = openAbove
    ? Math.max(12, (anchor?.y ?? 12) - estimatedMenuHeight - 5)
    : (anchor?.y ?? 12) + (anchor?.height ?? 0) + 5;

  return (
    <>
      <TouchableOpacity
        ref={anchorRef}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || placeholder}
        accessibilityState={{ expanded: open }}
        activeOpacity={0.76}
        onPress={openMenu}
        style={[
          styles.trigger,
          compact && styles.triggerCompact,
          active && styles.triggerActive,
          width ? { width } : undefined,
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerText, active && styles.triggerTextActive, align !== 'left' && { textAlign: align }]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <ChevronDown size={15} color={active ? ui.colors.primary : ui.colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          {anchor && (
            <View
              accessibilityRole="menu"
              style={[
                styles.menu,
                {
                  left: menuLeft,
                  top: menuTop,
                  width: menuWidth,
                  maxHeight: maxMenuHeight,
                },
              ]}
            >
              {showSearch && (
                <View style={styles.searchWrap}>
                  <Search size={15} color={ui.colors.textMuted} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={ui.colors.textSubtle}
                    autoFocus
                    style={styles.searchInput}
                    accessibilityLabel={searchPlaceholder}
                  />
                  {!!searchQuery && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
                      <X size={14} color={ui.colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.menuContent}
              >
                {filteredOptions.map((option) => {
                  const selected = option.value === value;
                  return (
                    <React.Fragment key={option.value}>
                      {option.separatorBefore && <View style={styles.separator} />}
                      <TouchableOpacity
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected, disabled: option.disabled }}
                        disabled={option.disabled}
                        activeOpacity={0.7}
                        onPress={() => {
                          onValueChange(option.value);
                          setOpen(false);
                        }}
                        style={[styles.item, selected && styles.itemSelected]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.itemText,
                            selected && styles.itemTextSelected,
                            option.disabled && styles.itemTextDisabled,
                            align !== 'left' && { textAlign: align },
                          ]}
                        >
                          {option.label}
                        </Text>
                        {selected && <Check size={15} color={ui.colors.primary} strokeWidth={2.5} />}
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
                {filteredOptions.length === 0 && (
                  <Text style={styles.emptyText}>No matching options</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerCompact: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: ui.colors.surfaceMuted,
  },
  triggerActive: {
    borderColor: '#99DDD3',
    backgroundColor: ui.colors.primarySoft,
  },
  triggerText: {
    flex: 1,
    color: '#334155',
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  triggerTextActive: {
    color: ui.colors.primary,
  },
  menu: {
    position: 'absolute',
    zIndex: 1000,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    overflow: 'hidden',
    shadowColor: ui.colors.text,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  menuContent: {
    paddingVertical: 5,
  },
  searchWrap: {
    height: 42,
    margin: 8,
    marginBottom: 3,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surfaceMuted,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    color: ui.colors.text,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    textAlign: 'center',
    color: ui.colors.textMuted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  item: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  itemSelected: {
    backgroundColor: ui.colors.surfaceMuted,
  },
  itemText: {
    flex: 1,
    color: ui.colors.text,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  itemTextSelected: {
    color: ui.colors.primary,
    fontFamily: 'Poppins_700Bold',
  },
  itemTextDisabled: {
    color: ui.colors.textSubtle,
  },
  separator: {
    height: 1,
    backgroundColor: ui.colors.border,
    marginVertical: 4,
  },
});
