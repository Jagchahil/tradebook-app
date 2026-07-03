import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../lib/supabase';
import { taxYearStart } from '../lib/goal';
import { soleTraderTax, planLtd, TAX } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

export default function PayYourselfScreen() {
  const { user } = useCurrentUser();
  const [mode, setMode] = useState<'sole' | 'ltd'>('sole');
  const [profit, setProfit] = useState('');
  const [fixed, setFixed] = useState('');
  const [salary, setSalary] = useState<number>(TAX.salaryOptions[0]);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!user || prefilled) return;
    getTransactions(user.id).then((r) => {
      const txns = (r.data ?? []) as Transaction[];
      const start = taxYearStart(new Date());
      let inc = 0;
      let exp = 0;
      for (const t of txns) {
        if (new Date(t.transaction_date || t.created_at) < start) continue;
        const a = Number(t.amount) || 0;
        if (a >= 0) inc += a;
        else exp += Math.abs(a);
      }
      const p = Math.max(0, inc - exp);
      if (p > 0) setProfit(String(Math.round(p)));
      setPrefilled(true);
    });
  }, [user, prefilled]);

  const p = parseNum(profit);
  const monthlyFixed = parseNum(fixed);

  const sole = useMemo(() => {
    const t = soleTraderTax(p);
    const afterTax = Math.max(0, p - t.total);
    const monthly = afterTax / 12;
    return { tax: t.total, afterTax, monthly, leftover: monthly - monthlyFixed };
  }, [p, monthlyFixed]);

  const ltd = useMemo(() => {
    const plan = planLtd(p, salary);
    const monthly = plan.takeHome / 12;
    const soleTax = soleTraderTax(p).total;
    return { plan, monthly, leftover: monthly - monthlyFixed, soleTax };
  }, [p, salary, monthlyFixed]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Pay yourself</Text>
          <RiverAccent />
          <Text style={styles.sub}>How to take money out of your business in the most tax efficient way, from your real numbers. An estimate to guide you, not advice for your exact situation.</Text>
        </FadeIn>

        {/* Mode */}
        <View style={styles.toggleRow}>
          {([['sole', 'Sole trader'], ['ltd', 'Limited company']] as const).map(([k, label]) => {
            const active = mode === k;
            return (
              <PressableScale key={k} onPress={() => setMode(k)} style={[styles.toggle, active ? styles.toggleOn : null]}>
                <Text style={[styles.toggleText, active ? styles.toggleTextOn : null]}>{label}</Text>
              </PressableScale>
            );
          })}
        </View>

        {/* Inputs */}
        <View style={styles.card}>
          <Field label={mode === 'sole' ? 'Your profit this year' : 'Company profit, before your pay'} hint={mode === 'sole' ? 'Income less your costs. Prefilled from what you have logged.' : 'What is left in the company before you pay yourself.'} value={profit} onChange={setProfit} placeholder="40,000" />
          <Field label="Your fixed costs each month" hint="Rent, your own bills, anything you must cover. Optional." value={fixed} onChange={setFixed} placeholder="1,500" />
        </View>

        {mode === 'sole' ? (
          <FadeIn delay={70}>
            <View style={styles.resultCard}>
              <Text style={styles.resLabel}>YOU CAN TAKE ABOUT</Text>
              <Text style={styles.resBig}>{gbp(sole.monthly)}<Text style={styles.resPer}> / month</Text></Text>
              <Text style={styles.resBody}>As a sole trader, your drawings are not taxed again. You are taxed on your profit, so set the tax aside and the rest is yours.</Text>
              <View style={styles.breakdown}>
                <Row label="Profit" value={gbp(p)} />
                <Row label="Income tax and Class 4 NI" value={gbp(sole.tax)} muted />
                <Row label="Yours after tax" value={gbp(sole.afterTax)} bold />
              </View>
              {monthlyFixed > 0 ? (
                <Text style={styles.leftover}>After your {gbp(monthlyFixed)} of monthly costs, about <Text style={{ fontWeight: '800', color: sole.leftover >= 0 ? GREEN : '#B42318' }}>{gbp(Math.abs(sole.leftover))}</Text> {sole.leftover >= 0 ? 'is left each month' : 'short each month'}.</Text>
              ) : null}
            </View>
          </FadeIn>
        ) : (
          <FadeIn delay={70}>
            {/* Salary choice */}
            <Text style={styles.sectionLabel}>A tax efficient salary</Text>
            <View style={styles.salaryRow}>
              {TAX.salaryOptions.map((s) => {
                const active = salary === s;
                return (
                  <PressableScale key={s} onPress={() => setSalary(s)} style={[styles.salaryChip, active ? styles.salaryChipOn : null]}>
                    <Text style={[styles.salaryChipText, active ? styles.salaryChipTextOn : null]}>{gbp(s)}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={styles.salaryHint}>{salary === 12570 ? 'Uses your full personal allowance. Best for most single directors, even with a little employer NI.' : salary === 6708 ? 'Keeps a qualifying year for your state pension with no NI to pay.' : 'No employer NI at all. Simplest, but you bank less allowance.'}</Text>

            <View style={styles.resultCard}>
              <Text style={styles.resLabel}>YOU TAKE HOME</Text>
              <Text style={styles.resBig}>{gbp(ltd.plan.takeHome)}<Text style={styles.resPer}> / year</Text></Text>
              <Text style={styles.resBody}>Salary of {gbp(ltd.plan.salary)} plus {gbp(ltd.plan.dividends)} in dividends, after all the tax below. That is about {gbp(ltd.monthly)} a month.</Text>
              <View style={styles.breakdown}>
                <Row label="Salary" value={gbp(ltd.plan.salary)} />
                <Row label="Employer NI" value={gbp(ltd.plan.employerNI)} muted />
                <Row label="Corporation tax" value={gbp(ltd.plan.corpTax)} muted />
                <Row label="Dividends" value={gbp(ltd.plan.dividends)} />
                <Row label="Dividend tax" value={gbp(ltd.plan.divTax)} muted />
                <View style={styles.divider} />
                <Row label="Total tax" value={gbp(ltd.plan.totalTax)} bold />
                <Row label="Effective tax rate" value={`${ltd.plan.effectiveRate}%`} muted />
              </View>
              {monthlyFixed > 0 ? (
                <Text style={styles.leftover}>After your {gbp(monthlyFixed)} of monthly costs, about <Text style={{ fontWeight: '800', color: ltd.leftover >= 0 ? GREEN : '#B42318' }}>{gbp(Math.abs(ltd.leftover))}</Text> {ltd.leftover >= 0 ? 'is left each month' : 'short each month'}.</Text>
              ) : null}
            </View>

            <View style={styles.compareCard}>
              <Text style={styles.compareText}>On the same £{Math.round(p).toLocaleString('en-GB')}, a sole trader would pay about <Text style={{ fontWeight: '800' }}>{gbp(ltd.soleTax)}</Text> in tax and NI. As a company this way, about <Text style={{ fontWeight: '800' }}>{gbp(ltd.plan.totalTax)}</Text>. {ltd.plan.totalTax < ltd.soleTax ? 'The company is ahead here, but it comes with more admin and filing.' : 'They are close at this level, so the simpler sole trader route may suit you. Higher profits usually favour a company.'}</Text>
            </View>
          </FadeIn>
        )}

        {/* Paying employees */}
        <FadeIn delay={120}>
          <View style={styles.empCard}>
            <Text style={styles.empTitle}>Paying staff tax efficiently</Text>
            <Text style={styles.empBody}>
              A few honest, legal ways to keep employer costs down: pay into a workplace pension, which lowers your taxable profit and the tax on their pay; claim the Employment Allowance of up to {gbp(10500)} a year off your employer NI if you have staff beyond a single director; use trivial benefits of up to £50; and offer pension salary sacrifice. The right mix depends on your team and pay.
            </Text>
            <PressableScale style={styles.empBtn} onPress={() => router.push('/accountant')}>
              <Text style={styles.empBtnText}>Ask your accountant about your setup →</Text>
            </PressableScale>
          </View>
        </FadeIn>

        <Text style={styles.note}>
          Estimates for 2026/27, England, Wales and Northern Ireland. The limited company figures assume a single director with no Employment Allowance and that you take all the available profit as dividends. Your real position depends on your other income, pension, and circumstances. This is general guidance, not advice for your exact situation. Speak to a qualified accountant before you decide, and you always approve what is filed.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, hint, value, onChange, placeholder }: { label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldPound}>£</Text>
        <TextInput style={styles.fieldInput} inputMode="decimal" value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9CA3AF" />
      </View>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={styles.bdRow}>
      <Text style={[styles.bdLabel, bold ? styles.bdBold : null]}>{label}</Text>
      <Text style={[styles.bdValue, bold ? styles.bdBold : null, muted ? { color: MUTED } : null]}>{value}</Text>
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
  card: { marginHorizontal: 24, marginTop: 16, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 20 },
  fieldLabel: { fontSize: 13.5, fontWeight: '700', color: INK, marginBottom: 6 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: LINE, borderRadius: 12, overflow: 'hidden' },
  fieldPound: { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: SURFACE, color: MUTED, fontWeight: '700', fontSize: 16 },
  fieldInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: INK },
  fieldHint: { fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: MUTED, letterSpacing: 0.6, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  salaryRow: { flexDirection: 'row', gap: 8, marginHorizontal: 24 },
  salaryChip: { flex: 1, backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  salaryChipOn: { backgroundColor: RIVER_TINT, borderColor: RIVER },
  salaryChipText: { fontSize: 14.5, fontWeight: '700', color: INK },
  salaryChipTextOn: { color: RIVER },
  salaryHint: { fontSize: 12.5, color: MUTED, marginHorizontal: 24, marginTop: 8, lineHeight: 18 },
  resultCard: { marginHorizontal: 24, marginTop: 16, backgroundColor: GREEN_TINT, borderWidth: 1, borderColor: '#CFE9D8', borderRadius: 18, padding: 22 },
  resLabel: { fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 0.8 },
  resBig: { fontSize: 38, fontWeight: '800', color: INK, letterSpacing: -1.4, marginTop: 4 },
  resPer: { fontSize: 16, fontWeight: '700', color: MUTED, letterSpacing: 0 },
  resBody: { fontSize: 13.5, color: '#2C6B45', lineHeight: 20, marginTop: 8 },
  breakdown: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 14 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 5 },
  bdLabel: { fontSize: 14, color: INK },
  bdValue: { fontSize: 14.5, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  bdBold: { fontWeight: '800', fontSize: 15.5 },
  divider: { height: 1, backgroundColor: '#CFE9D8', marginVertical: 7 },
  leftover: { fontSize: 13.5, color: INK, marginTop: 14, lineHeight: 20 },
  compareCard: { marginHorizontal: 24, marginTop: 14, backgroundColor: RIVER_TINT, borderWidth: 1, borderColor: '#C9DEF5', borderRadius: 14, padding: 16 },
  compareText: { fontSize: 13.5, color: INK, lineHeight: 20 },
  empCard: { marginHorizontal: 24, marginTop: 20, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 },
  empTitle: { fontSize: 16, fontWeight: '800', color: INK },
  empBody: { fontSize: 13.5, color: MUTED, lineHeight: 20, marginTop: 6 },
  empBtn: { marginTop: 12, backgroundColor: RIVER, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  empBtnText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  note: { fontSize: 12, color: MUTED, lineHeight: 18, marginHorizontal: 24, marginTop: 18 },
});
