import React, { useState } from 'react';
import { Pressable, Text, View, TextInput, StyleProp, ViewStyle, TextStyle, TextInputProps } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen, Check, CheckCheck, ChevronDown, Gift, Heart, HeartHandshake, Home, Leaf, MapPin, Menu, MessageCircle, Moon, Plus, Repeat2, Search, Send, Settings, ShieldCheck, SlidersHorizontal, Sun, User, Users, X, Wifi, Plug, VolumeX, Flag, LogOut, ImagePlus, RefreshCw, Map, Lock, Trash2, Pencil, Mic, Play, Pause } from 'lucide-react-native';
import { useApp } from '../store';
const icons = { mic: Mic, play: Play, pause: Pause, home: Home, search: Search, plus: Plus, messages: MessageCircle, user: User, heart: Heart, leaf: Leaf, pin: MapPin, arrow: ArrowRight, external: ArrowUpRight, back: ArrowLeft, chevron: ChevronDown, bell: Bell, repeat: Repeat2, 'heart-handshake': HeartHandshake, 'book-open': BookOpen, gift: Gift, users: Users, shield: ShieldCheck, moon: Moon, sun: Sun, settings: Settings, x: X, check: Check, checks: CheckCheck, send: Send, wifi: Wifi, plug: Plug, quiet: VolumeX, flag: Flag, logout: LogOut, image: ImagePlus, refresh: RefreshCw, map: Map, lock: Lock, trash: Trash2, edit: Pencil, filter: SlidersHorizontal, menu: Menu };
export type IconName = keyof typeof icons;
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useApp(); const Component = icons[name]; return <Component size={size} color={color || colors.text} strokeWidth={1.7} />;
}
export function Txt({ children, size = 14, bold, color, style, lines }: { children: React.ReactNode; size?: number; bold?: boolean; color?: string; style?: StyleProp<TextStyle>; lines?: number }) {
  const { colors } = useApp();
  return <Text numberOfLines={lines} style={[{ color: color || colors.text, fontSize: size, fontWeight: bold ? '700' : '400', lineHeight: size * 1.45 }, style]}>{children}</Text>;
}
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>; }
export function Button({ children, onPress, icon, secondary, disabled, loading, small, danger, style }: { children: React.ReactNode; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean; loading?: boolean; small?: boolean; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp(); const ink = danger ? colors.danger : secondary ? colors.text : '#FFFFFF';
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [{ minHeight: small ? 38 : 48, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 20, borderRadius: 12, backgroundColor: secondary ? colors.soft : danger ? colors.soft : '#393185', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', opacity: disabled || loading ? .5 : pressed ? .75 : 1 }, style]}>
    {loading ? <ActivityIndicator size={18} color={ink} /> : icon ? <Icon name={icon} size={small ? 16 : 19} color={ink} /> : null}
    <Txt color={ink} bold size={small ? 12 : 14}>{children}</Txt>
  </Pressable>;
}
export function IconButton({ name, label, onPress, active }: { name: IconName; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.soft : colors.surface, opacity: pressed ? .6 : 1, borderWidth: 1, borderColor: colors.line })}><Icon name={name} color={active ? colors.primary : colors.muted} /></Pressable>;
}
export function Chip({ children, active, onPress, icon }: { children: React.ReactNode; active?: boolean; onPress: () => void; icon?: IconName }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} style={{ borderWidth: 1, borderColor: active ? colors.primary : colors.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: active ? colors.soft : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
    {icon && <Icon name={icon} size={16} color={active ? colors.primary : colors.muted} />}<Txt size={12} bold={active} color={active ? colors.primary : colors.muted}>{children}</Txt>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return <View style={{ gap: 7, flexGrow: 1 }}><Txt bold size={13}>{label}</Txt><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[{ minHeight: 48, color: colors.text, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, ...(props.multiline ? { minHeight: 112, textAlignVertical: 'top' as const } : {}) }, props.style]} /></View>;
}
export function Notice({ children, error }: { children: React.ReactNode; error?: boolean }) {
  const { colors } = useApp();
  return <View accessibilityRole={error ? 'alert' : undefined} style={{ padding: 14, borderRadius: 12, backgroundColor: error ? '#FCECEC' : colors.soft, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}><Icon name={error ? 'flag' : 'shield'} size={18} color={error ? '#A33E3E' : colors.primary} /><Txt size={12} color={error ? '#A33E3E' : colors.text} style={{ flex: 1 }}>{children}</Txt></View>;
}
export function Empty({ title, subtitle, icon = 'leaf', children }: { title: string; subtitle?: string; icon?: IconName; children?: React.ReactNode }) {
  const { colors } = useApp();
  return <View style={{ padding: 32, alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 20 }}><View style={{ padding: 20, backgroundColor: colors.soft, borderRadius: 50 }}><Icon name={icon} size={32} color={colors.primary} /></View><Txt bold size={21} style={{ textAlign: 'center' }}>{title}</Txt>{subtitle && <Txt color={colors.muted} style={{ maxWidth: 420, textAlign: 'center' }}>{subtitle}</Txt>}{children}</View>;
}
export function useAction() {
  const { setError } = useApp(); const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setError('');
    setBusy(true);
    try { await action(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return { busy, run };
}
