// The seasonal versions of the faint drifting shapes behind the dashboards (2026-10-25; components/DashboardWatermark.tsx swaps to one
// while HQ's theme is on). Halloween's is in ../halloween/HalloweenWatermark.tsx.
import { memo, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { CREATURES } from '../halloween/art';
import { SHAPES as S, COLORS_THANKSGIVING as TC, COLORS_CHRISTMAS as XC, COLORS_GAME_DAY as GC } from './art';
import { Bobber, Faller, Flyer } from './drift';

function Layer({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, st.clip]}>
      <View style={st.layer}>{children}</View>
    </View>
  );
}

/** Thanksgiving: maple and oak leaves falling, an acorn, wheat, a pie and a pumpkin. */
export const ThanksgivingWatermark = memo(function ThanksgivingWatermark() {
  return (
    <Layer>
      <Faller d={S.maple} size={70} left="10%" color={TC.orange} secs={15} sway={28} spin={220} />
      <Faller d={S.oak} size={58} left="60%" color={TC.brown} secs={18} phase={0.45} sway={22} spin={-180} />
      <Faller d={S.maple} size={50} left="36%" color={TC.red} secs={13} phase={0.7} sway={18} spin={260} />
      <Faller d={S.oak} size={44} left="84%" color={TC.gold} secs={16} phase={0.2} sway={16} spin={200} />
      <Bobber d={S.acorn} size={70} color={TC.gold} pos={{ top: '7%', right: '22%' }} ms={4200} lift={8} tilt={6} />
      <Bobber d={S.wheat} size={96} color={TC.gold} pos={{ top: '26%', left: '4%' }} ms={5000} lift={6} tilt={4} />
      <Bobber d={S.pie} size={100} color={TC.brown} pos={{ top: '50%', right: '5%' }} ms={4600} lift={8} tilt={3} />
      <Bobber d={CREATURES.pumpkin} size={92} color={TC.orange} pos={{ top: '74%', left: '8%' }} ms={4000} lift={10} tilt={5} />
    </Layer>
  );
});

/** Christmas: snowflakes falling, a star, a tree, an ornament, a candy cane and a gift. */
export const ChristmasWatermark = memo(function ChristmasWatermark() {
  return (
    <Layer>
      <Faller d={S.snowflake} size={56} left="8%" color={XC.ice} secs={17} spin={180} />
      <Faller d={S.snowflake} size={38} left="34%" color={XC.ice} secs={13} phase={0.5} sway={14} spin={-160} />
      <Faller d={S.snowflake} size={48} left="64%" color={XC.ice} secs={20} phase={0.25} spin={200} />
      <Faller d={S.snowflake} size={32} left="88%" color={XC.ice} secs={11} phase={0.75} sway={12} spin={-200} />
      <Bobber d={S.star} size={74} color={XC.gold} pos={{ top: '6%', right: '24%' }} ms={5200} lift={6} tilt={8} />
      <Bobber d={S.ornament} size={84} color={XC.red} pos={{ top: '24%', right: '5%' }} ms={3600} lift={10} tilt={7} />
      <Bobber d={S.tree} size={104} color={XC.green} pos={{ top: '46%', left: '3%' }} ms={4800} lift={6} tilt={3} />
      <Bobber d={S.candyCane} size={80} color={XC.red} pos={{ top: '60%', right: '30%' }} ms={4300} lift={8} tilt={6} />
      <Bobber d={S.gift} size={92} color={XC.red} pos={{ top: '75%', right: '7%' }} ms={4000} lift={10} tilt={5} />
    </Layer>
  );
});

/** Game day: footballs flying across (spinning), a helmet, goal posts, a trophy, a megaphone and a star. */
export const GameDayWatermark = memo(function GameDayWatermark() {
  return (
    <Layer>
      <Flyer d={S.football} size={66} top="15%" color={GC.brown} secs={15} spin={2} />
      <Flyer d={S.football} size={48} top="48%" color={GC.brown} secs={21} spin={3} />
      <Bobber d={S.goalPost} size={86} color={GC.gold} pos={{ top: '5%', right: '24%' }} ms={5200} lift={5} tilt={3} />
      <Bobber d={S.helmet} size={100} color={GC.navy} pos={{ top: '25%', right: '5%' }} ms={3800} lift={10} tilt={5} />
      <Bobber d={S.trophy} size={92} color={GC.gold} pos={{ top: '55%', left: '4%' }} ms={4400} lift={8} tilt={4} />
      <Bobber d={S.star} size={44} color={GC.navy} pos={{ top: '40%', left: '34%' }} ms={3400} lift={6} tilt={10} />
      <Bobber d={S.megaphone} size={92} color={GC.green} pos={{ top: '74%', right: '8%' }} ms={4000} lift={8} tilt={6} />
    </Layer>
  );
});

const st = StyleSheet.create({
  clip: { overflow: 'hidden' },
  layer: { flex: 1, opacity: 0.16 },
});
