import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getInvoices, Invoice } from '../../lib/supabase';
import { formatGBP } from '../../lib/format';
import { INK, RIVER, RIVER_TINT, GREEN, PAPER, SURFACE, LINE, MUTED, WHITE } from '../../lib/theme';
import { FadeIn, PressableScale, CountUp, RiverAccent } from '../../components/Motion';

function isOverdue(inv: Invoice): boolean {
  if (inv.status === 'paid' || !inv.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(inv.due_date) < today;
}

function StatusBadge({ status, overdue }: { status: Invoice['status']; overdue?: boolean }) {
  if (overdue) {
    return (
      <View style={[styles.badge, { backgroundColor: '#FBEAE8' }]}>
        <Text style={[styles.badgeText, { color: '#B42318' }]}>Overdue</Text>
      </View>
    );
  }
  const map = {
    draft: { bg: SURFACE, fg: MUTED, label: 'Draft' },
    sent: { bg: RIVER_TINT, fg: RIVER, label: 'Sent' },
    paid: { bg: '#DCFCE7', fg: GREEN, label: 'Paid' },
  } as const;
  const s = map[status] ?? map.draft;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function InvoiceRow({ item, index }: { item: Invoice; index: number }) {
  return (
    <FadeIn delay={120 + index * 60}>
      <PressableScale style={styles.row} onPress={() => router.push(`/invoice/${item.id}`)}>
        <View style={styles.rowLeft}>
          <Text style={styles.customer}>{item.customer_name || 'No name'}</Text>
          <Text style={styles.number}>{item.number}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.total}>{formatGBP(item.total)}</Text>
          <StatusBadge status={item.status} overdue={isOverdue(item)} />
        </View>
      </PressableScale>
    </FadeIn>
  );
}

export default function InvoicesScreen() {
  const { user } = useCurrentUser();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!user) return;
    const data = await getInvoices(user.id);
    setInvoices(data);
  }

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      getInvoices(user.id)
        .then(setInvoices)
        .finally(() => setLoading(false));
    }, [user]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const overdueList = invoices.filter(isOverdue);
  const overdueTotal = overdueList.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <FadeIn style={styles.header}>
        <View>
          <Text style={styles.title}>Invoices</Text>
          <RiverAccent />
        </View>
        <PressableScale
          style={styles.newButton}
          onPress={() => router.push('/invoice/new')}
          accessibilityRole="button"
          accessibilityLabel="New invoice"
        >
          <Text style={styles.newButtonText}>+ New</Text>
        </PressableScale>
      </FadeIn>

      {invoices.length > 0 ? (
        <FadeIn delay={80}>
          <View style={styles.outstandingCard}>
            <Text style={styles.outstandingLabel}>Outstanding</Text>
            <CountUp value={outstanding} delay={80} format={formatGBP} style={styles.outstandingValue} />
          </View>
        </FadeIn>
      ) : null}

      {overdueList.length > 0 ? (
        <FadeIn delay={100}>
          <View style={styles.overdueCard}>
            <Text style={styles.overdueIcon}>⏰</Text>
            <Text style={styles.overdueText}>
              <Text style={{ fontWeight: '800' }}>{formatGBP(overdueTotal)}</Text> is overdue across {overdueList.length} {overdueList.length === 1 ? 'invoice' : 'invoices'}. Open one to send a reminder by text or email.
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={RIVER} size="large" />
        </View>
      ) : invoices.length === 0 ? (
        <FadeIn delay={80} style={styles.empty}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyTitle}>No invoices yet.</Text>
          <Text style={styles.emptySub}>Make one in seconds and send it straight to your customer.</Text>
          <PressableScale style={styles.emptyButton} onPress={() => router.push('/invoice/new')}>
            <Text style={styles.emptyButtonText}>Create your first invoice</Text>
          </PressableScale>
        </FadeIn>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} colors={[RIVER]} />}
        >
          <View style={styles.listCard}>
            {invoices.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <View style={styles.separator} /> : null}
                <InvoiceRow item={item} index={i} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  newButton: { backgroundColor: RIVER, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 4 },
  newButtonText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  outstandingCard: {
    marginHorizontal: 24,
    marginTop: 12,
    maxWidth: 680 - 48,
    width: undefined,
    alignSelf: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 6px 18px rgba(17,17,17,0.05)' } as any)
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 }),
  },
  outstandingLabel: { fontSize: 13, color: MUTED, fontWeight: '600' },
  outstandingValue: { fontSize: 22, fontWeight: '800', color: INK },
  overdueCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 12,
    maxWidth: 680 - 48,
    alignSelf: 'center',
    backgroundColor: '#FBEAE8',
    borderWidth: 1,
    borderColor: '#F3C7C2',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  overdueIcon: { fontSize: 20 },
  overdueText: { flex: 1, fontSize: 13, color: '#7A1C13', lineHeight: 19 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: INK },
  emptySub: { fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyButton: { marginTop: 22, backgroundColor: RIVER, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 14 },
  emptyButtonText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  list: { paddingTop: 16, paddingBottom: 24, maxWidth: 680, width: '100%', alignSelf: 'center' },
  listCard: {
    marginHorizontal: 24,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: WHITE,
  },
  rowLeft: { flex: 1 },
  customer: { fontSize: 15, fontWeight: '600', color: INK },
  number: { fontSize: 13, color: MUTED, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  total: { fontSize: 15, fontWeight: '700', color: INK },
  badge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: SURFACE, marginHorizontal: 18 },
});
