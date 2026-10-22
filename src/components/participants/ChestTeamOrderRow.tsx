import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react-native';
import { SsfCard } from '../ui/SsfCard';
import { ui } from '../../constants/designSystem';
import type { ChestTeam } from '../../services/chestNumberService';

type Props = {
  team: ChestTeam; index: number; count: number; range: number; slot: number;
  disabled: boolean; dragging: boolean; dropTarget: boolean; offset: number;
  onLayout: (id: string, y: number, height: number) => void;
  onDrag: (id: string, dy: number, phase: 'start' | 'move' | 'end' | 'cancel') => void;
  onMove: (from: number, to: number) => void;
};

export function ChestTeamOrderRow(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onMoveShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: () => latest.current.onDrag(latest.current.team.id, 0, 'start'),
    onPanResponderMove: (_, gesture) => latest.current.onDrag(latest.current.team.id, gesture.dy, 'move'),
    onPanResponderRelease: (_, gesture) => latest.current.onDrag(latest.current.team.id, gesture.dy, 'end'),
    onPanResponderTerminate: () => latest.current.onDrag(latest.current.team.id, 0, 'cancel'),
    onPanResponderTerminationRequest: () => false,
  }), []);
  const { team, index, count, range, slot, disabled, dragging, dropTarget, offset, onLayout, onMove } = props;
  const dragHandleStyle: ViewStyle & Pick<React.CSSProperties, 'touchAction'> = {
    width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.3 : 1,
    ...(Platform.OS === 'web' ? { touchAction: 'none' as const } : {}),
  };
  return (
    <View onLayout={event => { const { y, height } = event.nativeEvent.layout; onLayout(team.id, y, height); }}
      style={{ zIndex: dragging ? 10 : 0, transform: [{ translateY: dragging ? offset : 0 }], opacity: dropTarget && !dragging ? 0.6 : 1 }}>
      <SsfCard className={`mb-3 ${dragging ? 'border-ssf-primary' : ''}`}>
        <View className="flex-row items-center gap-2">
          <View {...responder.panHandlers} accessibilityLabel={`Drag ${team.name} to reorder`}
            style={dragHandleStyle}>
            <GripVertical size={20} color={ui.colors.textMuted} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="font-poppins-bold text-ssf-text">{index + 1}. {team.name}</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted">{team.total} participants · {team.numeric}/{team.total} numbered</Text>
            <Text className="font-poppins-semibold text-xs text-ssf-primary mt-1">{slot * range}–{(slot + 1) * range - 1}</Text>
          </View>
          <View className="flex-row gap-1">
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${team.name} up`}
              disabled={disabled || index === 0} onPress={() => onMove(index, index - 1)} hitSlop={2}
              className={`w-10 h-10 items-center justify-center rounded-lg border border-ssf-border ${disabled || index === 0 ? 'opacity-30' : ''}`}>
              <ArrowUp size={18} color={ui.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${team.name} down`}
              disabled={disabled || index === count - 1} onPress={() => onMove(index, index + 1)} hitSlop={2}
              className={`w-10 h-10 items-center justify-center rounded-lg border border-ssf-border ${disabled || index === count - 1 ? 'opacity-30' : ''}`}>
              <ArrowDown size={18} color={ui.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </SsfCard>
    </View>
  );
}
