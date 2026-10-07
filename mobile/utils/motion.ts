import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Reduce Motion (iPhone: Settings > Accessibility > Motion; Android: Remove animations). Animations that slide, scale or pulse
// check this and simply appear instead.
let current = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { current = v; }).catch(() => {});

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(current);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { current = v; if (alive) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { current = v; setReduce(v); });
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}
