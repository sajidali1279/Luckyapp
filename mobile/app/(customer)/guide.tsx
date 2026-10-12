import GuideScreen from '../../components/GuideScreen';
import ContactCard from '../../components/ContactCard';
import customerGuide from '../../constants/docs/customerGuide';
import { COLORS } from '../../constants';
import { useTranslation } from 'react-i18next';

export default function CustomerGuideScreen() {
  const { t } = useTranslation();
  return (
    <GuideScreen
      title={t('nav.customerGuideTitle')}
      content={customerGuide}
      headerColor={COLORS.primary}
      footer={<ContactCard />}
    />
  );
}
