import GuideScreen from '../../components/GuideScreen';
import storeManagerManual from '../../constants/docs/storeManagerManual';
import { COLORS } from '../../constants';

export default function ManagerGuideScreen() {
  return (
    <GuideScreen
      title="Store Manager Manual"
      content={storeManagerManual}
      headerColor={COLORS.managerPrimary}
    />
  );
}
