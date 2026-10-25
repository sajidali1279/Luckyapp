// Halloween's version of the drifting shapes behind the dashboards (components/DashboardWatermark.tsx swaps to this while the theme is on):
// a bat that flaps across, a ghost that bobs, a spider hanging from its thread, a skull, a pumpkin and the moon.
import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CREATURES, COLORS_HALLOWEEN as C, type Creature } from './art';

function Shape({ name, size, color }: { name: Creature; size: number; color: string }) {
  const c = CREATURES[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={c.fill} fill={color} fillRule="evenodd" />
      {c.line ? <Path d={c.line} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </Svg>
  );
}

/** One value that runs 0 to 1 and back, forever, slowly. */
function useSwing(ms: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), delay, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, ms, delay]);
  return v;
}

const Bobber = memo(function Bobber({ name, size, color, pos, ms, lift = 12, tilt = 4 }: { name: Creature; size: number; color: string; pos: ViewStyle; ms: number; lift?: number; tilt?: number }) {
  const v = useSwing(ms);
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [-lift, lift] });
  const r = v.interpolate({ inputRange: [0, 1], outputRange: [`-${tilt}deg`, `${tilt}deg`] });
  return <Animated.View style={[st.item, pos, { transform: [{ translateY: y }, { rotate: r }] }]}><Shape name={name} size={size} color={color} /></Animated.View>;
});

/** The bat: flaps its wings (squeezes sideways), and flies across the screen, again and again. */
const FlyingBat = memo(function FlyingBat({ size, top, color, secs }: { size: number; top: `${number}%`; color: string; secs: number }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const flap = useSwing(260);
  useEffect(() => {
    const a = Animated.loop(Animated.timing(x, { toValue: 1, duration: secs * 1000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [x, secs]);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.5, width + size] });
  const ty = x.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -26, 6, -20, 0] });
  const sx = flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  return <Animated.View style={[st.item, { top, left: 0, transform: [{ translateX: tx }, { translateY: ty }, { scaleX: sx }] }]}><Shape name="bat" size={size} color={color} /></Animated.View>;
});

/** The spider drops a little way down its thread and climbs back. */
const Dangler = memo(function Dangler({ size, left, color, drop }: { size: number; left: `${number}%`; color: string; drop: number }) {
  const v = useSwing(3200);
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [0, drop] });
  const sway = v.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] });
  return (
    <Animated.View style={[st.item, { top: 0, left, alignItems: 'center', transform: [{ translateY: y }, { rotate: sway }] }]}>
      <View style={{ width: 1.5, height: 160, marginTop: -160 + 40, backgroundColor: color }} />
      <Shape name="spider" size={size} color={color} />
    </Animated.View>
  );
});

const HalloweenWatermark = memo(function HalloweenWatermark() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={st.layer}>
        <Bobber name="moon" size={84} color={C.purple} pos={{ top: '5%', right: '26%' }} ms={5200} lift={6} tilt={3} />
        <FlyingBat size={70} top="14%" color={C.purple} secs={16} />
        <Bobber name="ghost" size={104} color={C.bone} pos={{ top: '24%', right: '5%' }} ms={3600} lift={14} tilt={5} />
        <Dangler size={64} left="22%" color={C.purple} drop={90} />
        <Bobber name="skull" size={92} color={C.bone} pos={{ top: '52%', left: '3%' }} ms={4400} lift={8} tilt={6} />
        <FlyingBat size={54} top="46%" color={C.purple} secs={22} />
        <Bobber name="pumpkin" size={96} color={C.orange} pos={{ top: '74%', right: '8%' }} ms={4000} lift={10} tilt={5} />
      </View>
    </View>
  );
});

export default HalloweenWatermark;

const st = StyleSheet.create({
  layer: { flex: 1, opacity: 0.17 },
  item: { position: 'absolute' },
});
