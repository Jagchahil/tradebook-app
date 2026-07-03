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
import { getTransactions, getUserProfile, Transaction } from '../lib/supabase';
import { taxYearStart } from '../lib/goal';
import { soleTraderTax } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, GREEN, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

function gbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function yearLabel(start: Date): string {
  const end = new Date(start.getFullYear() + 1, 3, 5);
  const f = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
  return `${f(start)} to ${f(end)}`;
}

function summarise(txns: Transaction[], from: Date, to: Date) {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (t.confirmed !== true) continue; // proof of income must rest on approved figures only
    const d = new Date(t.transaction_date || t.created_at);
    if (d < from || d >= to) continue;
    const a = Number(t.amount) || 0;
    if (a >= 0) income += a;
    else expenses += Math.abs(a);
  }
  const profit = Math.max(0, income - expenses);
  const tax = soleTraderTax(profit).total;
  return { income, expenses, profit, tax };
}

export default function ProofOfIncomeScreen() {
  const { user } = useCurrentUser();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState('My business');
  const [which, setWhich] = useState<'current' | 'previous'>('current');

  useEffect(() => {
    if (!user) return;
    getTransactions(user.id).then((r) => setTxns(r.data ?? []));
    getUserProfile(user.id).then((p) => {
      if (p) setBusiness(p.business_name || p.name || 'My business');
    });
  }, [user]);

  const curStart = taxYearStart(new Date());
  const prevStart = taxYearStart(new Date(curStart.getTime() - 86400000));
  const start = which === 'current' ? curStart : prevStart;
  const end = which === 'current' ? new Date(curStart.getFullYear() + 1, 3, 6) : curStart;
  const s = summarise(txns, start, end);
  const period = yearLabel(start);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasData = s.income > 0 || s.expenses > 0;

  async function share() {
    const lines = [
      `INCOME SUMMARY. ${business}`,
      `Tax year: ${period}`,
      '',
      `Gross income:        ${gbp(s.income)}`,
      `Allowable expenses:  ${gbp(s.expenses)}`,
      `Net profit:          ${gbp(s.profit)}`,
      `Estimated tax & NI:  ${gbp(s.tax)}`,
      '',
      `Prepared by Lekhio on ${today} from the records kept by ${business}.`,
      `This is a summary for income verification, not an HMRC document or a filed return.`,
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user cancelled
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Proof of income</Text>
          <RiverAccent />
          <Text style={styles.sub}>A clean income summary for a mortgage, a loan or a letting agent. Built from your records, in one tap. No waiting on an accountant.</Text>
        </FadeIn>

        {/* Period toggle */}
        <View style={styles.toggleRow}>
          {(['current', 'previous'] as const).map((k) => {
            const active = which === k;
            return (
              <PressableScale key={k} onPress={() => setWhich(k)} style={[styles.toggle, active ? styles.toggleOn : null]}>
                <Text style={[styles.toggleText, active ? styles.toggleTextOn : null]}>{k === 'current' ? 'This tax year' : 'Last tax year'}</Text>
              </PressableScale>
            );
          })}
        </View>

        {!hasData ? (
          <View style={styles.emptyBanner}>
            <Text style={styles.emptyBannerText}>Nothing logged for this tax year yet. Your summary fills in as you add income and costs, then you can share it.</Text>
          </View>
        ) : null}

        {/* The statement */}
        <FadeIn delay={90}>
          <View style={styles.statement}>
            <View style={styles.stHead}>
              <Text style={styles.stBiz}>{business}</Text>
              <Text style={styles.stPeriod}>Income summary · {period}</Text>
            </View>
            <Row label="Gross income" value={gbp(s.income)} />
            <Row label="Allowable expenses" value={gbp(s.expenses)} muted />
            <View style={styles.divider} />
            <Row label="Net profit" value={gbp(s.profit)} bold />
            <Row label="Estimated tax and NI" value={gbp(s.tax)} muted />
            <View style={styles.stamp}>
              <Text style={styles.stampText}>Prepared by Lekhio · {today}</Text>
            </View>
          </View>
        </FadeIn>

        {hasData ? (
          <PressableScale style={styles.shareBtn} onPress={share} accessibilityRole="button" accessibilityLabel="Share income summary">
            <Text style={styles.shareText}>Share this summary</Text>
          </PressableScale>
        ) : null}

        <Text style={styles.note}>
          This is a summary built from the figures you have logged, for income verification. It is not an HMRC document, an SA302, or a filed return, and it is only as complete as what you have logged. For an official SA302, log in to your HMRC account. For lending decisions, some providers ask for HMRC documents too.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold ? styles.rowBold : null]}>{label}</Text>
      <Text style={[styles.rowValue, bold ? styles.rowBold : null, muted ? { color: MUTED } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 44 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  toggleRow: { flexDirection: 'row', gap: 10, marginHorizontal: 24, marginTop: 16 },
  toggle: { flex: 1, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  toggleOn: { backgroundColor: RIVER_TINT, borderColor: RIVER },
  toggleText: { fontSize: 14, fontWeight: '700', color: INK },
  toggleTextOn: { color: RIVER },
  statement: { marginHorizontal: 24, marginTop: 16, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 22, ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(17,17,17,0.06)' } as object) : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 }) },
  stHead: { borderBottomWidth: 1, borderBottomColor: SURFACE, paddingBottom: 14, marginBottom: 12 },
  stBiz: { fontSize: 20, fontWeight: '800', color: INK },
  stPeriod: { fontSize: 13, color: MUTED, marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 7 },
  rowLabel: { fontSize: 15, color: INK },
  rowValue: { fontSize: 15.5, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  rowBold: { fontWeight: '800', fontSize: 17 },
  divider: { height: 1, backgroundColor: SURFACE, marginVertical: 8 },
  stamp: { marginTop: 16, backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  stampText: { fontSize: 11.5, fontWeight: '700', color: GREEN, letterSpacing: 0.3 },
  emptyBanner: { marginHorizontal: 24, marginTop: 14, backgroundColor: RIVER_TINT, borderWidth: 1, borderColor: '#C9DEF5', borderRadius: 14, padding: 16 },
  emptyBannerText: { fontSize: 13.5, color: RIVER, lineHeight: 20 },
  shareBtn: { marginHorizontal: 24, marginTop: 18, backgroundColor: RIVER, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shareText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  note: { fontSize: 12, color: MUTED, lineHeight: 18, marginHorizontal: 24, marginTop: 16 },
});
