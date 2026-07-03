import React from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, Linking, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { INK, RIVER, RIVER_TINT, PAPER, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../../components/Motion';

// Sign up and payment happen on the web. The app is the companion you log into.
// Swap to https://lekhio.com once the domain is live.
const SIGNUP_URL = 'https://tradebook-app-five.vercel.app';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PAPER} />

      <FadeIn style={styles.top}>
        <View>
          <Text style={styles.wordmark}>Lekhio</Text>
          <RiverAccent width={40} />
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>FREE</Text>
        </View>
      </FadeIn>

      <View style={styles.middle}>
        <FadeIn delay={120}>
          <Text style={styles.headline}>Welcome</Text>
        </FadeIn>
        <FadeIn delay={200}>
          <Text style={styles.headline}>back.</Text>
        </FadeIn>
        <FadeIn delay={300}>
          <Text style={styles.sub}>
            Log in to see your books, your tax, and your invoices. The day to day all happens on WhatsApp.
          </Text>
        </FadeIn>
        <FadeIn delay={400}>
          <View style={styles.pill}>
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>Works through WhatsApp</Text>
          </View>
        </FadeIn>
      </View>

      <FadeIn delay={480} style={styles.bottom}>
        <PressableScale
          style={styles.button}
          onPress={() => router.push('/(auth)/phone')}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <Text style={styles.buttonText}>Log in</Text>
        </PressableScale>
        <TouchableOpacity onPress={() => Linking.openURL(SIGNUP_URL)} accessibilityRole="link" accessibilityLabel="Create your account on the web">
          <Text style={styles.signupLink}>New to Lekhio? Create your account at lekhio.com</Text>
        </TouchableOpacity>
        <Text style={styles.trust}>Your data is encrypted and never sold. You approve everything. We are not HMRC.</Text>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAPER,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'android' ? 52 : 64,
    paddingBottom: 40,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  wordmark: { fontSize: 26, fontWeight: '700', color: INK, letterSpacing: -0.6 },
  badge: { backgroundColor: RIVER_TINT, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: RIVER, letterSpacing: 0.5 },
  middle: { flex: 1, justifyContent: 'center' },
  headline: { fontSize: 44, fontWeight: '800', color: INK, lineHeight: 50, letterSpacing: -1.4 },
  sub: { fontSize: 16, color: MUTED, lineHeight: 24, marginTop: 20, maxWidth: 340 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: RIVER_TINT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 28,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  pillText: { fontSize: 14, fontWeight: '600', color: RIVER },
  bottom: { gap: 12 },
  button: { backgroundColor: RIVER, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700', color: WHITE },
  signupLink: { fontSize: 14, color: RIVER, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },
  trust: { fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', lineHeight: 17, marginTop: 6, paddingHorizontal: 10 },
});
