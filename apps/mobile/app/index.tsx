import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthState } from '../src/use-auth-state';
import { tokens } from '../src/theme';

export default function Index() {
  const { ready, signedIn } = useAuthState();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.canvas }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={signedIn ? '/(tabs)' : '/login'} />;
}
