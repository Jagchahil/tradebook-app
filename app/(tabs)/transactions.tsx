import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
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
import { formatGBP, isIncome, categoryEmoji, txDate } from '../../lib/format';
import { INK, RIVER, GREEN, RED, PAPER, SURFACE, LINE, MUTED } from '../../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../../components/Motion';
import { habitMomentReached, maybeAskForReview } from '../../lib/review';

function groupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface Section {
  title: string;
  data: Transaction[];
}

function buildSections(transactions: Transaction[]): Section[] {
  const map = new Map<string, Transaction[]>();

  for (const t of transactions) {
    // Group by the transaction date (the receipt date when known), not the
    // logging date, so a back dated receipt files under the day it happened.
    const label = groupLabel(txDate(t));
    const existing = map.get(label);
    if (existing) {
      existing.push(t);
    } else {
      map.set(label, [t]);
    }
  }

  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

interface TransactionRowProps {
  item: Transaction;
}

function TransactionRow({ item }: TransactionRowProps) {
  const income = isIncome(item);
  const sign = income ? '+' : '-';
  const amountColour = income ? GREEN : RED;
  const emoji = categoryEmoji(item.category);
  const needsReview = item.confirmed === false;

  return (
    <PressableScale
      style={styles.row}
      onPress={() => router.push(`/transaction/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.merchant_name}, ${sign}${formatGBP(item.amount)}`}
    >
      <View style={styles.emojiCircle}>
        <Text style={styles.emojiText}>{emoji}</Text>
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.merchantName}>{item.merchant_name}</Text>
        <View style={styles.rowSubline}>
          <Text style={styles.categoryText}>{item.category}</Text>
          {needsReview ? (
            <View style={styles.reviewTag}>
              <Text style={styles.reviewTagText}>To review</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={[styles.rowAmount, { color: amountColour }]}>
        {sign}{formatGBP(item.amount)}
      </Text>
    </PressableScale>
  );
}

export default function TransactionsScreen() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState('');

  async function load() {
    if (!user) return;
    const { data, error } = await getTransactions(user.id);
    if (error) {
      setHasError(true);
    } else {
      setTransactions(data ?? []);
      setHasError(false);
      // The habit moment: a real week of confirmed books. One polite review
      // ask, ever, and only once a review link is configured (lib/review.ts).
      if (habitMomentReached(data ?? [])) {
        maybeAskForReview('habit');
      }
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

  const filtered = useMemo(() => {
    if (!query.trim()) return transactions;
    const lower = query.toLowerCase();
    return transactions.filter((t) =>
      (t.merchant_name || '').toLowerCase().includes(lower)
    );
  }, [transactions, query]);

  const sections = useMemo(() => buildSections(filtered), [filtered]);

  return (
    <SafeAreaView style={styles.container}>
      <FadeIn style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <RiverAccent />
      </FadeIn>

      <FadeIn delay={80} style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor="#AAAAAA"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </FadeIn>

      {loading && (
        <View style={styles.centred}>
          <ActivityIndicator color="#1B59A6" />
        </View>
      )}

      {!loading && hasError && (
        <View style={styles.centred}>
          <Text style={styles.errorText}>Could not load data.</Text>
        </View>
      )}

      {!loading && !hasError && sections.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No transactions yet.</Text>
          <Text style={styles.emptySubtitle}>Send a receipt on WhatsApp to add one.</Text>
        </View>
      )}

      {!loading && !hasError && sections.length > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TransactionRow item={item} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} colors={[RIVER]} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontWeight: '700',
    fontSize: 28,
    color: '#111111',
  },
  searchWrapper: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#F2F0EA',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#111111',
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 6,
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#FBFAF7',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  emojiCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emojiText: {
    fontSize: 18,
  },
  rowMiddle: {
    flex: 1,
    marginRight: 12,
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
  },
  categoryText: {
    fontSize: 13,
    color: '#888888',
    marginTop: 2,
  },
  rowSubline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  reviewTag: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  reviewTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#F2F0EA',
    marginLeft: 72,
  },
  listContent: {
    paddingBottom: 16,
  },
});
