import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { RIVER, RIVER_TINT, SAFFRON, PAPER } from '../../lib/theme';
import { getBillingStatus } from '../../lib/supabase';

const INACTIVE = '#9AA1AC';

// Paywall enforcement. Off by default. When EXPO_PUBLIC_PAYWALL_ENABLED is 'true',
// a user whose trial has ended with no active subscription is sent to the paywall.
const PAYWALL_ENABLED = process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View
      style={{
        width: 40,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? RIVER_TINT : 'transparent',
      }}
    >
      <Text style={{ fontSize: focused ? 19 : 18, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </View>
  );
}

// The centre capture button. A raised square that stands out as the primary
// action, the way the middle button does on Instagram.
function CenterIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 16,
        marginTop: Platform.OS === 'web' ? -6 : -14,
        backgroundColor: focused ? RIVER : SAFFRON,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: RIVER,
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 16px rgba(27,89,166,0.4)' } as any) : {}),
      }}
    >
      <Text style={{ fontSize: 26, color: '#fff', fontWeight: '800', lineHeight: 28 }}>＋</Text>
    </View>
  );
}

export default function TabLayout() {
  // Fails OPEN: on any error or null status we treat the user as entitled, so a
  // network blip can never lock out a paying customer.
  const [checking, setChecking] = useState(PAYWALL_ENABLED);
  const [entitled, setEntitled] = useState(!PAYWALL_ENABLED);

  useEffect(() => {
    if (!PAYWALL_ENABLED) return;
    let active = true;
    getBillingStatus().then((b) => {
      if (!active) return;
      const ok = !b || b.status === 'active' || b.status === 'trialing';
      setEntitled(ok);
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER }}>
        <ActivityIndicator color={RIVER} size="large" />
      </View>
    );
  }
  if (!entitled) return <Redirect href="/paywall" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: RIVER,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#EBE7DD',
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 60 : 70,
          paddingBottom: Platform.OS === 'web' ? 8 : 12,
          paddingTop: 8,
          ...(Platform.OS === 'web' ? ({ boxShadow: '0 -2px 12px rgba(17,17,17,0.05)' } as any) : {}),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }} />
      <Tabs.Screen name="tax" options={{ title: 'Money', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }} />
      <Tabs.Screen name="capture" options={{ title: '', tabBarIcon: ({ focused }) => <CenterIcon focused={focused} /> }} />
      <Tabs.Screen name="invoices" options={{ title: 'Invoices', tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} /> }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />

      {/* Kept as routes, hidden from the bar. Reachable via router.push. */}
      <Tabs.Screen name="transactions" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
