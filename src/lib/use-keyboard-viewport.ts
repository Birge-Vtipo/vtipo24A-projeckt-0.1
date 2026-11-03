import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutChangeEvent, Platform, TextInput } from 'react-native';

/** Follow both IME events and Android's resized root layout. */
export function useKeyboardViewport() {
  const [visible, setVisible] = useState(() => Platform.OS !== 'web' && Keyboard.isVisible());
  const frame = useRef({ width: 0, fullHeight: 0 });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    if (Platform.OS !== 'android') return;
    const { width, height } = event.nativeEvent.layout;
    // Retain the keyboard-free height: older Android can resize without a keyboard event.
    if (Math.abs(width - frame.current.width) > 1) frame.current = { width, fullHeight: height };
    else frame.current.fullHeight = Math.max(frame.current.fullHeight, height);
    const resized = frame.current.fullHeight - height > 100;
    if (resized && TextInput.State.currentlyFocusedInput()) setVisible(true);
    else if (!resized && !Keyboard.isVisible()) setVisible(false);
  }, []);

  return { visible, onLayout };
}
