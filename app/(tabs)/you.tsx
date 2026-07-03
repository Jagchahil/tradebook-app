import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getTransactions, getUserProfile, Transaction } from '../../lib/supabase';
import { formatGBP, signedAmount, isIncome, txDate } from '../../lib/format';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, RED, RED_TINT, SURFACE, LINE, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale, CountUp, GrowBar, Pop, Skeleton } from '../../components/Motion';
import { taxYearStart } from '../../lib/goal';
import { soleTraderTax } from '../../lib/tax';

const SAFFRON = '#E0A33E';
const SAFFRON_TINT = '#FBEFD8';
const SAFFRON_DEEP = '#C9842A';

// The named trade career ladder from the design direction.
const LEVELS: { name: string; at: number }[] = [
  { name: 'Apprentice', at: 1 },
  { name: 'Grafter', at: 7 },
  { name: 'Time-Served', at: 30 },
  { name: 'Gaffer', at: 80 },
  { name: 'Master', at: 150 },
  { name: 'Guvnor', at: 300 },
];

function levelFor(entries: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (entries >= LEVELS[i].at) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
  const span = Math.max(1, next.at - cur.at);
  const progress = idx === LEVELS.length - 1 ? 1 : Math.max(0, Math.min(1, (entries - cur.at) / span));
  return { levelNo: idx + 1, name: cur.name, nextName: next.name, progress, isMax: idx === LEVELS.length - 1 };
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

const webShadow = Platform.OS === 'web' ? ({ boxShadow: '0 6px 18px rgba(17,17,17,0.06)' } as any) : {};

interface Badge { icon: string; title: string; unlocked: boolean }

function Row({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <PressableScale style={styles.linkRow} onPress={onPress}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.chev}>›</Text>
    </PressableScale>
  );
}

export default function YouScreen() {
  const { user } = useCurrentUser();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<string>('Your business');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [res, profile] = await Promise.all([getTransactions(user.id), getUserProfile(user.id)]);
    setTxs(res.data ?? []);
    if (profile) setBusiness(profile.business_name || profile.name || 'Your business');
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const entries = txs.length;
  const streak = loggingStreak(txs);
  const yearStart = taxYearStart();
  const confirmed = txs.filter((t) => t.confirmed !== false && new Date(txDate(t)) >= yearStart);
  const income = confirmed.filter(isIncome).reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
  const expenses = confirmed.filter((t) => !isIncome(t)).reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
  const profit = confirmed.reduce((s, t) => s + signedAmount(t), 0);
  const setAside = Math.max(0, Math.round(soleTraderTax(Math.max(0, profit)).total));
  const cisRefund = confirmed.reduce((s, t) => s + (t.cis_deduction ?? 0), 0);
  const lvl = levelFor(entries);

  const cisCount = txs.filter((t) => (t.cis_deduction ?? 0) > 0).length;
  const hasReceipt = txs.some((t) => !!t.receipt_url);
  const totalTracked = txs.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
  const badges: Badge[] = [
    { icon: '🌱', title: 'First entry', unlocked: entries >= 1 },
    { icon: '📸', title: 'First receipt', unlocked: hasReceipt },
    { icon: '🔥', title: '7-day streak', unlocked: streak >= 7 },
    { icon: '💷', title: '£10k tracked', unlocked: totalTracked >= 10000 },
    { icon: '🏗️', title: 'CIS pro', unlocked: cisCount >= 1 },
    { icon: '📅', title: 'Full month', unlocked: streak >= 30 },
    { icon: '🎯', title: 'Tax-ready', unlocked: profit > 0 && confirmed.length >= 10 },
    { icon: '🏅', title: '50 logged', unlocked: entries >= 50 },
    { icon: '🏆', title: '100 logged', unlocked: entries >= 100 },
  ];
  const badgesUnlocked = badges.filter((b) => b.unlocked).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={'#FBFAF7'} />
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>{business}</Text>
        <PressableScale onPress={() => router.push('/settings')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} />}
      >
        {loading ? (
          <View style={{ gap: 12 }}>
            <Skeleton width={'100%'} height={90} radius={18} />
            <Skeleton width={'100%'} height={110} radius={18} />
            <Skeleton width={'100%'} height={140} radius={18} />
          </View>
        ) : (
          <>
            {/* Identity + stats */}
            <FadeIn>
              <View style={styles.headRow}>
                <View style={styles.ring}>
                  <View style={styles.ringInner}><Text style={{ fontSize: 26 }}>👷</Text></View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.stat}><Text style={styles.statNum}>{entries}</Text><Text style={styles.statLabel}>entries</Text></View>
                  <View style={styles.stat}><Text style={styles.statNum}>🔥 {streak}</Text><Text style={styles.statLabel}>day streak</Text></View>
                  <View style={styles.stat}><Text style={styles.statNum}>{badgesUnlocked}</Text><Text style={styles.statLabel}>badges</Text></View>
                </View>
              </View>
              <Text style={styles.levelLabel}>⭐ Level {lvl.levelNo} · {lvl.name}{lvl.isMax ? ' · top tier' : ` · next: ${lvl.nextName}`}</Text>
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <GrowBar progress={lvl.progress} color={SAFFRON} track={SURFACE} height={10} />
              </View>
            </FadeIn>

            {/* Tax set aside */}
            <FadeIn delay={80}>
              <PressableScale style={styles.taxCard} onPress={() => router.push('/tax')}>
                <Text style={styles.taxLabel}>TAX SET ASIDE · THIS YEAR</Text>
                <CountUp value={setAside} format={(n) => '£' + Math.round(n).toLocaleString('en-GB')} style={styles.taxBig} />
                <Text style={styles.taxSub}>Estimated from your profit so far. You approve before anything is filed.</Text>
              </PressableScale>
            </FadeIn>

            {/* Money mini cards */}
            <FadeIn delay={140}>
              <View style={styles.miniRow}>
                <View style={[styles.mini, { backgroundColor: GREEN_TINT }]}><Text style={styles.miniLabel}>Income</Text><Text style={[styles.miniNum, { color: GREEN }]}>{formatGBP(income)}</Text></View>
                <View style={[styles.mini, { backgroundColor: RED_TINT }]}><Text style={styles.miniLabel}>Expenses</Text><Text style={[styles.miniNum, { color: RED }]}>{formatGBP(expenses)}</Text></View>
                <View style={[styles.mini, { backgroundColor: RIVER_TINT }]}><Text style={styles.miniLabel}>Profit</Text><Text style={[styles.miniNum, { color: RIVER }]}>{formatGBP(profit)}</Text></View>
              </View>
            </FadeIn>

            {cisRefund > 0 ? (
              <FadeIn delay={180}>
                <PressableScale style={styles.cisCard} onPress={() => router.push('/cis')}>
                  <Text style={{ fontSize: 22 }}>🏗️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cisTitle}>CIS refund building up</Text>
                    <Text style={styles.cisSub}>HMRC is holding this. It comes back at year end.</Text>
                  </View>
                  <Text style={styles.cisAmt}>{formatGBP(cisRefund)}</Text>
                </PressableScale>
              </FadeIn>
            ) : null}

            {/* Badges */}
            <FadeIn delay={200}>
              <Text style={styles.sectionTitle}>Badges</Text>
              <View style={styles.badgeGrid}>
                {badges.map((b, i) => (
                  <Pop key={b.title} delay={220 + i * 40} style={styles.badgeWrap}>
                    <View style={[styles.badge, b.unlocked ? styles.badgeOn : styles.badgeOff]}>
                      <Text style={{ fontSize: 22, opacity: b.unlocked ? 1 : 0.4 }}>{b.icon}</Text>
                      <Text style={[styles.badgeText, { color: b.unlocked ? SAFFRON_DEEP : MUTED }]} numberOfLines={1}>{b.title}</Text>
                    </View>
                  </Pop>
                ))}
              </View>
            </FadeIn>

            {/* Links */}
            <FadeIn delay={260}>
              <View style={styles.linkCard}>
                <Row emoji="🏆" label="Achievements" onPress={() => router.push('/achievements')} />
                <Row emoji="✨" label="Your Wrapped" onPress={() => router.push('/wrapped')} />
                <Row emoji="🎯" label="Goals" onPress={() => router.push('/goals')} />
                <Row emoji="🏢" label="Business details" onPress={() => router.push('/profile')} />
                <Row emoji="⚙️" label="Settings and admin" onPress={() => router.push('/settings')} />
              </View>
            </FadeIn>
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF7', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: INK, flex: 1, marginRight: 12 },
  scroll: { paddingHorizontal: 18, paddingBottom: 30 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 6 },
  ring: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: SAFFRON, backgroundColor: SAFFRON_TINT },
  ringInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 17, fontWeight: '800', color: INK },
  statLabel: { fontSize: 10.5, color: MUTED, marginTop: 2 },
  levelLabel: { fontSize: 12, fontWeight: '800', color: SAFFRON_DEEP, marginTop: 10, textAlign: 'center' },
  taxCard: { backgroundColor: RIVER, borderRadius: 18, padding: 18, marginTop: 16 },
  taxLabel: { fontSize: 11, fontWeight: '800', color: '#CFE0F2', letterSpacing: 0.6 },
  taxBig: { fontSize: 32, fontWeight: '800', color: WHITE, letterSpacing: -1, marginTop: 4 },
  taxSub: { fontSize: 12, color: '#CFE0F2', marginTop: 6, lineHeight: 17 },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  mini: { flex: 1, borderRadius: 14, padding: 12 },
  miniLabel: { fontSize: 10.5, color: MUTED, fontWeight: '700' },
  miniNum: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  cisCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SAFFRON_TINT, borderWidth: 1, borderColor: '#EAD6A8', borderRadius: 16, padding: 14, marginTop: 12 },
  cisTitle: { fontSize: 14.5, fontWeight: '800', color: INK },
  cisSub: { fontSize: 11.5, color: SAFFRON_DEEP, marginTop: 2 },
  cisAmt: { fontSize: 18, fontWeight: '800', color: SAFFRON_DEEP },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 12, marginLeft: 2 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeWrap: { width: '31.5%' },
  badge: { aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, padding: 6 },
  badgeOn: { backgroundColor: SAFFRON_TINT, borderColor: SAFFRON },
  badgeOff: { backgroundColor: WHITE, borderColor: LINE },
  badgeText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  linkCard: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, marginTop: 20, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0EEE8' },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  chev: { fontSize: 22, color: '#C7C2B6', fontWeight: '700' },
});
