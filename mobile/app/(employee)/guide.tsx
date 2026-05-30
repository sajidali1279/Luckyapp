import GuideScreen from '../../components/GuideScreen';
import employeeManual from '../../constants/docs/employeeManual';
import { COLORS } from '../../constants';

export default function EmployeeGuideScreen() {
  return (
    <GuideScreen
      title="Employee Manual"
      content={employeeManual}
      headerColor={COLORS.secondary}
    />
  );
}
