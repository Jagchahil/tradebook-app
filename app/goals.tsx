import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../lib/supabase';
import { signedAmount, txDate } from '../lib/format';
import { getGoal, setGoal as persistGoal, taxYearStart, taxYearFraction } from '../lib/goal';
import { INK, RIVER, GREEN, GREEN_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent, GrowBar } from '../components/Motion';

const SAFFRON = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';

const PRESETS = [25000, 50000, 75000, 100000];

function gbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export default function GoalsScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goal, setGoalState] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([getTransactions(user.id), getGoal(user.id)]).then(([txs, g]) => {
      setTransactions(txs.data ?? []);
      setGoalState(g);
      setLoaded(true);
    });
  }, [user]);

  const now = new Date();
  const start = taxYearStart(now);
  const ytd = transactions.filter((t) => new Date(txDate(t)) >= start);
  const income = ytd.filter((t) => signedAmount(t) > 0).reduce((s, t) => s + signedAmount(t), 0);
  const frac = taxYearFraction(now);
  const projected = frac > 0 ? income / frac : 0;

  async function choose(amount: number) {
    if (!user || !amount || amount <= 0) return;
    await persistGoal(user.id, amount);
    setGoalState(amount);
    setCustom('');
  }

  const progress = goal ? Math.min(income / goal, 1) : 0;
  const pct = goal ? Math.round((income / goal) * 100) : 0;
  const toGo = goal ? Math.max(goal - income, 0) : 0;
  const onTrack = goal ? projected >= goal : false;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.back}>‹ Back</Text>
          </PressableScale>
          <Text style={styles.title}>Your goal</Text>
          <RiverAccent />
          <Text style={styles.sub}>A number to aim at. We will show you how close you are, every time you open the app.</Text>
        </FadeIn>

        {goal ? (
          <>
            <FadeIn delay={80}>
              <View style={styles.goalCard}>
                <Text style={styles.goalCardLabel}>EARN THIS YEAR</Text>
                <Text style={styles.goalBig}>{gbp(goal)}</Text>
                <View style={{ marginTop: 14 }}>
                  <GrowBar progress={progress} color={RIVER} track={SURFACE} delay={120} />
                </View>
                <View style={styles.goalRow}>
                  <Text style={styles.goalSoFar}>{gbp(income)} so far</Text>
                  <Text style={styles.goalPct}>{pct}%</Text>
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={[styles.infoCard, { backgroundColor: onTrack ? GREEN_TINT : SAFFRON_TINT }]}>
                <Text style={[styles.infoTitle, { color: onTrack ? GREEN : SAFFRON }]}>
                  {onTrack ? 'You are on track 🎯' : 'A push will get you there 💪'}
                </Text>
                <Text style={styles.infoBody}>
                  {toGo > 0
                    ? `${gbp(toGo)} to go. At your pace so far, you are heading for about ${gbp(projected)} by 5 April.`
                    : `You have hit your goal. Time to set a bigger one.`}
                </Text>
              </View>
            </FadeIn>

            <FadeIn delay={220}>
              <Text style={styles.sectionHeader}>Change your goal</Text>
              <View style={styles.chipWrap}>
                {PRESETS.map((p) => (
                  <PressableScale key={p} onPress={() => choose(p)} style={[styles.chip, goal === p ? styles.chipActive : null]}>
                    <Text style={[styles.chipText, goal === p ? styles.chipTextActive : null]}>{gbp(p)}</Text>
                  </PressableScale>
                ))}
              </View>
              <View style={styles.customRow}>
                <View style={styles.customInputWrap}>
                  <Text style={styles.poundSign}>£</Text>
                  <TextInput
                    value={custom}
                    onChangeText={(v) => setCustom(v.replace(/[^0-9]/g, ''))}
                    placeholder="Your own number"
                    placeholderTextColor="#9AA3AF"
                    keyboardType="number-pad"
                    style={styles.customInput}
                  />
                </View>
                <PressableScale onPress={() => choose(parseInt(custom || '0', 10))} style={styles.setBtn}>
                  <Text style={styles.setBtnText}>Set</Text>
                </PressableScale>
              </View>
            </FadeIn>
          </>
        ) : (
          <FadeIn delay={80}>
            <Text style={styles.sectionHeader}>Pick a target for this tax year</Text>
            <View style={styles.chipWrap}>
              {PRESETS.map((p) => (
                <PressableScale key={p} onPress={() => choose(p)} style={styles.bigChip}>
                  <Text style={styles.bigChipText}>{gbp(p)}</Text>
                </PressableScale>
              ))}
            </View>
            <View style={styles.customRow}>
              <View style={styles.customInputWrap}>
                <Text style={styles.poundSign}>£</Text>
                <TextInput
                  value={custom}
                  onChangeText={(v) => setCustom(v.replace(/[^0-9]/g, ''))}
                  placeholder="Your own number"
                  placeholderTextColor="#9AA3AF"
                  keyboardType="number-pad"
                  style={styles.customInput}
                />
              </View>
              <PressableScale onPress={() => choose(parseInt(custom || '0', 10))} style={styles.setBtn}>
                <Text style={styles.setBtnText}>Set goal</Text>
              </PressableScale>
            </View>
            {loaded && income > 0 ? (
              <Text style={styles.hint}>You are already at {gbp(income)} this tax year. Pick a goal and watch it fill.</Text>
            ) : null}
          </FadeIn>
        )}

        <Text style={styles.footnote}>Your goal is private to you and saved on this device. It is a personal target, not a tax figure.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  goalCard: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 18,
    padding: 22,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(17,17,17,0.06)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 }),
  },
  goalCardLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  goalBig: { fontSize: 40, fontWeight: '800', color: INK, letterSpacing: -1.5, marginTop: 4 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  goalSoFar: { fontSize: 14, fontWeight: '700', color: RIVER },
  goalPct: { fontSize: 14, fontWeight: '800', color: INK },
  infoCard: { marginHorizontal: 24, marginTop: 14, borderRadius: 16, padding: 18 },
  infoTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  infoBody: { fontSize: 14, color: INK, lineHeight: 20 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 24, marginTop: 26, marginBottom: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 24 },
  chip: { backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  chipActive: { backgroundColor: RIVER, borderColor: RIVER },
  chipText: { fontSize: 15, fontWeight: '700', color: INK },
  chipTextActive: { color: WHITE },
  bigChip: { backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 18, minWidth: 130, alignItems: 'center' },
  bigChipText: { fontSize: 19, fontWeight: '800', color: INK },
  customRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginTop: 14, alignItems: 'center' },
  customInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12 },
  poundSign: { fontSize: 16, fontWeight: '800', color: RIVER, marginRight: 6 },
  customInput: { flex: 1, fontSize: 16, color: INK, paddingVertical: 13 },
  setBtn: { backgroundColor: RIVER, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 14 },
  setBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13.5, color: MUTED, paddingHorizontal: 24, marginTop: 16, lineHeight: 20 },
  footnote: { fontSize: 12, color: '#A8AEB6', paddingHorizontal: 24, marginTop: 28, lineHeight: 18 },
});
