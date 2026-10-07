import { useEffect } from 'react';
import { BaseToast, ErrorToast, InfoToast, type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';
import { haptic } from '../utils/haptics';

// The library's own toasts, unchanged in look, plus a haptic that matches: a success buzz with every "Saved", an error buzz with
// every refusal. Used by the root <Toast /> and by ModalToastHost inside pop-ups, so all 170-odd toasts in the app get it.
function Felt({ kind, params, children }: { kind: 'success' | 'error'; params: ToastConfigParams<unknown>; children: React.ReactNode }) {
  useEffect(() => {
    if (params.isVisible) (kind === 'success' ? haptic.success : haptic.error)();
  }, [params.isVisible, params.text1, params.text2]);
  return <>{children}</>;
}

export const toastConfig: ToastConfig = {
  success: (params) => <Felt kind="success" params={params}><BaseToast {...params} /></Felt>,
  error: (params) => <Felt kind="error" params={params}><ErrorToast {...params} /></Felt>,
  info: (params) => <InfoToast {...params} />,
};
