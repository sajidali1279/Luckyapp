import { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error) {
    // Replace with Sentry.captureException(error) once Sentry is integrated
    console.error('[ErrorBoundary]', error.message);
  }

  reset = () => this.setState({ hasError: false, errorMessage: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={s.inner}>
          <View style={s.iconWrap}>
            <Text style={s.icon}>⚠️</Text>
          </View>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.body}>
            The app hit an unexpected error. Your account and points are safe.
          </Text>
          <TouchableOpacity style={s.btn} onPress={this.reset} activeOpacity={0.85}>
            <Text style={s.btnText}>Try Again</Text>
          </TouchableOpacity>
          <Text style={s.hint} numberOfLines={3}>{this.state.errorMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 12,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFF3CD',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 22, fontWeight: '900', color: '#212529', textAlign: 'center',
  },
  body: {
    fontSize: 14, color: '#6C757D', textAlign: 'center', lineHeight: 22,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#CC2936',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: {
    marginTop: 16,
    fontSize: 11, color: '#ADB5BD',
    textAlign: 'center', fontFamily: 'monospace',
  },
});
