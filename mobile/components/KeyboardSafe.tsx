import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleProp, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keeps whatever is being typed above the keyboard, on every screen and in every pop-up.
//
// The Android build draws edge-to-edge (edgeToEdgeEnabled=true), and then Android no longer shrinks the window when the keyboard opens.
// Screens that set KeyboardAvoidingView's behavior to `undefined` on Android (Chat, Profile, Careers, disputes...) were therefore simply
// covered, and 'height' is unreliable inside a Modal's separate window (see the note in LabelsScreen). On Android this pads the bottom by
// exactly the part of this area the keyboard would cover, worked out on the phone it runs on each time the keyboard opens: the real
// keyboard height (React Native reports it without the navigation bar, so the bottom inset is added back), minus how far this area
// already ends above the bottom of the screen (an app bottom bar under Chat, for instance). Nothing is fixed to one phone size.
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
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  // How far this area already ends above the bottom of the window. A pop-up fills the window (0). A screen like Chat ends above the
  // app's own bottom bar (Home / Scan / Menu), which the keyboard covers anyway; padding by the full keyboard height there left a gap
  // the height of that bar between the message box and the keyboard. The area's own frame does not change with its padding, so
  // measuring on layout is enough.
  const [roomBelow, setRoomBelow] = useState(0);
  const topInset = insets.top;
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // measureInWindow counts from below the status bar on the edge-to-edge build (a full-height screen reports y = -status bar), while
      // the window height counts from the top of the screen: add the status bar back. A pop-up filling the window comes out at 0.
      if (h > 0) setRoomBelow(Math.max(0, Math.round(windowHeight - (y + h) - topInset)));
    });
  }, [windowHeight, topInset]);
  useEffect(() => { if (keyboard > 0) measure(); }, [keyboard, measure]);
  const lift = keyboard > 0 ? Math.max(0, keyboard + insets.bottom - roomBelow) : 0;
  return <View ref={ref} onLayout={measure} style={[style, lift > 0 && { paddingBottom: lift }]}>{children}</View>;
}
