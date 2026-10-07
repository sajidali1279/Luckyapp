import type { ComponentProps } from 'react';
import { RefreshControl as RNRefreshControl } from 'react-native';
import { COLORS } from '../constants';
import { haptic } from '../utils/haptics';

// Pull to refresh with a light tap when it starts (as iPhone apps do), and the Android spinner colors set (without `colors`,
// Android's spinner can crash when the screen unmounts; see the USB testing notes).
export default function RefreshControl(props: ComponentProps<typeof RNRefreshControl>) {
  const { onRefresh, colors, ...rest } = props;
  return (
    <RNRefreshControl
      colors={colors ?? [COLORS.primary]}
      {...rest}
      onRefresh={onRefresh ? () => { haptic.tap(); onRefresh(); } : undefined}
    />
  );
}
