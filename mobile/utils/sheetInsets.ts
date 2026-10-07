import { Platform, StatusBar } from 'react-native';

// A pageSheet pop-up on iPhone already opens below the status bar and the Dynamic Island, so its header needs only a small gap
// (a fixed 52 left a tall empty band on every iPhone). On Android the same pop-up is full screen and its header must clear the
// status bar.
export const SHEET_HEADER_TOP = Platform.OS === 'ios' ? 18 : (StatusBar.currentHeight ?? 24) + 16;
