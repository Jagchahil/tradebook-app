import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  Linking,
  Alert,
  Share,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { supabase, getUserPhone, getTransactions, getBillingStatus, requestDataExport, deleteAccount, BillingStatus, Transaction } from '../../lib/supabase';
import { formatGBP, signedAmount, txDate } from '../../lib/format';
import { taxYearStart } from '../../lib/goal';
import { soleTraderTax } from '../../lib/tax';
import { FadeIn, RiverAccent } from '../../components/Motion';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://tradebook-app-five.vercel.app';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';

const SUPPORT_EMAIL = 'support@lekhio.com';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  isLink?: boolean;
  last?: boolean;
}

function SettingsRow({ label, value, onPress, isLink, last }: SettingsRowProps) {
  const content = (
    <View style={[styles.row, last ? styles.rowLast : null]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined ? <Text style={styles.rowValue}>{value}</Text> : null}
      {isLink && value === undefined ? <Text style={styles.chevron}>{'›'}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={label}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function buildCsv(rows: Transaction[]): string {
  const header = 'Date,Vendor,Category,Amount,Confirmed';
  const lines = rows.map((t) => {
    const date = (t.transaction_date ?? t.created_at ?? '').slice(0, 10);
    const vendor = (t.merchant_name ?? '').replace(/"/g, '""');
    const category = (t.category ?? '').replace(/"/g, '""');
    const amount = (t.amount ?? 0).toFixed(2);
    const confirmed = t.confirmed ? 'yes' : 'no';
    return `${date},"${vendor}","${category}",${amount},${confirmed}`;
  });
  return [header, ...lines].join('\n');
}

// A rough income tax + Class 4 NI estimate on a year's profit, for the export.
// Delegates to the one engine (lib/tax.ts) so it can never drift from the app.
function estimateTax(profit: number): number {
  return Math.round(soleTraderTax(Math.max(0, profit)).total);
}

function planLabel(b: BillingStatus | null): { name: string; sub: string } {
  switch (b?.status) {
    case 'active':
      return { name: 'Active', sub: '£19.99 a month. Cancel any time.' };
    case 'past_due':
      return { name: 'Payment due', sub: 'We could not take your last payment. Update your card to keep Lekhio.' };
    case 'canceled':
      return { name: 'Cancelled', sub: 'Your subscription has ended. Resubscribe any time.' };
    default:
      return { name: 'Free trial', sub: '30 days free, then £19.99 a month. Cancel any time.' };
  }
}

export default function SettingsScreen() {
  const { user } = useCurrentUser();
  const [phone, setPhone] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  // The bank card's three states, from the server's single probe:
  // 'off' = feature dormant (honest coming soon), 'available' = tap to connect,
  // 'connected' = show the connected state with a disconnect option.
  const [bankState, setBankState] = useState<'off' | 'available' | 'connected'>('off');
  const [bankName, setBankName] = useState<string | null>(null);
  const [bankSynced, setBankSynced] = useState<string | null>(null);

  async function probeBank() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const res = await fetch(`${API_BASE}/api/bank/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setBankState('off');
        return;
      }
      const json = (await res.json()) as {
        connected?: boolean;
        bank_name?: string | null;
        last_synced_date?: string | null;
      };
      setBankState(json.connected ? 'connected' : 'available');
      setBankName(json.bank_name ?? null);
      setBankSynced(json.last_synced_date ?? null);
    } catch {
      setBankState('off');
    }
  }

  useEffect(() => {
    if (!user) return;
    getUserPhone(user.id).then(setPhone);
    getBillingStatus().then(setBilling);
    probeBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Re-probe when the tab regains focus, so the card flips to connected the
  // moment the user comes back from the bank consent journey.
  useFocusEffect(
    useCallback(() => {
      if (user) probeBank();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]),
  );

  function handleDisconnectBank() {
    Alert.alert(
      'Disconnect your bank?',
      'Lekhio will stop receiving transactions from your bank. Everything already imported stays in your records, waiting for your review as normal. You can reconnect any time.',
      [
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data } = await supabase.auth.getSession();
              const token = data.session?.access_token ?? '';
              const res = await fetch(`${API_BASE}/api/bank/disconnect`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                setBankState('available');
                Alert.alert('Disconnected', 'Your bank feed is off. Reconnect any time from this screen.');
              } else {
                Alert.alert('Could not disconnect', 'Try again in a minute.');
              }
            } catch {
              Alert.alert('Could not disconnect', 'Check your connection and try again.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function openLink(url: string) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open the link', 'Please try again later.'));
  }

  function handleHelp() {
    Alert.alert(
      'Get help',
      'Message us and get a quick reply, right in the same chat. No call centres, no waiting on hold.',
      [
        { text: 'Email us', onPress: () => openLink(`mailto:${SUPPORT_EMAIL}`) },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  }

  function handleMtd() {
    Alert.alert(
      'Making Tax Digital, in plain English',
      'From April 2026, HMRC wants digital records and a short update every quarter instead of one big return. Lekhio keeps your records as you go and prepares each update. You always check and approve it before anything is sent. You still pay your tax on the normal dates. You stay responsible for your tax. We never file anything without you.',
    );
  }

  function handlePrivacy() {
    Alert.alert(
      'Your data is safe',
      'Your records are encrypted and only you can see them. We never sell your data, and we never share it beyond the suppliers that run Lekhio. You can export or delete everything any time.\n\nHow to know it is really us: Lekhio only ever replies to a message you send first. We never message you out of the blue, and we never ask for your bank details, passwords, or login codes. We are not HMRC, and nothing is ever sent to HMRC without your approval.',
    );
  }

  function handleBankComingSoon() {
    Alert.alert(
      'Connect your bank, coming soon',
      "Soon you will be able to connect your bank, read only and through your bank's own login, so money in and out is logged for you automatically and your tax stays up to date.\n\nIt is optional, you stay in control, and Lekhio can never move your money. We will tell you the moment it is ready.",
    );
  }

  function handleCancel() {
    Alert.alert(
      'Cancelling is easy',
      'When billing is live, cancelling is one tap right here. No phone call, no fee, no last minute hoops. You keep your records and can export them any time.',
    );
  }

  function handleDownloadData() {
    Alert.alert(
      'Download all your data',
      'This gathers everything Lekhio holds about you into one file you can save or share.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const json = await requestDataExport();
            if (!json) {
              Alert.alert('Could not export', 'Please try again in a moment.');
              return;
            }
            try {
              await Share.share({ title: 'My Lekhio data', message: json });
            } catch {
              // share sheet dismissed
            }
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and all your records. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteAccount();
            if (ok) {
              await supabase.auth.signOut();
            } else {
              Alert.alert('Could not delete', 'Please try again, or message us so we can help.');
            }
          },
        },
      ],
    );
  }

  async function handleExport() {
    if (!user) return;
    const { data } = await getTransactions(user.id);
    const rows = data ?? [];
    if (rows.length === 0) {
      Alert.alert('Nothing to export yet', 'Send a receipt on WhatsApp and your records will start filling up.');
      return;
    }

    const start = taxYearStart(new Date());
    // The summary figures an accountant relies on must be approved-only. The full
    // CSV ledger below still lists every row with its Confirmed flag for transparency.
    const yearRows = rows.filter((t) => t.confirmed === true && new Date(txDate(t)) >= start);
    const income = yearRows.filter((t) => signedAmount(t) > 0).reduce((s, t) => s + signedAmount(t), 0);
    const expenses = yearRows.filter((t) => signedAmount(t) < 0).reduce((s, t) => s + Math.abs(signedAmount(t)), 0);
    const profit = income - expenses;
    const cis = yearRows.reduce((s, t) => s + (t.cis_deduction ?? 0), 0);
    const byCat: Record<string, number> = {};
    for (const t of yearRows.filter((t) => signedAmount(t) < 0)) {
      const c = t.category || 'other';
      byCat[c] = (byCat[c] || 0) + Math.abs(signedAmount(t));
    }
    const estTax = estimateTax(profit);
    const yearLabel = `${start.getFullYear()}/${String((start.getFullYear() + 1) % 100).padStart(2, '0')}`;
    const csv = buildCsv(rows);

    const summary = [
      `LEKHIO YEAR SUMMARY ${yearLabel}`,
      '',
      `Income:   ${formatGBP(income)}`,
      `Expenses: ${formatGBP(expenses)}`,
      `Profit:   ${formatGBP(profit)}`,
      cis > 0 ? `CIS deducted (tax already paid): ${formatGBP(cis)}` : '',
      `Estimated tax to set aside: ${formatGBP(estTax)}`,
      '',
      'Expenses by category:',
      ...Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `  ${c}: ${formatGBP(v)}`),
      '',
      `Entries this tax year: ${yearRows.length}`,
      'A summary to share with your accountant. A rough guide from your logged records, not a tax calculation.',
      '',
      '--- FULL TRANSACTIONS (CSV) ---',
      csv,
    ]
      .filter((l) => l !== '')
      .join('\n');

    try {
      await Share.share({ title: `Lekhio year summary ${yearLabel}`, message: summary });
    } catch {
      Alert.alert('Could not export', 'Please try again.');
    }
  }

  function handleRefer() {
    // Honesty rule: the "you get a month too" reward has no server side mechanic
    // yet, so we do not promise it. Reinstate the two way offer only once the
    // reward is actually granted automatically.
    Alert.alert(
      'Share Lekhio with a mate',
      'They get 30 days free to try it, and you get the credit for putting them onto it.',
      [
        { text: 'Share my link', onPress: shareReferral },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  }

  async function shareReferral() {
    try {
      await Share.share({
        message: "I do my books and tax by WhatsApp with Lekhio. Snap a receipt, or text 'drove 24 miles', and it is logged for tax. Use my link and your first 30 days are free: https://lekhio.com",
      });
    } catch {
      // share sheet dismissed, nothing to do
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <FadeIn style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <RiverAccent />
        </FadeIn>

        {/* Plan card */}
        <FadeIn delay={80} style={styles.planCard}>
          <View style={styles.planLeft}>
            <Text style={styles.planLabel}>Your plan</Text>
            <Text style={styles.planName}>{planLabel(billing).name}</Text>
            <Text style={styles.planSub}>{planLabel(billing).sub}</Text>
          </View>
        </FadeIn>

        {/* You're in control */}
        <FadeIn delay={120} style={styles.controlCard}>
          <Text style={styles.controlTitle}>You&apos;re the boss</Text>
          <Text style={styles.controlSub}>
            Lekhio only does what you tell it to. We prepare your figures and keep your records tidy. You always have the final say.
          </Text>
          {[
            'Nothing goes to HMRC until you check it and approve',
            'Encrypted, and only you can ever see your records',
            'We never sell or share your data',
            'Export or delete everything, and cancel, any time',
          ].map((line) => (
            <View key={line} style={styles.promiseRow}>
              <View style={styles.promiseTick}><Text style={styles.promiseTickText}>✓</Text></View>
              <Text style={styles.promiseText}>{line}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={handlePrivacy} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Read how your data is kept private">
            <Text style={styles.controlLink}>How we keep it private  ›</Text>
          </TouchableOpacity>
        </FadeIn>

        <Text style={styles.sectionHeader}>Spread the word</Text>
        <View style={styles.section}>
          <SettingsRow label="Refer a mate to Lekhio" isLink onPress={handleRefer} last />
        </View>

        {/* The bank card. One card, three states: the honest coming soon teaser
            while the feature is dormant, a connect button once the server
            enables feeds, and a connected state with disconnect once linked. */}
        <Text style={styles.sectionHeader}>{bankState === 'off' ? 'Coming soon' : 'Bank feed'}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            onPress={
              bankState === 'connected'
                ? handleDisconnectBank
                : bankState === 'available'
                  ? () => router.push('/bank-connect')
                  : handleBankComingSoon
            }
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={
              bankState === 'connected'
                ? 'Bank connected. Tap to manage or disconnect'
                : bankState === 'available'
                  ? 'Connect your bank'
                  : 'Connect your bank, coming soon'
            }
          >
            <View style={[styles.row, bankState === 'connected' ? null : styles.rowLast]}>
              <View style={styles.bankLeft}>
                <Text style={styles.bankIcon}>🏦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>
                    {bankState === 'connected' ? (bankName ?? 'Bank connected') : 'Connect your bank'}
                  </Text>
                  <Text style={styles.bankSub}>
                    {bankState === 'connected'
                      ? `Connected${bankSynced ? `, last synced ${bankSynced}` : ''}. New transactions arrive each day, marked to review. Read only, we can never move your money.`
                      : 'Optional. Money in and out logs itself, ready for tax. Read only, we can never move your money.'}
                  </Text>
                </View>
              </View>
              {bankState === 'connected' ? (
                <View style={styles.connectedPill}><Text style={styles.connectedText}>ON</Text></View>
              ) : bankState === 'available' ? (
                <Text style={styles.chevron}>›</Text>
              ) : (
                <View style={styles.soonPill}><Text style={styles.soonText}>SOON</Text></View>
              )}
            </View>
          </TouchableOpacity>
          {bankState === 'connected' ? (
            <TouchableOpacity
              onPress={handleDisconnectBank}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Disconnect this bank"
            >
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.disconnectLabel}>Disconnect this bank</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.section}>
          <SettingsRow label="Phone" value={phone ?? 'Not linked yet'} />
          <SettingsRow label="Your business details" isLink onPress={() => router.push('/profile')} />
          <SettingsRow label="Diary and reminders" isLink onPress={() => router.push('/diary')} />
          <SettingsRow label="Status" value={user ? 'Signed in' : 'Guest'} last />
        </View>

        <Text style={styles.sectionHeader}>Your data</Text>
        <View style={styles.section}>
          <SettingsRow label="Privacy and security" isLink onPress={handlePrivacy} />
          <SettingsRow label="Export for my accountant" isLink onPress={handleExport} />
          <SettingsRow label="Download all my data" isLink onPress={handleDownloadData} />
          <SettingsRow label="Cancel subscription" isLink onPress={handleCancel} />
          <SettingsRow label="Delete my account" isLink onPress={handleDeleteAccount} last />
        </View>

        <Text style={styles.sectionHeader}>Help</Text>
        <View style={styles.section}>
          <SettingsRow label="Get help" isLink onPress={handleHelp} />
          <SettingsRow label="How Making Tax Digital works" isLink onPress={handleMtd} last />
        </View>

        <Text style={styles.sectionHeader}>Preferences</Text>
        <View style={styles.section}>
          <SettingsRow label="Currency" value="GBP" />
          <SettingsRow label="Tax year" value="UK, Apr to Apr" last />
        </View>

        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.section}>
          <SettingsRow label="App version" value="0.1.0" />
          <SettingsRow label="Privacy Policy" isLink onPress={() => openLink('https://lekhio.com/privacy')} />
          <SettingsRow label="Terms of Service" isLink onPress={() => openLink('https://lekhio.com/terms')} last />
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>Lekhio. Your back office, in your pocket.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scroll: { paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  title: { fontWeight: '700', fontSize: 28, color: INK },
  planCard: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: INDIGO_TINT,
    borderRadius: 14,
    padding: 18,
  },
  planLeft: { flex: 1 },
  planLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: INDIGO,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  planName: { fontSize: 20, fontWeight: '800', color: INK, marginTop: 2 },
  planSub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  controlCard: {
    marginHorizontal: 24,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E3D9',
    padding: 18,
  },
  controlTitle: { fontSize: 17, fontWeight: '800', color: INK },
  controlSub: { fontSize: 13.5, color: '#6B7280', marginTop: 6, lineHeight: 20, marginBottom: 12 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  promiseTick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E7F5EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  promiseTickText: { fontSize: 11, fontWeight: '800', color: '#15803D' },
  promiseText: { flex: 1, fontSize: 13.5, color: INK, lineHeight: 19 },
  controlLink: { fontSize: 13.5, fontWeight: '700', color: INDIGO, marginTop: 6 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 8px rgba(0,0,0,0.04)' } as any)
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 5,
          elevation: 1,
        }),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F0EA',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, color: INK },
  rowValue: { fontSize: 15, color: '#888888', textAlign: 'right', flex: 1, marginLeft: 12 },
  chevron: { fontSize: 20, color: '#C4C4C4', fontWeight: '400' },
  bankLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  bankIcon: { fontSize: 22 },
  bankSub: { fontSize: 12.5, color: '#888888', marginTop: 2 },
  soonPill: { backgroundColor: '#FBEFD8', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  soonText: { fontSize: 10.5, fontWeight: '800', color: '#C9842A', letterSpacing: 0.6 },
  connectedPill: { backgroundColor: '#E7F5EC', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  disconnectLabel: { color: '#C0392B', fontSize: 15.5, fontWeight: '600' },
  connectedText: { fontSize: 10.5, fontWeight: '800', color: '#15803D', letterSpacing: 0.6 },
  signOutButton: {
    marginHorizontal: 24,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0D4D4',
    backgroundColor: '#FFFFFF',
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#DC2626', textAlign: 'center' },
  footerNote: { fontSize: 12, color: '#B0B0B0', textAlign: 'center', marginTop: 24 },
});
