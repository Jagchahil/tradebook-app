import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function RootLayout() {
  const { user, loading } = useCurrentUser();
  const segments = useSegments() as string[];

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const authScreen = segments[1];

    // Not signed in and somewhere outside the auth group. Send them to the start.
    if (!user && !inAuthGroup) {
      router.replace('/(auth)');
      return;
    }

    // Signed in but sitting on the welcome screen. This is a returning user, so
    // skip the intro and drop them into the app. We deliberately do not touch the
    // phone or subscribe screens, so a brand new sign up still flows
    // welcome to phone to subscribe to tabs.
    if (user && inAuthGroup && (authScreen === undefined || authScreen === 'index')) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="invoice/new" options={{ presentation: 'card' }} />
      <Stack.Screen name="invoice/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="profile" options={{ presentation: 'card' }} />
      <Stack.Screen name="tax-summary" options={{ presentation: 'card' }} />
      <Stack.Screen name="diary" options={{ presentation: 'card' }} />
      <Stack.Screen name="file-return" options={{ presentation: 'card' }} />
      <Stack.Screen name="goals" options={{ presentation: 'card' }} />
      <Stack.Screen name="wrapped" options={{ presentation: 'card' }} />
      <Stack.Screen name="cis" options={{ presentation: 'card' }} />
      <Stack.Screen name="can-i-claim" options={{ presentation: 'card' }} />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="achievements" options={{ presentation: 'card' }} />
      <Stack.Screen name="accountant" options={{ presentation: 'card' }} />
      <Stack.Screen name="what-if" options={{ presentation: 'card' }} />
      <Stack.Screen name="pay-yourself" options={{ presentation: 'card' }} />
      <Stack.Screen name="proof-of-income" options={{ presentation: 'card' }} />
      <Stack.Screen name="year-summary" options={{ presentation: 'card' }} />
    </Stack>
  );
}
