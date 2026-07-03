import React from 'react';
import { View, Text, SafeAreaView, ScrollView, StyleSheet, Platform, StatusBar, Linking } from 'react-native';
import { router } from 'expo-router';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, SAFFRON_DEEP, PAPER, LINE, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale } from '../../components/Motion';

const SAFFRON_TINT = '#FBEFD8';

// The Lekhio WhatsApp business line. Photo and voice capture happen in the chat,
// so those options open WhatsApp. Typed money and invoices open the app screens.
const LEKHIO_WA = '447593214044';
function waLink(text: string): string {
  return `https://wa.me/${LEKHIO_WA}?text=${encodeURIComponent(text)}`;
}

interface Opt {
  emoji: string;
  title: string;
  sub: string;
  tint: string;
  fg: string;
  onPress: () => void;
}

export default function CaptureScreen() {
  const options: Opt[] = [
    { emoji: '📸', title: 'Snap a receipt', sub: 'Photograph it in WhatsApp, we read it', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, onPress: () => Linking.openURL(waLink('Here is a receipt')) },
    { emoji: '🎙️', title: 'Record a voice note', sub: 'Say "spent forty on diesel"', tint: RIVER_TINT, fg: RIVER, onPress: () => Linking.openURL(waLink('Voice note')) },
    { emoji: '💷', title: 'Log money in or out', sub: 'Type it, one line, done', tint: GREEN_TINT, fg: GREEN, onPress: () => router.push('/add') },
    { emoji: '🧾', title: 'Create an invoice', sub: 'Send it by email or a link', tint: RIVER_TINT, fg: RIVER, onPress: () => router.push('/invoice/new') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PAPER} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={styles.title}>Add anything</Text>
          <Text style={styles.intro}>Snap it, say it, or type it. Whatever is quickest right now.</Text>
        </FadeIn>

        {options.map((o, i) => (
          <FadeIn key={o.title} delay={80 + i * 70}>
            <PressableScale style={styles.card} onPress={o.onPress}>
              <View style={[styles.iconTile, { backgroundColor: o.tint }]}>
                <Text style={{ fontSize: 24 }}>{o.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{o.title}</Text>
                <Text style={styles.cardSub}>{o.sub}</Text>
              </View>
              <Text style={[styles.chev, { color: o.fg }]}>›</Text>
            </PressableScale>
          </FadeIn>
        ))}

        <FadeIn delay={400}>
          <Text style={styles.note}>Everything you send is logged and kept ready for tax. You approve before anything reaches HMRC.</Text>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { padding: 22, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: INK, letterSpacing: -0.5 },
  intro: { fontSize: 14.5, color: MUTED, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 16, marginBottom: 12 },
  iconTile: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: INK },
  cardSub: { fontSize: 13, color: MUTED, marginTop: 2 },
  chev: { fontSize: 26, fontWeight: '700' },
  note: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
