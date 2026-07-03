import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../lib/supabase';
import { formatGBP, formatSignedGBP, signedAmount, txDate } from '../lib/format';
import { soleTraderTax } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, RIVER_DEEP, GREEN, RED, SAFFRON_DEEP, SAFFRON_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, CountUp, RiverAccent } from '../components/Motion';

function getCurrentQuarter(): { label: string; start: Date; end: Date } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const ukTaxYearStart = month >= 3 ? year : year - 1;
  const monthInTaxYear = month >= 3 ? month - 3 : month + 9;
  const quarter = Math.floor(monthInTaxYear / 3);
  const quarterStartMonths = [3, 6, 9, 0];
  const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const quarterMonthNames = ['Apr to Jun', 'Jul to Sep', 'Oct to Dec', 'Jan to Mar'];
  const qStartMonth = quarterStartMonths[quarter];
  const qYear = quarter === 3 ? ukTaxYearStart + 1 : ukTaxYearStart;
  const nextYear = (ukTaxYearStart + 1).toString().slice(2);
  const start = new Date(qYear, qStartMonth, 1, 0, 0, 0, 0);
  const endMonth = (qStartMonth + 3) % 12;
  const endYear = qStartMonth + 3 >= 12 ? qYear + 1 : qYear;
  const end = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
  return { label: `${quarterLabels[quarter]} ${ukTaxYearStart}/${nextYear} · ${quarterMonthNames[quarter]}`, start, end };
}

export default function TaxSummaryScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);

  const quarter = useMemo(() => getCurrentQuarter(), []);

  useEffect(() => {
    if (!user) return;
    getTransactions(user.id)
      .then(({ data }) => setTransactions(data ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  const inQuarter = transactions.filter((t) => {
    const d = new Date(txDate(t));
    return !Number.isNaN(d.getTime()) && d >= quarter.start && d <= quarter.end && t.confirmed === true;
  });

  const income = inQuarter.filter((t) => signedAmount(t) > 0).reduce((s, t) => s + signedAmount(t), 0);
  const expenses = inQuarter.filter((t) => signedAmount(t) < 0).reduce((s, t) => s + Math.abs(signedAmount(t)), 0);
  const profit = income - expenses;
  const cisTotal = inQuarter.reduce((s, t) => s + (t.cis_deduction ?? 0), 0);
  // Estimate the quarter's share of the year's tax. Annualise this quarter's
  // profit, run it through the real 2026/27 engine (so the personal allowance
  // and the correct bands apply), then take a quarter of that and net off any
  // CIS already deducted. Far closer than a flat percentage of profit.
  const annualisedTax = profit > 0 ? soleTraderTax(profit * 4).total : 0;
  const setAside = profit > 0 ? Math.max(0, annualisedTax / 4 - cisTotal) : 0;

  // Expense breakdown by category.
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of inQuarter) {
      if (signedAmount(t) >= 0) continue;
      const cat = (t.category || 'other').toLowerCase();
      map.set(cat, (map.get(cat) ?? 0) + Math.abs(signedAmount(t)));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [inQuarter]);

  function handleApprove() {
    setApproved(true);
    Alert.alert(
      'Summary approved',
      'These figures are marked as checked and ready. When Making Tax Digital submission is switched on, you will send this to HMRC through a recognised route. Nothing is ever sent without you.',
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PAPER} />
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} style={styles.backHit}>
          <Text style={styles.back}>{'←'}</Text>
        </PressableScale>
        <Text style={styles.topTitle}>Quarterly summary</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={RIVER} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <FadeIn>
            <Text style={styles.quarter}>{quarter.label}</Text>
            <RiverAccent />
            <Text style={styles.intro}>Built from the {inQuarter.length} {inQuarter.length === 1 ? 'entry you have' : 'entries you have'} confirmed this quarter.</Text>
          </FadeIn>

          <FadeIn delay={80} style={styles.bigCard}>
            <Text style={styles.bigLabel}>Profit this quarter</Text>
            <CountUp value={profit} delay={80} format={formatSignedGBP} style={[styles.bigValue, { color: profit < 0 ? RED : RIVER }]} />
            <View style={styles.splitRow}>
              <View style={styles.splitItem}>
                <Text style={styles.splitLabel}>Income</Text>
                <Text style={[styles.splitValue, { color: GREEN }]}>{formatGBP(income)}</Text>
              </View>
              <View style={styles.splitDivider} />
              <View style={styles.splitItem}>
                <Text style={styles.splitLabel}>Expenses</Text>
                <Text style={[styles.splitValue, { color: RED }]}>{formatGBP(expenses)}</Text>
              </View>
            </View>
          </FadeIn>

          {/* Set aside for tax */}
          <FadeIn delay={140}>
            <View style={styles.setAside}>
              <Text style={styles.setAsideIcon}>🐷</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.setAsideTitle}>Set aside roughly {formatGBP(setAside)}</Text>
                <Text style={styles.setAsideSub}>A rough guide, worked out from the 2026/27 tax and National Insurance rates. This is an estimate, not tax advice. Your real bill depends on your full year and allowances.</Text>
              </View>
            </View>
          </FadeIn>

          {cisTotal > 0 ? (
            <FadeIn delay={170}>
              <View style={styles.cisLine}>
                <Text style={styles.cisLineText}>🏗️ £{cisTotal.toFixed(0)} of CIS already deducted is tax paid, so we took it off what you owe. Often a refund.</Text>
              </View>
            </FadeIn>
          ) : null}

          {/* Breakdown */}
          {byCategory.length > 0 ? (
            <FadeIn delay={200}>
              <Text style={styles.sectionLabel}>Where the money went</Text>
              <View style={styles.breakdownCard}>
                {byCategory.map(([cat, amount], i) => {
                  const pct = expenses > 0 ? Math.round((amount / expenses) * 100) : 0;
                  return (
                    <View key={cat} style={[styles.breakRow, i > 0 ? styles.breakBorder : null]}>
                      <Text style={styles.breakCat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                      <View style={styles.breakBarTrack}>
                        <View style={[styles.breakBarFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.breakAmount}>{formatGBP(amount)}</Text>
                    </View>
                  );
                })}
              </View>
            </FadeIn>
          ) : null}

          <FadeIn delay={260}>
            <View style={styles.note}>
              <Text style={styles.noteText}>
                Lekhio prepares this summary. You check it and approve it. When HMRC submission is switched on, it goes through a recognised route, and never without you. HMRC keeps you responsible for your tax.
              </Text>
            </View>
          </FadeIn>

          <FadeIn delay={320}>
            {approved ? (
              <View style={styles.approvedPill}>
                <Text style={styles.approvedText}>✓ Approved and ready to send when filing opens</Text>
              </View>
            ) : (
              <PressableScale style={styles.approveButton} onPress={handleApprove}>
                <Text style={styles.approveLabel}>Approve these figures</Text>
              </PressableScale>
            )}
          </FadeIn>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backHit: { paddingHorizontal: 4, paddingVertical: 2 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  quarter: { fontSize: 22, fontWeight: '800', color: INK, marginTop: 8, letterSpacing: -0.5 },
  intro: { fontSize: 14, color: MUTED, marginTop: 12, lineHeight: 20 },
  bigCard: {
    backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 22, marginTop: 18,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(17,17,17,0.05)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }),
  },
  bigLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
  bigValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, marginTop: 6 },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, borderTopWidth: 1, borderTopColor: SURFACE, paddingTop: 16 },
  splitItem: { flex: 1 },
  splitDivider: { width: 1, height: 34, backgroundColor: SURFACE },
  splitLabel: { fontSize: 12, color: MUTED, fontWeight: '600', marginBottom: 4 },
  splitValue: { fontSize: 18, fontWeight: '800' },
  setAside: { flexDirection: 'row', gap: 12, backgroundColor: SAFFRON_TINT, borderRadius: 14, padding: 16, marginTop: 16 },
  setAsideIcon: { fontSize: 22 },
  setAsideTitle: { fontSize: 15, fontWeight: '800', color: SAFFRON_DEEP },
  setAsideSub: { fontSize: 12.5, color: '#8A6A33', lineHeight: 18, marginTop: 4 },
  cisLine: { backgroundColor: '#E7F5EC', borderRadius: 12, padding: 14, marginTop: 12 },
  cisLineText: { fontSize: 13, color: GREEN, lineHeight: 19, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },
  breakdownCard: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, paddingHorizontal: 16 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  breakBorder: { borderTopWidth: 1, borderTopColor: SURFACE },
  breakCat: { fontSize: 14, fontWeight: '600', color: INK, width: 92 },
  breakBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: SURFACE, overflow: 'hidden' },
  breakBarFill: { height: 8, borderRadius: 4, backgroundColor: RIVER },
  breakAmount: { fontSize: 13.5, fontWeight: '700', color: INK, width: 72, textAlign: 'right' },
  note: { backgroundColor: RIVER_TINT, borderRadius: 12, padding: 16, marginTop: 22 },
  noteText: { fontSize: 13, color: RIVER_DEEP, lineHeight: 20 },
  approveButton: { backgroundColor: RIVER, borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 20 },
  approveLabel: { color: WHITE, fontSize: 16, fontWeight: '700' },
  approvedPill: { backgroundColor: '#DCFCE7', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 20 },
  approvedText: { color: GREEN, fontSize: 15, fontWeight: '700' },
});
