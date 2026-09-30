import GuideScreen from '../../components/GuideScreen';
import storeManagerManual from '../../constants/docs/storeManagerManual';
import { COLORS } from '../../constants';
import { useTranslation } from 'react-i18next';

export default function ManagerGuideScreen() {
  const { t } = useTranslation();
  return (
    <GuideScreen
      title={t('nav.managerManualTitle')}
      content={storeManagerManual}
      headerColor={COLORS.managerPrimary}
    />
  );
}
