import { ReactNode, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keeps whatever is being typed above the keyboard, on every screen and in every pop-up.
//
// The Android build draws edge-to-edge (edgeToEdgeEnabled=true), and then Android no longer shrinks the window when the keyboard opens.
// Screens that set KeyboardAvoidingView's behavior to `undefined` on Android (Chat, Profile, Careers, disputes...) were therefore simply
// covered, and 'height' is unreliable inside a Modal's separate window (see the note in LabelsScreen). On Android this pads the bottom by
// the real keyboard height instead, which works the same in a screen and in a Modal. React Native reports that height without the
// navigation bar, so the bottom safe-area inset is added: at worst a small gap above the keyboard, never a hidden field.
// iOS keeps KeyboardAvoidingView with 'padding', which already works there.

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

interface Props {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** iOS only: the height of anything above this view that the keyboard maths should skip (a header outside it). */
  iosOffset?: number;
}

export default function KeyboardSafe({ style, children, iosOffset = 0 }: Props) {
  if (Platform.OS === 'ios') {
    return <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={iosOffset} style={style}>{children}</KeyboardAvoidingView>;
  }
  return <AndroidKeyboardSafe style={style}>{children}</AndroidKeyboardSafe>;
}

function AndroidKeyboardSafe({ style, children }: Props) {
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  return <View style={[style, keyboard > 0 && { paddingBottom: keyboard + insets.bottom }]}>{children}</View>;
}
