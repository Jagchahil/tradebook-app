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
import { taxYearStart } from '../lib/goal';
import { soleTraderTax } from '../lib/tax';
import { INK, RIVER, RIVER_TINT, GREEN, RED, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent, GrowBar, CountUp } from '../components/Motion';

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

const CAT_LABEL: Record<string, string> = {
  tools: 'Tools',
  materials: 'Materials',
  stock: 'Stock',
  fuel: 'Fuel',
  mileage: 'Mileage',
  travel: 'Travel',
  van: 'Vehicle',
  meals: 'Food and drink',
  phone: 'Phone and broadband',
  home: 'Home office',
  premises: 'Premises',
  rent: 'Rent',
  insurance: 'Insurance',
  subcontractor: 'Subcontractors',
  wages: 'Wages',
  accountancy: 'Accountancy',
  advertising: 'Advertising',
  other: 'Other',
};

function label(cat: string): string {
  const c = (cat || 'other').toLowerCase();
  return CAT_LABEL[c] || (c.charAt(0).toUpperCase() + c.slice(1));
}

export default function YearSummaryScreen() {
  const { user } = useCurrentUser();
  const [txns, setTxns] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user) return;
    getTransactions(user.id).then((r) => setTxns(r.data ?? []));
  }, [user]);

  const start = taxYearStart(new Date());
  const yearLabel = `${start.getFullYear()}/${String((start.getFullYear() + 1) % 100).padStart(2, '0')}`;
  const ytd = txns.filter((t) => t.confirmed === true && new Date(t.transaction_date || t.created_at) >= start);

  let income = 0;
  let expenses = 0;
  const byCat: Record<string, number> = {};
  for (const t of ytd) {
    const a = Number(t.amount) || 0;
    if (a >= 0) income += a;
    else {
      const e = Math.abs(a);
      expenses += e;
      const c = (t.category || 'other').toLowerCase();
      byCat[c] = (byCat[c] || 0) + e;
    }
  }
  const profit = Math.max(0, income - expenses);
  const tax = soleTraderTax(profit).total;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Your money, {yearLabel}</Text>
          <RiverAccent />
          <Text style={styles.sub}>The whole year in one place. Where it came in, where it went, and what to set aside.</Text>
        </FadeIn>

        {/* Headline */}
        <View style={styles.row3}>
          <Stat label="IN" value={income} color={GREEN} bg="#E7F5EC" />
          <Stat label="OUT" value={expenses} color={RED} bg="#FDECEC" />
          <Stat label="PROFIT" value={profit} color={RIVER} bg={RIVER_TINT} />
        </View>

        {/* Tax */}
        <FadeIn delay={90}>
          <View style={styles.taxCard}>
            <Text style={styles.taxLabel}>ESTIMATED TAX AND NI ON THIS</Text>
            <CountUp value={tax} delay={120} format={gbp} style={styles.taxValue} />
            <Text style={styles.taxBody}>Set this aside as you go and the January bill never stings. We prepare it, you approve before anything is sent.</Text>
          </View>
        </FadeIn>

        {/* Where it went */}
        {cats.length > 0 ? (
          <FadeIn delay={140}>
            <Text style={styles.sectionLabel}>WHERE YOUR MONEY WENT</Text>
            <View style={styles.catCard}>
              {cats.map(([cat, amt], i) => (
                <View key={cat} style={[styles.catRow, i > 0 ? styles.catBorder : null]}>
                  <View style={styles.catTop}>
                    <Text style={styles.catName}>{label(cat)}</Text>
                    <Text style={styles.catAmt}>{gbp(amt)}</Text>
                  </View>
                  <GrowBar progress={maxCat ? amt / maxCat : 0} color={RIVER} track={SURFACE} delay={160 + i * 40} />
                  <Text style={styles.catPct}>{expenses ? Math.round((amt / expenses) * 100) : 0}% of your costs</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Log a few costs and your year breakdown appears here.</Text>
          </View>
        )}

        <PressableScale style={styles.proofBtn} onPress={() => router.push('/proof-of-income')}>
          <Text style={styles.proofText}>Need to prove your income? Make a summary →</Text>
        </PressableScale>

        <Text style={styles.note}>A guide from what you have logged this tax year. Not a filed return. The more you log, the truer it gets.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <CountUp value={value} delay={80} format={gbp} style={[styles.statValue, { color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 44 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 27, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  row3: { flexDirection: 'row', gap: 10, marginHorizontal: 24, marginTop: 16 },
  stat: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  statLabel: { fontSize: 10.5, fontWeight: '800', color: MUTED, letterSpacing: 0.6 },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  taxCard: { marginHorizontal: 24, marginTop: 14, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 16, padding: 18 },
  taxLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.6 },
  taxValue: { fontSize: 30, fontWeight: '800', color: '#92400E', letterSpacing: -1, marginTop: 4 },
  taxBody: { fontSize: 13, color: '#7A5E2C', lineHeight: 19, marginTop: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: MUTED, letterSpacing: 0.6, marginHorizontal: 24, marginTop: 24, marginBottom: 10 },
  catCard: { marginHorizontal: 24, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 },
  catRow: { paddingVertical: 12 },
  catBorder: { borderTopWidth: 1, borderTopColor: SURFACE },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  catName: { fontSize: 15, fontWeight: '600', color: INK },
  catAmt: { fontSize: 15, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  catPct: { fontSize: 11.5, color: MUTED, marginTop: 6 },
  empty: { marginHorizontal: 24, marginTop: 16, backgroundColor: SURFACE, borderRadius: 16, padding: 22, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center' },
  proofBtn: { marginHorizontal: 24, marginTop: 18, backgroundColor: RIVER_TINT, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  proofText: { fontSize: 14.5, fontWeight: '700', color: RIVER },
  note: { fontSize: 12, color: MUTED, lineHeight: 18, marginHorizontal: 24, marginTop: 16 },
});
