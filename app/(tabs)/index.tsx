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
  Linking,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../../lib/supabase';
import { formatGBP, signedAmount, isIncome, categoryEmoji, txDate } from '../../lib/format';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, SURFACE, LINE, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale, CountUp, RiverAccent, Skeleton } from '../../components/Motion';
import { taxYearStart } from '../../lib/goal';
import { soleTraderTax } from '../../lib/tax';

const SAFFRON_TINT = '#FBEFD8';
const SAFFRON_DEEP = '#C9842A';

const LEKHIO_WA = '447593214044';
const WA_LINK = `https://wa.me/${LEKHIO_WA}?text=${encodeURIComponent('Get started')}`;

// Consecutive days, ending today or yesterday, that have at least one entry.
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

function relativeDay(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const webShadow = Platform.OS === 'web' ? ({ boxShadow: '0 6px 18px rgba(17,17,17,0.06)' } as any) : {};

function FeedCard({ item, index }: { item: Transaction; index: number }) {
  const income = isIncome(item);
  const amountColour = income ? GREEN : INK;
  const icon = categoryEmoji(item.category);
  const needsReview = item.confirmed === false;
  const cis = item.cis_deduction ?? 0;
  return (
    <FadeIn delay={60 + index * 55}>
      <PressableScale style={[styles.card, webShadow]} onPress={() => router.push(`/transaction/${item.id}`)}>
        <View style={styles.cardHead}>
          <View style={[styles.iconTile, { backgroundColor: income ? GREEN_TINT : SURFACE }]}>
            <Text style={{ fontSize: 16 }}>{icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.merchant} numberOfLines={1}>{item.merchant_name || (income ? 'Payment in' : 'Expense')}</Text>
            <Text style={styles.sub}>{item.category || 'General'} · {relativeDay(txDate(item))}</Text>
          </View>
          <Text style={[styles.amount, { color: amountColour }]}>{income ? '+' : '−'}{formatGBP(item.amount)}</Text>
        </View>
        {(needsReview || cis > 0) ? (
          <View style={styles.chipRow}>
            {cis > 0 ? (
              <View style={[styles.chip, { backgroundColor: SAFFRON_TINT }]}>
                <Text style={[styles.chipText, { color: SAFFRON_DEEP }]}>🏗️ CIS {formatGBP(cis)} held</Text>
              </View>
            ) : null}
            {needsReview ? (
              <View style={[styles.chip, { backgroundColor: RIVER_TINT }]}>
                <Text style={[styles.chipText, { color: RIVER }]}>To review</Text>
              </View>
            ) : (
              <View style={[styles.chip, { backgroundColor: GREEN_TINT }]}>
                <Text style={[styles.chipText, { color: GREEN }]}>✓ Confirmed</Text>
              </View>
            )}
          </View>
        ) : null}
      </PressableScale>
    </FadeIn>
  );
}

export default function FeedScreen() {
  const { user } = useCurrentUser();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setHasError(false);
    const res = await getTransactions(user.id);
    if (res.error) setHasError(true);
    setTxs(res.data ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Confirmed entries only for the money figures, so an unreviewed entry never
  // inflates the numbers. Year to date, current tax year.
  const yearStart = taxYearStart();
  const confirmed = txs.filter((t) => t.confirmed !== false && new Date(txDate(t)) >= yearStart);
  const profit = confirmed.reduce((sum, t) => sum + signedAmount(t), 0);
  const setAside = Math.max(0, Math.round(soleTraderTax(Math.max(0, profit)).total));
  const streak = loggingStreak(txs);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>Your Lekhio</Text>
          <RiverAccent width={30} />
        </View>
        <PressableScale onPress={() => router.push('/you')}>
          <View style={styles.avatar}><Text style={{ fontSize: 16 }}>👷</Text></View>
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} />}
      >
        {/* Tax set aside strip */}
        <FadeIn>
          <PressableScale style={styles.taxCard} onPress={() => router.push('/tax')}>
            <Text style={styles.taxLabel}>TAX SET ASIDE · THIS YEAR</Text>
            <CountUp value={setAside} format={(n) => '£' + Math.round(n).toLocaleString('en-GB')} style={styles.taxBig} />
            <Text style={styles.taxSub}>Profit so far {formatGBP(profit)} · tap for the full picture</Text>
          </PressableScale>
        </FadeIn>

        {/* Streak */}
        {streak >= 2 ? (
          <FadeIn delay={80}>
            <View style={styles.streakCard}>
              <Text style={{ fontSize: 22 }}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakTitle}>{streak}-day logging streak</Text>
                <Text style={styles.streakSub}>Keep it going. A tidy book is a happy January.</Text>
              </View>
            </View>
          </FadeIn>
        ) : null}

        <Text style={styles.sectionTitle}>Recent</Text>

        {loading ? (
          <View style={{ gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.card, webShadow]}>
                <View style={styles.cardHead}>
                  <Skeleton width={44} height={44} radius={13} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width={'70%'} height={13} />
                    <Skeleton width={'40%'} height={11} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : hasError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>😕</Text>
            <Text style={styles.emptyTitle}>Could not load your feed</Text>
            <Text style={styles.emptySub}>Pull down to try again.</Text>
          </View>
        ) : txs.length === 0 ? (
          <FadeIn>
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📥</Text>
              <Text style={styles.emptyTitle}>Your feed is ready</Text>
              <Text style={styles.emptySub}>Nothing logged yet. Text your first receipt or expense and it lands right here.</Text>
              <PressableScale style={styles.emptyBtn} onPress={() => Linking.openURL(WA_LINK)}>
                <Text style={styles.emptyBtnText}>💬 Send your first one</Text>
              </PressableScale>
            </View>
          </FadeIn>
        ) : (
          txs.map((t, i) => <FeedCard key={t.id} item={t} index={i} />)
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFAF7', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  brand: { fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.5 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: SAFFRON_TINT, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: WHITE },
  scroll: { paddingHorizontal: 18, paddingBottom: 30 },
  taxCard: { backgroundColor: RIVER, borderRadius: 18, padding: 18, marginBottom: 12 },
  taxLabel: { fontSize: 11, fontWeight: '800', color: '#CFE0F2', letterSpacing: 0.6 },
  taxBig: { fontSize: 32, fontWeight: '800', color: WHITE, letterSpacing: -1, marginTop: 4 },
  taxSub: { fontSize: 12.5, color: '#CFE0F2', marginTop: 4 },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SAFFRON_TINT, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EAD6A8' },
  streakTitle: { fontSize: 15, fontWeight: '800', color: INK },
  streakSub: { fontSize: 12.5, color: SAFFRON_DEEP, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 13, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconTile: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  merchant: { fontSize: 14.5, fontWeight: '700', color: INK },
  sub: { fontSize: 12, color: MUTED, marginTop: 2 },
  amount: { fontSize: 17, fontWeight: '800' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0EEE8' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 10.5, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: INK, marginBottom: 6 },
  emptySub: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  emptyBtn: { backgroundColor: RIVER, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 22 },
  emptyBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
