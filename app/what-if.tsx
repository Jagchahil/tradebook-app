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
import { soleTraderTax, TAX } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, GREEN, GREEN_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

type Scenario = 'kit' | 'work' | 'cost' | 'pension';

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

// Marginal rate including Class 4 NI, for a quick pension-relief estimate.
function marginalRate(profit: number): number {
  if (profit <= TAX.personalAllowance) return 0;
  if (profit <= TAX.class4Upper) return 0.26; // 20% + 6%
  if (profit <= 100000) return 0.42; // 40% + 2%
  if (profit <= TAX.additionalThreshold) return 0.62; // PA taper zone + 2%
  return 0.47; // 45% + 2%
}

const SCENARIOS: { key: Scenario; icon: string; label: string; placeholder: string }[] = [
  { key: 'kit', icon: '🛠️', label: 'Buy kit', placeholder: '18,000' },
  { key: 'work', icon: '📈', label: 'Win work', placeholder: '10,000' },
  { key: 'cost', icon: '🧾', label: 'Add a cost', placeholder: '3,000' },
  { key: 'pension', icon: '💷', label: 'Pension', placeholder: '5,000' },
];

export default function WhatIfScreen() {
  const { user } = useCurrentUser();
  const [profit, setProfit] = useState('');
  const [scenario, setScenario] = useState<Scenario>('kit');
  const [amount, setAmount] = useState('');
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
  const amt = parseNum(amount);

  const result = useMemo(() => {
    const taxNow = soleTraderTax(p).total;
    if (amt <= 0) return null;

    if (scenario === 'kit' || scenario === 'cost') {
      const newProfit = Math.max(0, p - amt);
      const taxAfter = soleTraderTax(newProfit).total;
      const saving = Math.max(0, taxNow - taxAfter);
      const realCost = amt - saving;
      const title = scenario === 'kit' ? `${gbp(amt)} of kit` : `${gbp(amt)} of costs`;
      const body =
        scenario === 'kit'
          ? `Equipment like this usually qualifies for 100% Annual Investment Allowance, so the whole ${gbp(amt)} comes off your taxable profit this year. Your tax drops by about ${gbp(saving)}, so the kit really costs you about ${gbp(realCost)}.`
          : `This cost comes off your profit, cutting your tax by about ${gbp(saving)}. So a ${gbp(amt)} cost really sets you back about ${gbp(realCost)}.`;
      return { headline: `You save about ${gbp(saving)} in tax`, tone: 'good' as const, title, body, rows: [['Profit now', gbp(p)], ['Profit after', gbp(newProfit)], ['Tax saved', gbp(saving)]] as [string, string][] };
    }

    if (scenario === 'work') {
      const newProfit = p + amt;
      const taxAfter = soleTraderTax(newProfit).total;
      const extraTax = Math.max(0, taxAfter - taxNow);
      const keep = amt - extraTax;
      const crossesVat = newProfit > TAX_VAT && p <= TAX_VAT;
      return {
        headline: `You keep about ${gbp(keep)} of it`,
        tone: 'good' as const,
        title: `${gbp(amt)} more work`,
        body: `Another ${gbp(amt)} of profit adds about ${gbp(extraTax)} in tax and National Insurance, so you keep around ${gbp(keep)}.${crossesVat ? ' Heads up: this could take your turnover over the £90,000 VAT line, so check whether you need to register.' : ''}`,
        rows: [['Profit now', gbp(p)], ['Profit after', gbp(newProfit)], ['Extra tax', gbp(extraTax)], ['You keep', gbp(keep)]] as [string, string][],
      };
    }

    // pension
    const rate = marginalRate(p);
    const relief = Math.round(amt * rate);
    return {
      headline: `About ${gbp(relief)} back in tax relief`,
      tone: 'good' as const,
      title: `${gbp(amt)} into a pension`,
      body: `A pension payment of ${gbp(amt)} gets tax relief at your rate. At roughly ${Math.round(rate * 100)}% that is about ${gbp(relief)} back, and it builds your future. The way relief is given depends on your scheme, so treat this as a guide.`,
      rows: [['You pay in', gbp(amt)], ['Your tax rate', `${Math.round(rate * 100)}%`], ['Relief, roughly', gbp(relief)]] as [string, string][],
    };
  }, [p, amt, scenario]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>What if…</Text>
          <RiverAccent />
          <Text style={styles.sub}>Try a decision before you make it. See the real tax effect on your own numbers, in seconds.</Text>
        </FadeIn>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Your profit this year</Text>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldPound}>£</Text>
            <TextInput style={styles.fieldInput} inputMode="decimal" value={profit} onChangeText={setProfit} placeholder="40,000" placeholderTextColor="#9CA3AF" />
          </View>
          <Text style={styles.fieldHint}>Prefilled from what you have logged. Change it to model anything.</Text>
        </View>

        <Text style={styles.sectionLabel}>What are you thinking of?</Text>
        <View style={styles.scenRow}>
          {SCENARIOS.map((s) => {
            const active = scenario === s.key;
            return (
              <PressableScale key={s.key} onPress={() => setScenario(s.key)} style={[styles.scen, active ? styles.scenOn : null]}>
                <Text style={styles.scenIcon}>{s.icon}</Text>
                <Text style={[styles.scenLabel, active ? styles.scenLabelOn : null]}>{s.label}</Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{scenario === 'work' ? 'How much more work?' : scenario === 'pension' ? 'How much into the pension?' : scenario === 'kit' ? 'What will the kit cost?' : 'What will the cost be?'}</Text>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldPound}>£</Text>
            <TextInput style={styles.fieldInput} inputMode="decimal" value={amount} onChangeText={setAmount} placeholder={SCENARIOS.find((x) => x.key === scenario)?.placeholder} placeholderTextColor="#9CA3AF" />
          </View>
        </View>

        {result ? (
          <FadeIn delay={60}>
            <View style={styles.resultCard}>
              <Text style={styles.resLabel}>{result.title.toUpperCase()}</Text>
              <Text style={styles.resBig}>{result.headline}</Text>
              <Text style={styles.resBody}>{result.body}</Text>
              <View style={styles.breakdown}>
                {result.rows.map(([k, v]) => (
                  <View key={k} style={styles.bdRow}>
                    <Text style={styles.bdLabel}>{k}</Text>
                    <Text style={styles.bdValue}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Enter an amount above and your answer appears here.</Text>
          </View>
        )}

        <PressableScale style={styles.askBtn} onPress={() => router.push('/accountant')}>
          <Text style={styles.askText}>Ask your accountant about this →</Text>
        </PressableScale>

        <Text style={styles.note}>
          Estimates for 2026/27, for a sole trader, on the figures you enter. Running a company? The relief comes at your corporation tax rate instead, see Pay yourself or ask your accountant. General guidance, not advice for your exact situation.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const TAX_VAT = 90000;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 44 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  card: { marginHorizontal: 24, marginTop: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 },
  fieldLabel: { fontSize: 13.5, fontWeight: '700', color: INK, marginBottom: 6 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: LINE, borderRadius: 12, overflow: 'hidden' },
  fieldPound: { paddingHorizontal: 12, paddingVertical: 12, backgroundColor: SURFACE, color: MUTED, fontWeight: '700', fontSize: 16 },
  fieldInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: INK },
  fieldHint: { fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: MUTED, letterSpacing: 0.6, marginHorizontal: 24, marginTop: 20, marginBottom: 8 },
  scenRow: { flexDirection: 'row', gap: 8, marginHorizontal: 24 },
  scen: { flex: 1, backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 4 },
  scenOn: { backgroundColor: RIVER_TINT, borderColor: RIVER },
  scenIcon: { fontSize: 20 },
  scenLabel: { fontSize: 12.5, fontWeight: '700', color: INK },
  scenLabelOn: { color: RIVER },
  resultCard: { marginHorizontal: 24, marginTop: 16, backgroundColor: GREEN_TINT, borderWidth: 1, borderColor: '#CFE9D8', borderRadius: 18, padding: 22 },
  resLabel: { fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 0.8 },
  resBig: { fontSize: 26, fontWeight: '800', color: INK, letterSpacing: -0.8, marginTop: 5 },
  resBody: { fontSize: 14, color: '#2C6B45', lineHeight: 21, marginTop: 10 },
  breakdown: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 14 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 5 },
  bdLabel: { fontSize: 14, color: INK },
  bdValue: { fontSize: 14.5, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  empty: { marginHorizontal: 24, marginTop: 16, backgroundColor: SURFACE, borderWidth: 1, borderStyle: 'dashed', borderColor: LINE, borderRadius: 16, padding: 22, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center' },
  askBtn: { marginHorizontal: 24, marginTop: 16, backgroundColor: RIVER, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  askText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  note: { fontSize: 12, color: MUTED, lineHeight: 18, marginHorizontal: 24, marginTop: 16 },
});
