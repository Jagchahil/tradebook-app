import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../lib/supabase';
import { signedAmount, txDate } from '../lib/format';
import { getGoal, taxYearStart } from '../lib/goal';
import { soleTraderTax } from '../lib/tax';
import { INK, RIVER, GREEN, GREEN_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, RiverAccent, Pop, GrowBar } from '../components/Motion';

interface Badge {
  key: string;
  icon: string;
  title: string;
  desc: string;
  unlocked: boolean;
  cur?: number;
  target?: number;
}

function loggingStreak(txs: Transaction[]): number {
  const days = new Set(txs.map((t) => (t.created_at || '').slice(0, 10)));
  let n = 0;
  const d = new Date();
  const has = (x: Date) => days.has(x.toISOString().slice(0, 10));
  if (!has(d)) d.setDate(d.getDate() - 1);
  while (has(d)) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export default function AchievementsScreen() {
  const { user } = useCurrentUser();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [goal, setGoal] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getTransactions(user.id), getGoal(user.id)]).then(([r, g]) => {
      setTxs(r.data ?? []);
      setGoal(g);
    });
  }, [user]);

  const entries = txs.length;
  const incomeCount = txs.filter((t) => signedAmount(t) > 0).length;
  const expenseCount = txs.filter((t) => signedAmount(t) < 0).length;
  const mileageCount = txs.filter((t) => (t.category || '').toLowerCase() === 'travel' || (t.merchant_name || '').toLowerCase().includes('mileage')).length;
  const cisCount = txs.filter((t) => (t.cis_deduction ?? 0) > 0).length;
  const streak = loggingStreak(txs);

  const start = taxYearStart(new Date());
  const ytd = txs.filter((t) => new Date(txDate(t)) >= start);
  const ytdExp = ytd.filter((t) => signedAmount(t) < 0).reduce((s, t) => s + Math.abs(signedAmount(t)), 0);
  const ytdInc = ytd.filter((t) => signedAmount(t) > 0).reduce((s, t) => s + signedAmount(t), 0);
  const profit = ytdInc - ytdExp;
  // The real saving from claiming expenses: the engine's tax on income alone,
  // minus the engine's tax on actual profit. No flat-rate approximation, so this
  // figure always agrees with the dashboard and the tax tab.
  const taxSaved = Math.max(0, Math.round(soleTraderTax(ytdInc).total - soleTraderTax(profit).total));

  const badges: Badge[] = [
    { key: 'first', icon: '🌱', title: 'First steps', desc: 'Log your very first entry', unlocked: entries >= 1, cur: Math.min(entries, 1), target: 1 },
    { key: 'ten', icon: '📸', title: 'Getting going', desc: 'Log 10 things', unlocked: entries >= 10, cur: Math.min(entries, 10), target: 10 },
    { key: 'fifty', icon: '📚', title: 'Proper bookkeeper', desc: 'Log 50 things', unlocked: entries >= 50, cur: Math.min(entries, 50), target: 50 },
    { key: 'hundred', icon: '🏆', title: 'Centurion', desc: 'Log 100 things', unlocked: entries >= 100, cur: Math.min(entries, 100), target: 100 },
    { key: 'income', icon: '💷', title: 'First payday', desc: 'Log your first income', unlocked: incomeCount >= 1, cur: Math.min(incomeCount, 1), target: 1 },
    { key: 'claimer', icon: '🧰', title: 'Claimer', desc: 'Claim 10 costs', unlocked: expenseCount >= 10, cur: Math.min(expenseCount, 10), target: 10 },
    { key: 'road', icon: '🚗', title: 'On the road', desc: 'Log some mileage', unlocked: mileageCount >= 1, cur: Math.min(mileageCount, 1), target: 1 },
    { key: 'cis', icon: '🏗️', title: 'Subbie', desc: 'Log a CIS payment', unlocked: cisCount >= 1, cur: Math.min(cisCount, 1), target: 1 },
    { key: 'streak', icon: '🔥', title: 'On a roll', desc: 'A 7 day logging streak', unlocked: streak >= 7, cur: Math.min(streak, 7), target: 7 },
    { key: 'goal', icon: '🎯', title: 'Goal setter', desc: 'Set a money goal', unlocked: !!goal, cur: goal ? 1 : 0, target: 1 },
    { key: 'saver', icon: '💚', title: 'Tax saver', desc: 'Save £500 in tax by claiming costs', unlocked: taxSaved >= 500, cur: Math.min(taxSaved, 500), target: 500 },
    { key: 'machine', icon: '⚙️', title: 'Machine', desc: 'Log 250 things', unlocked: entries >= 250, cur: Math.min(entries, 250), target: 250 },
  ];

  const unlocked = badges.filter((b) => b.unlocked).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Your milestones</Text>
          <RiverAccent />
          <Text style={styles.sub}>{unlocked} of {badges.length} unlocked. Keep logging to collect them all.</Text>
        </FadeIn>

        <FadeIn delay={70}>
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>Collection</Text>
              <Text style={styles.progressPct}>{Math.round((unlocked / badges.length) * 100)}%</Text>
            </View>
            <GrowBar progress={unlocked / badges.length} color={RIVER} track={SURFACE} delay={120} />
          </View>
        </FadeIn>

        <View style={styles.grid}>
          {badges.map((b, i) => (
            <FadeIn key={b.key} delay={90 + i * 40} style={styles.cell}>
              <View style={[styles.badge, b.unlocked ? styles.badgeOn : styles.badgeOff]}>
                {b.unlocked ? (
                  <Pop delay={120 + i * 40}><Text style={styles.badgeIcon}>{b.icon}</Text></Pop>
                ) : (
                  <Text style={[styles.badgeIcon, styles.badgeIconOff]}>{b.icon}</Text>
                )}
                <Text style={[styles.badgeTitle, !b.unlocked ? styles.dim : null]}>{b.title}</Text>
                <Text style={[styles.badgeDesc, !b.unlocked ? styles.dim : null]}>{b.desc}</Text>
                {b.unlocked ? (
                  <View style={styles.doneTag}><Text style={styles.doneTagText}>UNLOCKED</Text></View>
                ) : (
                  <Text style={styles.prog}>{b.cur} / {b.target}</Text>
                )}
              </View>
            </FadeIn>
          ))}
        </View>

        <Text style={styles.footnote}>Milestones are a bit of fun from your own logged activity. The real win is books that are always ready for tax.</Text>
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
  progressCard: { marginHorizontal: 24, marginTop: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
  progressPct: { fontSize: 14, fontWeight: '800', color: INK },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, marginTop: 14 },
  cell: { width: '50%', padding: 6 },
  badge: { borderRadius: 16, padding: 16, minHeight: 150, borderWidth: 1 },
  badgeOn: { backgroundColor: WHITE, borderColor: LINE },
  badgeOff: { backgroundColor: SURFACE, borderColor: 'transparent' },
  badgeIcon: { fontSize: 30 },
  badgeIconOff: { opacity: 0.35 },
  badgeTitle: { fontSize: 15.5, fontWeight: '800', color: INK, marginTop: 10 },
  badgeDesc: { fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 17 },
  dim: { opacity: 0.5 },
  doneTag: { alignSelf: 'flex-start', backgroundColor: GREEN_TINT, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, marginTop: 10 },
  doneTagText: { fontSize: 10, fontWeight: '800', color: GREEN, letterSpacing: 0.5 },
  prog: { fontSize: 12.5, fontWeight: '700', color: MUTED, marginTop: 10 },
  footnote: { fontSize: 12, color: '#A8AEB6', paddingHorizontal: 24, marginTop: 20, lineHeight: 18 },
});
