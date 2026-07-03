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
import { maybeAskForReview } from '../lib/review';
import { INK, RIVER, SAFFRON_DEEP, SAFFRON_TINT, GREEN, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, RiverAccent, CountUp, Pop } from '../components/Motion';

function gbp(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Income tax plus Class 4 NIC on a sole trader profit. Delegates to the one
// engine (lib/tax.ts) so this screen can never drift from the dashboard.
function estTaxDue(profit: number): number {
  return soleTraderTax(profit).total;
}

export default function CisScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getTransactions(user.id).then((r) => {
      const txs = r.data ?? [];
      setTransactions(txs);
      setLoaded(true);
      // The money moment: the refund tracker is showing money back. One polite
      // review ask, ever, and only once a review link is configured.
      const yearStart = taxYearStart(new Date());
      const cis = txs
        .filter((t) => t.confirmed === true && new Date(t.transaction_date || t.created_at) >= yearStart)
        .reduce((s, t) => s + (t.cis_deduction ?? 0), 0);
      if (cis > 0) {
        maybeAskForReview('refund');
      }
    });
  }, [user]);

  const start = taxYearStart(new Date());
  const cisRows = transactions
    .filter((t) => t.confirmed === true && new Date(t.transaction_date || t.created_at) >= start && (t.cis_deduction ?? 0) > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalDeducted = cisRows.reduce((s, t) => s + (t.cis_deduction ?? 0), 0);
  const totalGross = cisRows.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
  const yearLabel = `${start.getFullYear()}/${String((start.getFullYear() + 1) % 100).padStart(2, '0')}`;

  // Estimated refund so far: CIS already handed over, less the tax actually due
  // on your profit to date. An estimate on the year so far, settled when you file.
  const ytd = transactions.filter((t) => t.confirmed === true && new Date(t.transaction_date || t.created_at) >= start);
  let income = 0;
  let expenses = 0;
  for (const t of ytd) {
    const a = Number(t.amount) || 0;
    if (a >= 0) income += a;
    else expenses += Math.abs(a);
  }
  const profit = Math.max(0, income - expenses);
  const taxDue = estTaxDue(profit);
  const refundEst = Math.max(0, totalDeducted - taxDue);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Your CIS</Text>
          <RiverAccent />
          <Text style={styles.sub}>Construction Industry Scheme. The tax contractors take from your pay, tracked toward your refund.</Text>
        </FadeIn>

        {/* Hero refund card */}
        <FadeIn delay={80}>
          <View style={styles.heroCard}>
            <Pop delay={140} style={styles.heroIconWrap}><Text style={styles.heroIcon}>🏗️</Text></Pop>
            <Text style={styles.heroLabel}>CIS DEDUCTED, {yearLabel}</Text>
            <CountUp value={totalDeducted} delay={160} format={gbp} style={styles.heroValue} />
            <Text style={styles.heroBody}>
              This is tax already handed to HMRC on your behalf. It comes off your final bill at tax time, and for most subcontractors that means money back.
            </Text>
          </View>
        </FadeIn>

        {/* Estimated refund so far */}
        {cisRows.length > 0 ? (
          <FadeIn delay={110}>
            <View style={styles.refundCard}>
              <Text style={styles.refundLabel}>ESTIMATED REFUND, YEAR SO FAR</Text>
              <CountUp value={refundEst} delay={180} format={gbp} style={styles.refundValue} />
              <Text style={styles.refundBody}>
                CIS taken ({gbp(totalDeducted)}) less the tax actually due on your profit so far ({gbp(taxDue)}). The more expenses you log, the bigger this gets. An estimate, settled when you file. You always approve first.
              </Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Quick facts */}
        <View style={styles.factsRow}>
          <FadeIn delay={140} style={styles.factCard}>
            <Text style={styles.factLabel}>GROSS PAID</Text>
            <Text style={styles.factValue}>{gbp(totalGross)}</Text>
          </FadeIn>
          <FadeIn delay={180} style={styles.factCard}>
            <Text style={styles.factLabel}>CIS JOBS</Text>
            <Text style={styles.factValue}>{cisRows.length}</Text>
          </FadeIn>
        </View>

        {/* Entries */}
        {loaded && cisRows.length === 0 ? (
          <FadeIn delay={160}>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🧱</Text>
              <Text style={styles.emptyTitle}>No CIS logged yet this year.</Text>
              <Text style={styles.emptyBody}>On WhatsApp, text something like &ldquo;Dave paid £400, £80 CIS deducted&rdquo; and it lands here, tracked toward your refund.</Text>
            </View>
          </FadeIn>
        ) : null}

        {cisRows.length > 0 ? (
          <FadeIn delay={200}>
            <Text style={styles.listHead}>Every CIS payment</Text>
            <View style={styles.list}>
              {cisRows.map((t, i) => {
                const gross = Math.abs(t.amount ?? 0);
                const ded = t.cis_deduction ?? 0;
                return (
                  <View key={t.id} style={[styles.row, i > 0 ? styles.rowBorder : null]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{t.merchant_name || 'CIS payment'}</Text>
                      <Text style={styles.rowSub}>Gross {gbp(gross)} · net {gbp(gross - ded)}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowDed}>{gbp(ded)}</Text>
                      <Text style={styles.rowDedLabel}>CIS</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </FadeIn>
        ) : null}

        <FadeIn delay={240}>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>Lekhio keeps your CIS separate from profit, because it is tax paid, not income or a cost. We prepare your figures. You approve before anything is sent to HMRC.</Text>
          </View>
        </FadeIn>
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
  heroCard: { marginHorizontal: 24, marginTop: 16, backgroundColor: SAFFRON_TINT, borderRadius: 20, padding: 24 },
  heroIconWrap: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { fontSize: 26 },
  heroLabel: { fontSize: 11, fontWeight: '800', color: SAFFRON_DEEP, letterSpacing: 0.8, marginTop: 14 },
  heroValue: { fontSize: 42, fontWeight: '800', color: SAFFRON_DEEP, letterSpacing: -1.5, marginTop: 4 },
  heroBody: { fontSize: 14, color: '#7A5E2C', lineHeight: 20, marginTop: 8 },
  refundCard: { marginHorizontal: 24, marginTop: 12, backgroundColor: '#E7F5EC', borderWidth: 1, borderColor: '#CFE9D8', borderRadius: 18, padding: 22 },
  refundLabel: { fontSize: 11, fontWeight: '800', color: GREEN, letterSpacing: 0.8 },
  refundValue: { fontSize: 38, fontWeight: '800', color: GREEN, letterSpacing: -1.4, marginTop: 4 },
  refundBody: { fontSize: 13.5, color: '#2C6B45', lineHeight: 20, marginTop: 8 },
  factsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 24, marginTop: 12 },
  factCard: { flex: 1, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 16 },
  factLabel: { fontSize: 10.5, fontWeight: '800', color: MUTED, letterSpacing: 0.6 },
  factValue: { fontSize: 19, fontWeight: '800', color: INK, marginTop: 6 },
  listHead: { fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginHorizontal: 24, marginTop: 26, marginBottom: 10 },
  list: { marginHorizontal: 24, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: SURFACE },
  rowName: { fontSize: 15, fontWeight: '600', color: INK },
  rowSub: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowDed: { fontSize: 15, fontWeight: '800', color: SAFFRON_DEEP },
  rowDedLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  emptyBox: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 36 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  noteCard: { marginHorizontal: 24, marginTop: 18, backgroundColor: SURFACE, borderRadius: 12, padding: 16 },
  noteText: { fontSize: 13, color: INK, lineHeight: 20 },
});
