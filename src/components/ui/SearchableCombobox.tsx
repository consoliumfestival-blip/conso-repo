import { ui } from '@/constants/designSystem';
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform, LayoutChangeEvent } from 'react-native';
import { Label } from '@/components/ui/shadcn/label';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { ChevronDown, Search, X, Check } from 'lucide-react-native';

export function SearchableCombobox<T extends { id: string; name: string }>({
  label,
  placeholder,
  items,
  selectedItem,
  onSelect,
  loading,
  emptyText,
  formatSubtitle,
  renderItem,
  isOpen,
  onOpenChange,
}: {
  label: string;
  placeholder: string;
  items: T[];
  selectedItem: T | null;
  onSelect: (item: T) => void;
  loading: boolean;
  emptyText: string;
  formatSubtitle?: (item: T) => string | null;
  renderItem?: (item: T, isSelected: boolean) => React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [fieldLayout, setFieldLayout] = useState({ y: 0, height: 0, width: 0 });
  const inputRef = useRef<TextInput>(null);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item as any).chest_number?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleSelect = (item: T) => {
    onSelect(item);
    onOpenChange(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleClose = () => {
    onOpenChange(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleFieldLayout = (event: LayoutChangeEvent) => {
    const { y, height, width } = event.nativeEvent.layout;
    setFieldLayout({ y, height, width });
  };

  return (
    <View className="gap-1.5" style={{ zIndex: isOpen ? 50 : 1 }}>
      <Label>{label}</Label>
      {isOpen && Platform.OS === 'web' && (
        <TouchableOpacity
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}
          activeOpacity={1}
          onPress={handleClose}
        />
      )}
      <View
        onLayout={handleFieldLayout}
        className={`relative border rounded-md h-10 px-3 flex-row items-center bg-background ${
          isOpen ? 'border-primary' : 'border-input'
        }`}
        style={{ zIndex: isOpen ? 60 : 1 }}
      >
        <Search size={16} className="text-muted-foreground mr-2" />
        
        {selectedItem && !isOpen && query === '' ? (
          <TouchableOpacity 
            className="flex-1 h-full justify-center"
            onPress={() => {
              onOpenChange(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          >
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {selectedItem.name}
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            ref={inputRef}
            className="flex-1 text-sm text-foreground h-full"
            style={Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : undefined}
            placeholder={placeholder}
            placeholderTextColor={ui.colors.textSubtle}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (!isOpen) onOpenChange(true);
            }}
            onFocus={() => onOpenChange(true)}
          />
        )}

        {selectedItem && !isOpen ? (
          <TouchableOpacity onPress={() => onSelect(null as unknown as T)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} className="text-muted-foreground" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => {
            if (isOpen) {
              handleClose();
            } else {
              onOpenChange(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}>
            <ChevronDown size={16} className="text-muted-foreground" style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
          </TouchableOpacity>
        )}

        {isOpen && (
          <View
            className="absolute bg-background border border-border rounded-md shadow-lg overflow-hidden"
            style={{
              top: fieldLayout.height + 4,
              left: 0,
              right: 0,
              maxWidth: '100%',
              maxHeight: 320,
              elevation: 8,
              zIndex: 100, // Explicit z-index inside the dropdown to force stacking
            }}
          >
            <ScrollView
              style={{ maxHeight: 260, width: '100%' }}
              contentContainerStyle={{ width: '100%' }}
              horizontal={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator
            >
              {loading ? (
                <View className="gap-1.5 p-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-md" />
                  ))}
                </View>
              ) : filteredItems.length === 0 ? (
                <View className="items-center p-5">
                  <Text className="text-sm text-muted-foreground">
                    {query ? `${emptyText.replace('found', 'matches')} "${query}"` : emptyText}
                  </Text>
                </View>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const subtitle = formatSubtitle?.(item);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleSelect(item)}
                      activeOpacity={0.6}
                      className={`py-2.5 px-3 border-b border-border flex-row items-center justify-between ${
                        isSelected ? 'bg-accent' : 'bg-transparent'
                      }`}
                    >
                      <View className="flex-1 mr-2">
                        {renderItem ? (
                          renderItem(item, isSelected)
                        ) : (
                          <>
                            <Text
                              className={`text-sm text-foreground ${isSelected ? 'font-semibold' : 'font-normal'}`}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            {subtitle && (
                              <Text
                                className="text-[11px] text-muted-foreground mt-0.5"
                                numberOfLines={1}
                              >
                                {subtitle}
                              </Text>
                            )}
                          </>
                        )}
                      </View>
                      {isSelected && <Check size={14} className="text-primary" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>

    </View>
  );
}
