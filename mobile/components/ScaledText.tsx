import type { ComponentPropsWithRef } from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';

// Text that follows the phone's text size (iPhone Dynamic Type, Android font size) up to a limit, so people who need bigger
// text get it and no layout breaks at the largest accessibility sizes. 1.35 is iPhone's largest standard size (xxxLarge);
// a screen can pass a lower maxFontSizeMultiplier for tight spots (badges, tab labels).
export const MAX_FONT_SCALE = 1.35;

export function Text(props: ComponentPropsWithRef<typeof RNText>) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
export type Text = RNText;

export function TextInput(props: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
export type TextInput = RNTextInput;
