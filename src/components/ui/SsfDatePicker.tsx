import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
  PanResponder,
  Platform,
} from 'react-native';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { ui } from '@/constants/designSystem';

export interface SsfDatePickerProps {
  value: string; // YYYY-MM-DD
  onValueChange: (value: string) => void;
  placeholder?: string;
  width?: number;
  style?: ViewStyle;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
type SelectorMode = 'month' | 'year' | null;

export function SsfDatePicker({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  width,
  style,
}: SsfDatePickerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [selectorMode, setSelectorMode] = useState<SelectorMode>(null);
  
  const anchorRef = useRef<View>(null);
  const yearPickerRef = useRef<ScrollView>(null);
  const [menuTop, setMenuTop] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0);

  // Parse initial value or use today
  const initialDate = useMemo(() => {
    if (!value) return new Date();
    const parts = value.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date();
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const yearOptions = useMemo(() => {
    const latestYear = new Date().getFullYear() + 20;
    return Array.from({ length: latestYear - 1799 }, (_, index) => latestYear - index);
  }, []);

  useEffect(() => {
    if (open) {
      setCurrentMonth(initialDate.getMonth());
      setCurrentYear(initialDate.getFullYear());
      setSelectorMode(null);
      
      anchorRef.current?.measureInWindow((x, y, w, h) => {
        let top = y + h + 8;
        let left = x;
        const menuWidth = 320;
        const menuHeight = 360;

        if (top + menuHeight > screenHeight) {
          top = y - menuHeight - 8;
        }
        if (left + menuWidth > screenWidth) {
          left = screenWidth - menuWidth - 16;
        }
        
        setMenuTop(Math.max(16, top));
        setMenuLeft(Math.max(16, left));
      });
    }
  }, [open, initialDate, screenWidth, screenHeight]);

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const changeMonth = (delta: number) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const openYearSelector = () => {
    setSelectorMode('year');
    const selectedYearIndex = yearOptions.indexOf(currentYear);
    requestAnimationFrame(() => {
      yearPickerRef.current?.scrollTo({
        y: Math.max(0, Math.floor(selectedYearIndex / 4) * 36 - 72),
        animated: false,
      });
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          changeMonth(-1); // Swipe Right -> Prev
        } else if (gestureState.dx < -50) {
          changeMonth(1); // Swipe Left -> Next
        }
      },
    })
  ).current;

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const selectedDate = value ? initialDate : null;

  const grid = [];
  let dayCounter = 1;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < firstDay) {
        week.push(null);
      } else if (dayCounter > daysInMonth) {
        week.push(null);
      } else {
        week.push(dayCounter);
        dayCounter++;
      }
    }
    grid.push(week);
    if (dayCounter > daysInMonth) break;
  }

  const handleSelectDate = (day: number) => {
    const yyyy = currentYear;
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onValueChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  // Check if a day is today
  const today = new Date();
  const isToday = (day: number) => {
    return today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  };

  // Check if a day is selected
  const isSelected = (day: number) => {
    return selectedDate?.getDate() === day && selectedDate?.getMonth() === currentMonth && selectedDate?.getFullYear() === currentYear;
  };

  // Display value formatting (e.g. "Oct 12, 2026")
  const displayValue = useMemo(() => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [value]);

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={() => setOpen(true)}
        style={[styles.trigger, width ? { width } : {}, style]}
      >
        <Text style={[styles.triggerText, !value && styles.placeholderText]}>
          {value ? displayValue : placeholder}
        </Text>
        <CalendarIcon size={16} color={ui.colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.popover,
              Platform.OS === 'web' ? { top: menuTop, left: menuLeft } : styles.mobilePopover
            ]}
          >
            <View style={styles.header}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => changeMonth(-1)}
                style={styles.navButton}
              >
                <ChevronLeft size={20} color={ui.colors.text} />
              </TouchableOpacity>
              <View style={styles.headerSelectors}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Select month, currently ${MONTHS[currentMonth]}`}
                  onPress={() => setSelectorMode(selectorMode === 'month' ? null : 'month')}
                  style={[styles.headerSelector, selectorMode === 'month' && styles.headerSelectorActive]}
                >
                  <Text style={styles.headerSelectorText}>{MONTHS[currentMonth]}</Text>
                  <ChevronDown size={14} color={ui.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Select year, currently ${currentYear}`}
                  onPress={openYearSelector}
                  style={[styles.headerSelector, selectorMode === 'year' && styles.headerSelectorActive]}
                >
                  <Text style={styles.headerSelectorText}>{currentYear}</Text>
                  <ChevronDown size={14} color={ui.colors.textMuted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => changeMonth(1)}
                style={styles.navButton}
              >
                <ChevronRight size={20} color={ui.colors.text} />
              </TouchableOpacity>
            </View>

            {selectorMode === 'month' ? (
              <View style={styles.selectorPanel}>
                <Text style={styles.selectorLabel}>Select month</Text>
                <View style={styles.selectionGrid}>
                  {MONTHS.map((month, index) => {
                    const selected = currentMonth === index;
                    return (
                      <TouchableOpacity
                        key={month}
                        accessibilityRole="button"
                        accessibilityLabel={month}
                        style={[styles.selectorCell, selected && styles.selectorCellSelected]}
                        onPress={() => {
                          setCurrentMonth(index);
                          setSelectorMode(null);
                        }}
                      >
                        <Text style={[styles.selectorCellText, selected && styles.selectorCellTextSelected]}>
                          {month.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : selectorMode === 'year' ? (
              <View style={styles.selectorPanel}>
                <Text style={styles.selectorLabel}>Select year</Text>
                <ScrollView
                  ref={yearPickerRef}
                  style={styles.yearPickerScroll}
                  contentContainerStyle={styles.yearPickerGrid}
                  showsVerticalScrollIndicator
                >
                  {yearOptions.map((year) => {
                    const selected = currentYear === year;
                    return (
                      <TouchableOpacity
                        key={year}
                        accessibilityRole="button"
                        accessibilityLabel={String(year)}
                        style={[styles.selectorCell, styles.yearCell, selected && styles.selectorCellSelected]}
                        onPress={() => {
                          setCurrentYear(year);
                          setSelectorMode(null);
                        }}
                      >
                        <Text style={[styles.selectorCellText, selected && styles.selectorCellTextSelected]}>
                          {year}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.calendarBody} {...panResponder.panHandlers}>
                <View style={styles.weekRow}>
                  {DAYS.map((d, i) => (
                    <Text key={i} style={styles.dayLabel}>{d}</Text>
                  ))}
                </View>

                {grid.map((week, rIndex) => (
                  <View key={rIndex} style={styles.weekRow}>
                    {week.map((day, cIndex) => {
                      if (!day) return <View key={cIndex} style={styles.dayCell} />;

                      const selected = isSelected(day);
                      const currentToday = isToday(day);

                      return (
                        <TouchableOpacity
                          key={cIndex}
                          style={[
                            styles.dayCell,
                            selected && styles.dayCellSelected,
                            currentToday && !selected && styles.dayCellToday
                          ]}
                          onPress={() => handleSelectDate(day)}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              selected && styles.dayTextSelected,
                              currentToday && !selected && styles.dayTextToday
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerText: {
    flex: 1,
    color: '#334155',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  placeholderText: {
    color: ui.colors.textSubtle,
  },
  mobilePopover: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -160 }, { translateY: -180 }],
  },
  popover: {
    position: 'absolute',
    width: 320,
    backgroundColor: ui.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    padding: 16,
    shadowColor: ui.shadow.shadowColor,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerSelectors: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  headerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerSelectorActive: {
    backgroundColor: ui.colors.surfaceMuted,
  },
  headerSelectorText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: ui.colors.text,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
  },
  calendarBody: {
    flexDirection: 'column',
  },
  selectorPanel: {
    paddingTop: 2,
  },
  selectorLabel: {
    marginBottom: 8,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  selectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearPickerScroll: {
    maxHeight: 240,
  },
  yearPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  selectorCell: {
    width: '25%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  yearCell: {
    height: 36,
  },
  selectorCellSelected: {
    backgroundColor: ui.colors.primary,
  },
  selectorCellText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: ui.colors.text,
  },
  selectorCellTextSelected: {
    color: ui.colors.surface,
    fontFamily: 'Poppins_700Bold',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayLabel: {
    width: 36,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  dayCell: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  dayCellSelected: {
    backgroundColor: ui.colors.primary,
  },
  dayCellToday: {
    backgroundColor: ui.colors.surfaceMuted,
  },
  dayText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: ui.colors.text,
  },
  dayTextSelected: {
    color: ui.colors.surface,
    fontFamily: 'Poppins_700Bold',
  },
  dayTextToday: {
    color: ui.colors.primary,
    fontFamily: 'Poppins_700Bold',
  },
});
