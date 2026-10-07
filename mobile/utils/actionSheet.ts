import { ActionSheetIOS, Alert, type AlertButton, Platform } from 'react-native';

// A choice menu ("Take photo / Choose from library / Cancel", "5 / 10 / 15 minutes"). On iPhone it is the native action sheet
// that slides up from the bottom; on Android it stays the dialog it was. Same arguments as Alert.alert, so a call site only swaps
// the function name.
export function showActionSheet(title: string | undefined, message: string | undefined, buttons: AlertButton[]) {
  if (Platform.OS !== 'ios') {
    Alert.alert(title ?? '', message, buttons);
    return;
  }
  const cancelButtonIndex = buttons.findIndex((b) => b.style === 'cancel');
  const destructiveButtonIndex = buttons.map((b, i) => (b.style === 'destructive' ? i : -1)).filter((i) => i >= 0);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options: buttons.map((b) => b.text ?? ''),
      cancelButtonIndex: cancelButtonIndex >= 0 ? cancelButtonIndex : undefined,
      destructiveButtonIndex: destructiveButtonIndex.length ? destructiveButtonIndex : undefined,
    },
    (index) => buttons[index]?.onPress?.(),
  );
}
