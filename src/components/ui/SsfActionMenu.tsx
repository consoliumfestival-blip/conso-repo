import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';

import { ui } from '@/constants/designSystem';

export type SsfActionMenuItem = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
};

type Anchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function SsfActionMenu({
  items,
  accessibilityLabel = 'More actions',
  open: controlledOpen,
  onOpenChange,
}: {
  items: SsfActionMenuItem[];
  accessibilityLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const triggerRef = useRef<View>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [internalOpen, setInternalOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = controlledOpen ?? internalOpen;
  const menuWidth = Math.min(210, viewportWidth - 24);
  const estimatedHeight = Math.min(items.length * 40 + 18, 320);

  const setMenuOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const measureAndOpen = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  const openMenu = (event?: GestureResponderEvent) => {
    event?.stopPropagation();
    measureAndOpen();
  };

  useEffect(() => {
    if (controlledOpen) {
      triggerRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
      });
    }
  }, [controlledOpen]);

  const left = Math.max(
    12,
    Math.min(
      (anchor?.x ?? viewportWidth - 12) + (anchor?.width ?? 0) - menuWidth,
      viewportWidth - menuWidth - 12,
    ),
  );
  const roomBelow = viewportHeight - ((anchor?.y ?? 0) + (anchor?.height ?? 0));
  const top =
    roomBelow < estimatedHeight + 12
      ? Math.max(12, (anchor?.y ?? 12) - estimatedHeight - 5)
      : (anchor?.y ?? 12) + (anchor?.height ?? 0) + 5;

  return (
    <>
      <TouchableOpacity
        ref={triggerRef}
        onPress={openMenu}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={styles.trigger}
      >
        <MoreHorizontal size={18} color={ui.colors.text} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          {anchor ? (
            <View accessibilityRole="menu" style={[styles.menu, { left, top, width: menuWidth }]}>
              {items.map((item) => (
                <React.Fragment key={item.label}>
                  {item.separatorBefore ? <View style={styles.separator} /> : null}
                  <TouchableOpacity
                    accessibilityRole="menuitem"
                    accessibilityState={{ disabled: item.disabled }}
                    disabled={item.disabled}
                    activeOpacity={0.68}
                    onPress={() => {
                      setMenuOpen(false);
                      item.onPress();
                    }}
                    style={styles.item}
                  >
                    {item.icon ? <View style={styles.icon}>{item.icon}</View> : null}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.itemText,
                        item.destructive && styles.destructive,
                        item.disabled && styles.disabled,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
  },
  menu: {
    position: 'absolute',
    zIndex: 1000,
    paddingVertical: 5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    shadowColor: ui.colors.text,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  item: {
    minHeight: 38,
    marginHorizontal: 4,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
  },
  icon: {
    width: 26,
    alignItems: 'flex-start',
  },
  itemText: {
    flex: 1,
    color: ui.colors.text,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  destructive: {
    color: '#DC2626',
  },
  disabled: {
    color: ui.colors.textSubtle,
  },
  separator: {
    height: 1,
    marginVertical: 4,
    backgroundColor: ui.colors.border,
  },
});
