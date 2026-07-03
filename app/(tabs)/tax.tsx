import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getTransactions, Transaction } from '../../lib/supabase';
import { formatGBP, formatSignedGBP, signedAmount, txDate } from '../../lib/format';
import { soleTraderTax } from '../../lib/tax';
import { INK, RIVER, RIVER_TINT, SAFFRON, SAFFRON_DEEP, GREEN, RED, PAPER, SURFACE, LINE, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale, CountUp, RiverAccent } from '../../components/Motion';

function getCurrentQuarter(): { label: string; index: number; start: Date; end: Date } {
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
  const taxYearLabel = `${ukTaxYearStart}/${nextYear}`;

  const start = new Date(qYear, qStartMonth, 1, 0, 0, 0, 0);
  const endMonth = (qStartMonth + 3) % 12;
  const endYear = qStartMonth + 3 >= 12 ? qYear + 1 : qYear;
  const end = new Date(endYear, endMonth, 0, 23, 59, 59, 999);

  return {
    label: `${quarterLabels[quarter]} ${taxYearLabel}: ${quarterMonthNames[quarter]}`,
    index: quarter,
    start,
    end,
  };
}

function filterByQuarter(transactions: Transaction[], start: Date, end: Date): Transaction[] {
  return transactions.filter((t) => {
    const d = new Date(txDate(t));
    if (Number.isNaN(d.getTime())) return false;
    return d >= start && d <= end;
  });
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function TaxScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const quarter = getCurrentQuarter();

  async function load() {
    if (!user) return;
    const { data, error } = await getTransactions(user.id);
    if (error) {
      setHasError(true);
    } else {
      setTransactions(data ?? []);
      setHasError(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const quarterTransactions = filterByQuarter(transactions, quarter.start, quarter.end);
  const confirmed = quarterTransactions.filter((t) => t.confirmed === true);
  const unconfirmed = quarterTransactions.filter((t) => t.confirmed === false);

  const income = confirmed.filter((t) => signedAmount(t) > 0).reduce((sum, t) => sum + signedAmount(t), 0);
  const expenses = confirmed.filter((t) => signedAmount(t) < 0).reduce((sum, t) => sum + Math.abs(signedAmount(t)), 0);
  const profit = income - expenses;
  const cisTotal = confirmed.reduce((sum, t) => sum + (t.cis_deduction ?? 0), 0);
  // Tax saved this quarter from logged costs: run the annualised income and the
  // annualised profit through the real 2026/27 engine and take a quarter of the
  // difference, so the saving reflects the user's true marginal rate and the
  // personal allowance rather than a flat band.
  const taxSaved = Math.round(Math.max(0, soleTraderTax(income * 4).total - soleTraderTax(profit * 4).total) / 4);

  const toReviewCount = unconfirmed.length;
  const toReviewValue = unconfirmed.reduce((sum, t) => sum + Math.abs(signedAmount(t)), 0);

  function explainWords() {
    Alert.alert(
      'The tax words, in plain English',
      'CIS: tax a contractor takes off a subcontractor’s pay, on the labour part, before paying you. Often some comes back as a refund.\n\nMTD: Making Tax Digital. From April 2026, if you earn over £50,000 you send HMRC a short update four times a year instead of one big return.\n\nUTR: your 10 digit taxpayer reference from HMRC. You need it to file.\n\nNI: National Insurance, paid on your profit alongside income tax.\n\nVAT: a tax you add to your prices once your turnover passes £90,000.\n\nSelf Assessment: your once a year tax return to HMRC.',
      [{ text: 'Got it' }],
    );
  }

  function handlePrepareMTD() {
    if (toReviewCount > 0) {
      Alert.alert(
        'Review first',
        `You have ${toReviewCount} ${toReviewCount === 1 ? 'receipt' : 'receipts'} still to check. Confirm them so your summary is complete and correct.`,
        [
          { text: 'Review now', onPress: () => router.push('/(tabs)/transactions') },
          { text: 'Later', style: 'cancel' },
        ],
      );
      return;
    }
    router.push('/tax-summary');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} colors={[RIVER]} />}
      >
        <FadeIn style={styles.header}>
          <Text style={styles.title}>Money</Text>
          <RiverAccent />
        </FadeIn>

        {/* Quarter progress, echoing the website timeline */}
        <FadeIn delay={80}>
          <View style={styles.quarterCard}>
            <Text style={styles.quarterLabel}>{quarter.label}</Text>
            <View style={styles.quarterDots}>
              {QUARTERS.map((q, i) => {
                const done = i < quarter.index;
                const current = i === quarter.index;
                return (
                  <View key={q} style={styles.quarterDotWrap}>
                    <View
                      style={[
                        styles.quarterDot,
                        done ? styles.quarterDotDone : null,
                        current ? styles.quarterDotCurrent : null,
                      ]}
                    >
                      <Text style={[styles.quarterDotText, (done || current) ? styles.quarterDotTextOn : null]}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.quarterDotLabel, current ? styles.quarterDotLabelOn : null]}>{q}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.quarterHint}>You send a short update each quarter. You always approve it first.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <PressableScale onPress={explainWords} accessibilityRole="button" accessibilityLabel="Explain the tax words in plain English">
            <Text style={styles.wordsLink}>New to the tax words? Tap for plain English ›</Text>
          </PressableScale>
        </FadeIn>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={RIVER} />
          </View>
        )}

        {!loading && hasError ? (
          <FadeIn delay={120}>
            <View style={styles.taxError}>
              <Text style={styles.taxErrorText}>Couldn't load your data. Pull to refresh.</Text>
            </View>
          </FadeIn>
        ) : null}

        {!loading && !hasError && transactions.length === 0 ? (
          <FadeIn delay={120}>
            <View style={styles.taxEmpty}>
              <Text style={styles.taxEmptyEmoji}>📲</Text>
              <Text style={styles.taxEmptyTitle}>Nothing logged yet this quarter.</Text>
              <Text style={styles.taxEmptyBody}>Snap a receipt or text an expense on WhatsApp, and your figures fill in here automatically. You can also add one by hand from the home screen.</Text>
            </View>
          </FadeIn>
        ) : null}

        {toReviewCount > 0 ? (
          <FadeIn delay={140}>
            <PressableScale
              style={styles.reviewStrip}
              onPress={() => router.push('/(tabs)/transactions')}
              accessibilityRole="button"
            >
              <Text style={styles.reviewStripIcon}>📝</Text>
              <Text style={styles.reviewStripText}>
                {toReviewCount === 1
                  ? `1 receipt worth ${formatGBP(toReviewValue)} is not in these figures yet. Check it.`
                  : `${toReviewCount} receipts worth ${formatGBP(toReviewValue)} are not in these figures yet. Check them.`}
              </Text>
              <Text style={styles.reviewStripChevron}>{'›'}</Text>
            </PressableScale>
          </FadeIn>
        ) : null}

        <FadeIn delay={170}>
          <Text style={styles.figuresCaption}>Based on the receipts you have confirmed</Text>
        </FadeIn>

        <View style={styles.cardsWrapper}>
          <FadeIn delay={200} style={styles.infoCard}>
            <View style={styles.infoCardRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#E7F5EC' }]}><Text style={styles.infoIcon}>💰</Text></View>
              <Text style={styles.infoLabel}>Income this quarter</Text>
            </View>
            <CountUp value={income} delay={200} format={formatGBP} style={[styles.infoAmount, { color: GREEN }]} />
          </FadeIn>

          <FadeIn delay={260} style={styles.infoCard}>
            <View style={styles.infoCardRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#FDECEC' }]}><Text style={styles.infoIcon}>🧾</Text></View>
              <Text style={styles.infoLabel}>Expenses this quarter</Text>
            </View>
            <CountUp value={expenses} delay={260} format={formatGBP} style={[styles.infoAmount, { color: RED }]} />
          </FadeIn>
        </View>

        <FadeIn delay={320}>
          <View style={styles.profitRow}>
            <Text style={styles.profitLabel}>{profit < 0 ? 'Estimated loss' : 'Estimated profit'}</Text>
            <CountUp value={profit} delay={320} format={formatSignedGBP} style={[styles.profitAmount, profit < 0 ? { color: RED } : null]} />
          </View>
        </FadeIn>

        <FadeIn delay={340}>
          <PressableScale
            style={styles.cisCard}
            onPress={() => router.push('/cis')}
            accessibilityRole="button"
            accessibilityLabel="Your CIS and refund"
          >
            <Text style={styles.cisIcon}>🏗️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cisTitle}>{cisTotal > 0 ? `£${cisTotal.toFixed(0)} CIS deducted this quarter` : 'Your CIS and refund'}</Text>
              <Text style={styles.cisSub}>{cisTotal > 0 ? 'Tax already paid at source. Tap to see the year and your building refund.' : 'In construction? Track the CIS taken from your pay and see what you are owed back.'}</Text>
            </View>
            <Text style={styles.guideChevron}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        {taxSaved > 0 ? (
          <FadeIn delay={355}>
            <View style={styles.savedCard}>
              <Text style={styles.savedIcon}>💚</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedTitle}>Roughly {formatGBP(taxSaved)} saved in tax this quarter</Text>
                <Text style={styles.savedSub}>From the {formatGBP(expenses)} of costs you logged, at your tax rate. A rough guide, not advice.</Text>
              </View>
            </View>
          </FadeIn>
        ) : null}

        <FadeIn delay={360}>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>Lekhio prepares your summary. You approve before anything is sent to HMRC.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={400}>
          <PressableScale style={styles.ctaButton} onPress={handlePrepareMTD}>
            <Text style={styles.ctaLabel}>Prepare my summary</Text>
          </PressableScale>
        </FadeIn>

        <Text style={styles.sectionHead}>Plan ahead</Text>

        <FadeIn delay={452}>
          <PressableScale
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginBottom: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 }}
            onPress={() => router.push('/what-if')}
            accessibilityRole="button"
            accessibilityLabel="What if, model a money decision"
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: RIVER_TINT, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.guideIcon}>🔮</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: INK }}>What if…</Text>
              <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 17 }}>Buying a van? Winning a contract? See the tax effect before you decide.</Text>
            </View>
            <Text style={{ fontSize: 22, color: RIVER }}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={458}>
          <PressableScale
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginBottom: 14, backgroundColor: '#E7F5EC', borderRadius: 16, padding: 18 }}
            onPress={() => router.push('/pay-yourself')}
            accessibilityRole="button"
            accessibilityLabel="Pay yourself, tax efficient pay advisor"
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.guideIcon}>💷</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: GREEN }}>Pay yourself</Text>
              <Text style={{ fontSize: 12.5, color: '#3B6B4A', marginTop: 3, lineHeight: 17 }}>The most tax efficient way to take money out, sole trader or company.</Text>
            </View>
            <Text style={{ fontSize: 22, color: GREEN }}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={464}>
          <PressableScale
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginBottom: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 }}
            onPress={() => router.push('/proof-of-income')}
            accessibilityRole="button"
            accessibilityLabel="Proof of income for a mortgage or loan"
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: RIVER_TINT, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.guideIcon}>📄</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: INK }}>Proof of income</Text>
              <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 17 }}>A clean income summary for a mortgage or loan, in one tap.</Text>
            </View>
            <Text style={{ fontSize: 22, color: RIVER }}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        <Text style={styles.sectionHead}>Help and filing</Text>

        <FadeIn delay={466}>
          <PressableScale
            style={styles.claimCard}
            onPress={() => router.push('/can-i-claim')}
            accessibilityRole="button"
            accessibilityLabel="Can I claim it, the expense checker"
          >
            <View style={styles.claimIconWrap}><Text style={styles.guideIcon}>💡</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.claimTitle}>Can I claim it?</Text>
              <Text style={styles.claimSub}>Not sure if something counts? Check the real rules in seconds.</Text>
            </View>
            <Text style={styles.claimChevron}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={468}>
          <PressableScale
            style={styles.guideCard}
            onPress={() => router.push('/file-return')}
            accessibilityRole="button"
            accessibilityLabel="File your own tax return, a free walkthrough"
          >
            <View style={styles.guideIconWrap}><Text style={styles.guideIcon}>📋</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>File your own tax return</Text>
              <Text style={styles.guideSub}>Free, visual walkthrough. Pick your trade and follow along.</Text>
            </View>
            <Text style={styles.guideChevron}>{'›'}</Text>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={470}>
          <PressableScale
            style={styles.soonCard}
            onPress={() => Alert.alert('File to HMRC, coming soon', 'Soon you will submit your quarterly updates and your return straight to HMRC from Lekhio, when you approve. We prepare, you approve, and nothing is ever sent without you. We will tell you the moment it is ready.')}
            accessibilityRole="button"
            accessibilityLabel="File straight to HMRC, coming soon"
          >
            <View style={styles.soonIconWrap}><Text style={styles.guideIcon}>📤</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.soonTitle}>File straight to HMRC</Text>
              <Text style={styles.soonSub}>Submit your return from Lekhio, when you approve.</Text>
            </View>
            <View style={styles.soonPill}><Text style={styles.soonPillText}>SOON</Text></View>
          </PressableScale>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scrollContent: { paddingBottom: 40, maxWidth: 680, width: '100%', alignSelf: 'center' },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sectionHead: { fontSize: 12.5, fontWeight: '800', color: MUTED, letterSpacing: 0.6, marginHorizontal: 24, marginTop: 24, marginBottom: 10, textTransform: 'uppercase' },
  wordsLink: { fontSize: 13.5, fontWeight: '600', color: RIVER, marginHorizontal: 24, marginTop: 12 },
  quarterCard: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 18,
    padding: 20,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(17,17,17,0.05)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }),
  },
  quarterLabel: { fontSize: 14, fontWeight: '700', color: RIVER },
  quarterDots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 6, paddingHorizontal: 4 },
  quarterDotWrap: { alignItems: 'center', gap: 8 },
  quarterDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  quarterDotDone: { backgroundColor: RIVER_TINT },
  quarterDotCurrent: { backgroundColor: WHITE, borderColor: RIVER },
  quarterDotText: { fontSize: 14, fontWeight: '800', color: MUTED },
  quarterDotTextOn: { color: RIVER },
  quarterDotLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  quarterDotLabelOn: { color: INK },
  quarterHint: { fontSize: 12.5, color: MUTED, lineHeight: 18, marginTop: 10 },
  loadingRow: { paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  reviewStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  reviewStripIcon: { fontSize: 16 },
  reviewStripText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400E', lineHeight: 18 },
  reviewStripChevron: { fontSize: 20, color: '#B45309', fontWeight: '400' },
  figuresCaption: { marginHorizontal: 24, marginTop: 20, fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardsWrapper: { marginHorizontal: 24, marginTop: 10, gap: 12 },
  infoCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 18px rgba(17,17,17,0.05)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 }),
  },
  infoCardRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  infoIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoIcon: { fontSize: 18 },
  infoLabel: { fontSize: 14, color: MUTED, flex: 1 },
  infoAmount: { fontSize: 19, fontWeight: '800' },
  profitRow: {
    marginHorizontal: 24,
    marginTop: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: SURFACE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profitLabel: { fontSize: 15, fontWeight: '600', color: INK },
  profitAmount: { fontSize: 18, fontWeight: '800', color: RIVER },
  noteCard: { marginHorizontal: 24, marginTop: 12, backgroundColor: RIVER_TINT, borderRadius: 12, padding: 16 },
  cisCard: { flexDirection: 'row', gap: 12, marginHorizontal: 24, marginTop: 14, backgroundColor: '#FBEFD8', borderRadius: 14, padding: 16, alignItems: 'center' },
  cisIcon: { fontSize: 24 },
  cisTitle: { fontSize: 15, fontWeight: '800', color: SAFFRON_DEEP },
  cisSub: { fontSize: 12.5, color: '#8A6A33', lineHeight: 18, marginTop: 3 },
  savedCard: { flexDirection: 'row', gap: 12, marginHorizontal: 24, marginTop: 14, backgroundColor: '#E7F5EC', borderRadius: 14, padding: 16, alignItems: 'center' },
  savedIcon: { fontSize: 24 },
  savedTitle: { fontSize: 15, fontWeight: '800', color: GREEN },
  savedSub: { fontSize: 12.5, color: '#3B6B4A', lineHeight: 18, marginTop: 3 },
  noteText: { fontSize: 13, color: RIVER, lineHeight: 20 },
  ctaButton: { marginHorizontal: 24, marginTop: 20, marginBottom: 14, backgroundColor: RIVER, borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  ctaLabel: { color: WHITE, fontSize: 16, fontWeight: '700' },
  guideCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginTop: 0, marginBottom: 14, backgroundColor: '#FBEFD8', borderRadius: 16, padding: 18 },
  soonCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginTop: 0, marginBottom: 34, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18 },
  soonIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: RIVER_TINT, alignItems: 'center', justifyContent: 'center' },
  soonTitle: { fontSize: 15.5, fontWeight: '800', color: INK },
  soonSub: { fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 17 },
  soonPill: { backgroundColor: '#FBEFD8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  soonPillText: { fontSize: 10, fontWeight: '800', color: SAFFRON_DEEP, letterSpacing: 0.5 },
  guideIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  guideIcon: { fontSize: 22 },
  guideTitle: { fontSize: 15.5, fontWeight: '800', color: SAFFRON_DEEP },
  guideSub: { fontSize: 12.5, color: '#8A6A33', marginTop: 3, lineHeight: 17 },
  guideChevron: { fontSize: 22, color: SAFFRON_DEEP },
  claimCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 24, marginTop: 0, marginBottom: 14, backgroundColor: RIVER_TINT, borderRadius: 16, padding: 18 },
  claimIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  claimTitle: { fontSize: 15.5, fontWeight: '800', color: RIVER },
  claimSub: { fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 17 },
  claimChevron: { fontSize: 22, color: RIVER },
  taxError: { marginHorizontal: 24, marginTop: 16, backgroundColor: '#FDECEC', borderRadius: 14, padding: 16, alignItems: 'center' },
  taxErrorText: { fontSize: 14, color: RED, fontWeight: '600', textAlign: 'center' },
  taxEmpty: { marginHorizontal: 24, marginTop: 16, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 26, alignItems: 'center' },
  taxEmptyEmoji: { fontSize: 38, marginBottom: 12 },
  taxEmptyTitle: { fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center' },
  taxEmptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
