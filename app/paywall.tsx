import React, { useState } from 'react';
import { View, Text, SafeAreaView, StyleSheet, Platform, StatusBar, Linking, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getUserPhone, getBillingStatus, startSubscriptionCheckout, supabase } from '../lib/supabase';
import { INK, RIVER, RIVER_TINT, PAPER, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

// Shown when the trial has ended and there is no active subscription. Only ever
// reached when paywall enforcement is switched on (EXPO_PUBLIC_PAYWALL_ENABLED).
export default function PaywallScreen() {
  const { user } = useCurrentUser();
  const [busy, setBusy] = useState(false);

  async function subscribe() {
    if (!user) return;
    setBusy(true);
    const phone = await getUserPhone(user.id);
    const url = await startSubscriptionCheckout(phone, 'monthly');
    setBusy(false);
    if (url) {
      Linking.openURL(url).catch(() => Alert.alert('Could not open checkout', 'Please try again.'));
    } else {
      Alert.alert('Not available yet', 'Card payments are not switched on yet. Please try again later.');
    }
  }

  async function refresh() {
    setBusy(true);
    const b = await getBillingStatus();
    setBusy(false);
    if (b && (b.status === 'active' || b.status === 'trialing')) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('Not active yet', 'We could not find an active subscription for this number yet. If you have just paid, give it a moment and try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <FadeIn>
          <Text style={styles.wordmark}>Lekhio</Text>
          <RiverAccent />
        </FadeIn>

        <FadeIn delay={60}>
          <Text style={styles.title}>Keep your books handled</Text>
          <Text style={styles.sub}>Your free trial has ended. Add a card to carry on snapping receipts and staying ready for tax, all on WhatsApp.</Text>
        </FadeIn>

        <FadeIn delay={120}>
          <View style={styles.priceCard}>
            <Text style={styles.price}>
              £19.99<Text style={styles.priceUnit}> a month</Text>
            </Text>
            <Text style={styles.priceNote}>Everything included. Cancel any time.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={160}>
          <PressableScale onPress={subscribe} style={[styles.cta, busy ? { opacity: 0.6 } : null]} disabled={busy}>
            {busy ? <ActivityIndicator color={WHITE} /> : <Text style={styles.ctaText}>Add a card to keep Lekhio</Text>}
          </PressableScale>
          <PressableScale onPress={refresh} style={styles.secondary} disabled={busy}>
            <Text style={styles.secondaryText}>I have already subscribed</Text>
          </PressableScale>
        </FadeIn>

        <Text style={styles.signout} onPress={() => supabase.auth.signOut()}>Sign out</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  inner: { flex: 1, maxWidth: 520, width: '100%', alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  wordmark: { fontWeight: '800', fontSize: 30, color: INK },
  title: { fontWeight: '800', fontSize: 26, color: INK, marginTop: 28 },
  sub: { fontSize: 15, color: MUTED, marginTop: 10, lineHeight: 22 },
  priceCard: { marginTop: 26, backgroundColor: RIVER_TINT, borderRadius: 18, padding: 22 },
  price: { fontSize: 34, fontWeight: '800', color: RIVER },
  priceUnit: { fontSize: 16, fontWeight: '600', color: RIVER },
  priceNote: { fontSize: 13.5, color: RIVER, marginTop: 6 },
  cta: { marginTop: 26, backgroundColor: RIVER, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: WHITE, fontSize: 16, fontWeight: '700' },
  secondary: { marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: LINE, backgroundColor: WHITE },
  secondaryText: { color: INK, fontSize: 15, fontWeight: '600' },
  signout: { marginTop: 22, textAlign: 'center', color: MUTED, fontSize: 14, fontWeight: '600' },
});
