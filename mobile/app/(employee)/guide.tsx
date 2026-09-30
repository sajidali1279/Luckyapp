import GuideScreen from '../../components/GuideScreen';
import employeeManual from '../../constants/docs/employeeManual';
import { COLORS } from '../../constants';
import { useTranslation } from 'react-i18next';

export default function EmployeeGuideScreen() {
  const { t } = useTranslation();
  return (
    <GuideScreen
      title={t('nav.employeeManualTitle')}
      content={employeeManual}
      headerColor={COLORS.secondary}
    />
  );
}
