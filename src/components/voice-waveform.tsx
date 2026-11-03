import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

export type VoiceWaveformProps = {
  levels?: number[];
  progress?: number;
  color?: string;
  mutedColor?: string;
  height?: number;
  onSeek?: (fraction: number) => void;
  accessibilityLabel?: string;
};

const clamp = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Levels come from the recorder. Older recordings use an even, neutral timeline. */
export function VoiceWaveform({
  levels, progress = 0, color = '#393185', mutedColor = '#C9C2DD', height = 34,
  onSeek, accessibilityLabel = 'Аудио барысы / Позиция аудио',
}: VoiceWaveformProps) {
  const [width, setWidth] = useState(160);
  const fraction = clamp(progress);
  const samples = levels?.slice(0, 64).map(clamp) || [];
  const count = Math.max(8, Math.min(64, Math.floor(width / 5)));
  const bars = Array.from({ length: count }, (_, index) => {
    if (!samples.length) return 0;
    const start = Math.floor(index * samples.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / count));
    return Math.max(...samples.slice(start, end));
  });
  const visual = <View pointerEvents="none" style={{ height, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    {bars.map((level, index) => <View key={index} style={{
      flex: 1, minWidth: 1, maxWidth: 4, borderRadius: 3,
      height: samples.length ? Math.max(4, level * (height - 4)) : 5,
      backgroundColor: (index + .5) / count <= fraction ? color : mutedColor,
    }} />)}
    {onSeek && <View style={{ position: 'absolute', left: Math.max(0, Math.min(width - 6, fraction * width - 3)), bottom: 0, height: 5, width: 5, borderRadius: 3, backgroundColor: color }} />}
  </View>;

  if (!onSeek) return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', justifyContent: 'center', minHeight: height }}>{visual}</View>;
  return <Pressable
    accessibilityRole="adjustable"
    accessibilityLabel={accessibilityLabel}
    accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100), text: `${Math.round(fraction * 100)}%` }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => onSeek(clamp(fraction + (event.nativeEvent.actionName === 'increment' ? .05 : -.05)))}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}
    onPress={event => onSeek(clamp(event.nativeEvent.locationX / Math.max(1, width)))}
    style={({ pressed }) => ({ width: '100%', minHeight: Math.max(44, height), justifyContent: 'center', opacity: pressed ? .75 : 1 })}
  >{visual}</Pressable>;
}
