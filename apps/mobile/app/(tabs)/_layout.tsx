import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '../../src/theme';
import { useAuthState } from '../../src/use-auth-state';
import { View, ActivityIndicator } from 'react-native';

export default function TabsLayout() {
  const { ready, signedIn } = useAuthState();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.canvas }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!signedIn) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tokens.color.card,
          borderTopColor: tokens.color.border,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 24,
        },
        tabBarLabelStyle: {
          fontSize: tokens.font.xs,
          fontWeight: tokens.weight.medium,
          marginTop: 2,
        },
        tabBarActiveTintColor: tokens.color.textPrimary,
        tabBarInactiveTintColor: tokens.color.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => <Feather name="message-square" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <Feather name="bell" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
