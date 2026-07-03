import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../lib/supabase';
import { signedAmount, categoryEmoji, txDate } from '../lib/format';
import { taxYearStart } from '../lib/goal';
import { soleTraderTax } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, PAPER, LINE, MUTED, WHITE, SAFFRON_DEEP } from '../lib/theme';
import { FadeIn, PressableScale, CountUp, RiverAccent, Pop } from '../components/Motion';

// The theme token, not a local one-off, so the palette stays in one place.
const SAFFRON = SAFFRON_DEEP;
const SAFFRON_TINT = '#FBEFD8';
const PLUM = '#6D28D9';
const PLUM_TINT = '#EDE7FB';

function gbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

interface Panel {
  bg: string;
  fg: string;
  emoji: string;
  value: number;
  prefix?: string;
  suffix?: string;
  title: string;
  body: string;
  money?: boolean;
}

export default function WrappedScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getTransactions(user.id).then((r) => {
      setTransactions(r.data ?? []);
      setLoaded(true);
    });
  }, [user]);

  const now = new Date();
  const start = taxYearStart(now);
  const ytd = transactions.filter((t) => new Date(txDate(t)) >= start);

  const expenseTxs = ytd.filter((t) => signedAmount(t) < 0);
  const incomeTotal = ytd.filter((t) => signedAmount(t) > 0).reduce((s, t) => s + signedAmount(t), 0);
  const expensesTotal = expenseTxs.reduce((s, t) => s + Math.abs(signedAmount(t)), 0);
  const profit = incomeTotal - expensesTotal;
  // The real saving from claiming expenses, straight from the engine: tax on
  // income alone minus tax on actual profit. Agrees with the dashboard.
  const taxSaved = Math.max(0, Math.round(soleTraderTax(incomeTotal).total - soleTraderTax(profit).total));
  const entries = ytd.length;

  // The category they spent the most in.
  const byCat: Record<string, number> = {};
  for (const t of expenseTxs) {
    const c = t.category || 'other';
    byCat[c] = (byCat[c] || 0) + Math.abs(signedAmount(t));
  }
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  const yearLabel = `${start.getFullYear()}/${String((start.getFullYear() + 1) % 100).padStart(2, '0')}`;

  const panels: Panel[] = [
    { bg: RIVER_TINT, fg: RIVER, emoji: '🧾', value: entries, title: 'things logged', body: `You captured ${entries} ${entries === 1 ? 'entry' : 'entries'} this year without lifting a pen. That is a tidy set of books.`, money: false },
    { bg: GREEN_TINT, fg: GREEN, emoji: '💷', value: incomeTotal, title: 'brought in', body: 'Every job, every payment, tracked as it landed.', money: true },
    { bg: SAFFRON_TINT, fg: SAFFRON, emoji: '🧰', value: expensesTotal, title: 'in costs claimed', body: 'Costs you claimed back, that you might otherwise have forgotten.', money: true },
    { bg: PLUM_TINT, fg: PLUM, emoji: '💚', value: taxSaved, title: 'saved in tax', body: 'Roughly what those claimed costs kept in your pocket instead of HMRC’s.', money: true },
  ];

  async function share() {
    try {
      await Share.share({
        message:
          `My ${yearLabel} so far with Lekhio 📒\n` +
          `• ${entries} things logged\n` +
          `• ${gbp(incomeTotal)} brought in\n` +
          `• ${gbp(expensesTotal)} in costs claimed\n` +
          `• about ${gbp(taxSaved)} saved in tax\n\n` +
          `I do my books by WhatsApp now. https://lekhio.com`,
      });
    } catch {
      // share sheet dismissed
    }
  }

  const enough = entries > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.back}>‹ Back</Text>
          </PressableScale>
          <Text style={styles.title}>Your year, wrapped</Text>
          <RiverAccent />
          <Text style={styles.sub}>{yearLabel} so far. A look at what you built, one text at a time.</Text>
        </FadeIn>

        {!loaded ? null : !enough ? (
          <FadeIn delay={80}>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyTitle}>Your story starts now.</Text>
              <Text style={styles.emptyBody}>Log a few receipts and payments on WhatsApp, then come back. Your year in review fills up as you go.</Text>
            </View>
          </FadeIn>
        ) : (
          <>
            {panels.map((p, i) => (
              <FadeIn key={p.title} delay={80 + i * 90}>
                <View style={[styles.panel, { backgroundColor: p.bg }]}>
                  <Pop delay={150 + i * 90}><Text style={styles.panelEmoji}>{p.emoji}</Text></Pop>
                  <CountUp
                    value={p.value}
                    delay={120 + i * 90}
                    format={p.money ? (n: number) => gbp(n) : (n: number) => String(Math.round(n))}
                    style={[styles.panelValue, { color: p.fg }]}
                  />
                  <Text style={styles.panelTitle}>{p.title}</Text>
                  <Text style={styles.panelBody}>{p.body}</Text>
                </View>
              </FadeIn>
            ))}

            {topCat ? (
              <FadeIn delay={80 + panels.length * 90}>
                <View style={styles.topCard}>
                  <Text style={styles.topEmoji}>{categoryEmoji(topCat[0])}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topLabel}>Your biggest cost</Text>
                    <Text style={styles.topValue}>{topCat[0]} · {gbp(topCat[1])}</Text>
                  </View>
                </View>
              </FadeIn>
            ) : null}

            <FadeIn delay={140 + panels.length * 90}>
              <View style={styles.profitCard}>
                <Text style={styles.profitLabel}>PROFIT SO FAR</Text>
                <Text style={[styles.profitValue, { color: profit < 0 ? '#B23A2B' : RIVER }]}>{gbp(profit)}</Text>
                <Text style={styles.profitBody}>You, your trade, and a phone. Not bad at all.</Text>
              </View>
            </FadeIn>

            <FadeIn delay={200 + panels.length * 90}>
              <PressableScale onPress={share} style={styles.shareBtn}>
                <Text style={styles.shareBtnText}>Share your year 🎉</Text>
              </PressableScale>
            </FadeIn>
          </>
        )}

        <Text style={styles.footnote}>Figures are a friendly summary of what you have logged, not a tax calculation. Tax saved is a rough estimate.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 44 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  panel: { marginHorizontal: 24, marginTop: 14, borderRadius: 20, padding: 24 },
  panelEmoji: { fontSize: 30 },
  panelValue: { fontSize: 46, fontWeight: '800', letterSpacing: -1.5, marginTop: 6 },
  panelTitle: { fontSize: 16, fontWeight: '700', color: INK, marginTop: 2 },
  panelBody: { fontSize: 14, color: MUTED, marginTop: 8, lineHeight: 20 },
  topCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 24, marginTop: 14, backgroundColor: WHITE,
    borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18,
  },
  topEmoji: { fontSize: 28 },
  topLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
  topValue: { fontSize: 17, fontWeight: '800', color: INK, marginTop: 3, textTransform: 'capitalize' },
  profitCard: {
    marginHorizontal: 24, marginTop: 14, backgroundColor: INK, borderRadius: 20, padding: 24,
  },
  profitLabel: { fontSize: 11, fontWeight: '700', color: '#9AA3AF', letterSpacing: 0.8 },
  profitValue: { fontSize: 44, fontWeight: '800', letterSpacing: -1.5, marginTop: 4 },
  profitBody: { fontSize: 14, color: '#C7CDD6', marginTop: 8, lineHeight: 20 },
  shareBtn: { marginHorizontal: 24, marginTop: 18, backgroundColor: RIVER, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shareBtnText: { color: WHITE, fontSize: 16, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 40 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: INK, textAlign: 'center' },
  emptyBody: { fontSize: 14.5, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  footnote: { fontSize: 12, color: '#A8AEB6', paddingHorizontal: 24, marginTop: 26, lineHeight: 18 },
});
