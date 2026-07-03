import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { EXPENSE_RULES, checkExpense, VERDICT_LABEL, type ExpenseRule, type Verdict } from '../lib/taxrules';
import { INK, RIVER, GREEN, GREEN_TINT, SAFFRON_DEEP, SAFFRON_TINT, RED, RED_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

function verdictColours(v: Verdict): { fg: string; bg: string } {
  if (v === 'yes') return { fg: GREEN, bg: GREEN_TINT };
  if (v === 'no') return { fg: RED, bg: RED_TINT };
  return { fg: SAFFRON_DEEP, bg: SAFFRON_TINT };
}

function RuleCard({ r, expanded }: { r: ExpenseRule; expanded?: boolean }) {
  const c = verdictColours(r.verdict);
  return (
    <View style={styles.ruleCard}>
      <View style={styles.ruleHead}>
        <Text style={styles.ruleTitle}>{r.title}</Text>
        <View style={[styles.pill, { backgroundColor: c.bg }]}>
          <Text style={[styles.pillText, { color: c.fg }]}>{VERDICT_LABEL[r.verdict]}</Text>
        </View>
      </View>
      <Text style={styles.ruleBody}>{expanded ? r.detail : r.rule}</Text>
    </View>
  );
}

const yesRules = EXPENSE_RULES.filter((r) => r.verdict === 'yes');
const midRules = EXPENSE_RULES.filter((r) => r.verdict === 'partly' || r.verdict === 'depends');
const noRules = EXPENSE_RULES.filter((r) => r.verdict === 'no');

export default function CanIClaimScreen() {
  const [query, setQuery] = useState('');
  const hit = query.trim().length >= 2 ? checkExpense(query) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <FadeIn style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.back}>‹ Back</Text>
          </PressableScale>
          <Text style={styles.title}>Can I claim it?</Text>
          <RiverAccent />
          <Text style={styles.sub}>Type a thing and get a straight answer. The grey areas included, all within the law.</Text>
        </FadeIn>

        <FadeIn delay={70}>
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔎</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Try: work boots, van, phone, lunch"
              placeholderTextColor="#9AA3AF"
              style={styles.search}
              autoCorrect={false}
            />
          </View>
        </FadeIn>

        {query.trim().length >= 2 ? (
          hit ? (
            <FadeIn delay={40}>
              <RuleCard r={hit} expanded />
            </FadeIn>
          ) : (
            <FadeIn delay={40}>
              <View style={styles.noHit}>
                <Text style={styles.noHitText}>
                  Not in my list yet. The test HMRC uses is simple: was it spent wholly and only for the business? If yes, it is very likely claimable. If it is part personal, claim the business share.
                </Text>
              </View>
            </FadeIn>
          )
        ) : (
          <>
            <Group title="Yes, claim these" rules={yesRules} dot={GREEN} delay={120} />
            <Group title="Part of it, or it depends" rules={midRules} dot={SAFFRON_DEEP} delay={160} />
            <Group title="Usually not" rules={noRules} dot={RED} delay={200} />
          </>
        )}

        <Text style={styles.footnote}>General information, not tax advice for your exact situation. Ask on WhatsApp if you are unsure.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ title, rules, dot, delay }: { title: string; rules: ExpenseRule[]; dot: string; delay: number }) {
  return (
    <FadeIn delay={delay}>
      <View style={styles.groupHead}>
        <View style={[styles.groupDot, { backgroundColor: dot }]} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {rules.map((r) => (
        <RuleCard key={r.key} r={r} />
      ))}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scroll: { maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 44 },
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 6 },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  sub: { fontSize: 14.5, color: MUTED, marginTop: 10, lineHeight: 21 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, marginTop: 14, backgroundColor: WHITE, borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingHorizontal: 14 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  search: { flex: 1, fontSize: 16, color: INK, paddingVertical: 14 },
  ruleCard: { marginHorizontal: 24, marginTop: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 16 },
  ruleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  ruleTitle: { flex: 1, fontSize: 15.5, fontWeight: '700', color: INK },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  ruleBody: { fontSize: 14, color: MUTED, lineHeight: 20 },
  noHit: { marginHorizontal: 24, marginTop: 12, backgroundColor: SURFACE, borderRadius: 14, padding: 18 },
  noHitText: { fontSize: 14.5, color: INK, lineHeight: 21 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 24, marginTop: 26, marginBottom: 4 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 17, fontWeight: '800', color: INK },
  footnote: { fontSize: 12, color: '#A8AEB6', paddingHorizontal: 24, marginTop: 26, lineHeight: 18 },
});
