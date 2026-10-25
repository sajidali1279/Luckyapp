// Cuatro, the Lucky Stop mascot (2026-10-25): pictures exported from the launch kit's own drawing (docs/confidential/launch-kit/src/
// cuatro_export.py), so the app's Cuatro matches the posters. Decorative: screen readers skip it.
import { Image } from 'react-native';

const POSES = {
  wave: require('../../assets/cuatro/wave.png'),
  cheer: require('../../assets/cuatro/cheer.png'),
  phone: require('../../assets/cuatro/phone.png'),
  chicken: require('../../assets/cuatro/chicken.png'),
  thumbs: require('../../assets/cuatro/thumbs.png'),
  point: require('../../assets/cuatro/point.png'),
  peek: require('../../assets/cuatro/peek.png'),
};
export type CuatroPose = keyof typeof POSES;

export default function Cuatro({ pose, size }: { pose: CuatroPose; size: number }) {
  return (
    <Image source={POSES[pose]} style={{ width: size, height: Math.round((size * 295) / 300) }} resizeMode="contain"
      accessible={false} importantForAccessibility="no" accessibilityIgnoresInvertColors />
  );
}
