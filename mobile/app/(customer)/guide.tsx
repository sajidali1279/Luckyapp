import GuideScreen from '../../components/GuideScreen';
import customerGuide from '../../constants/docs/customerGuide';
import { COLORS } from '../../constants';

export default function CustomerGuideScreen() {
  return (
    <GuideScreen
      title="Customer Guide"
      content={customerGuide}
      headerColor={COLORS.primary}
    />
  );
}
