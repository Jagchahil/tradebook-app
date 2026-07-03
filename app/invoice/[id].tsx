import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getInvoice,
  setInvoiceStatus,
  markInvoicePaid,
  deleteInvoice,
  createInvoice,
  Invoice,
} from '../../lib/supabase';
import { formatGBP } from '../../lib/format';
import { FadeIn, PressableScale } from '../../components/Motion';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#6B7280';
const GREEN = '#15803D';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://tradebook-app-five.vercel.app';

function statusStyle(status: Invoice['status']) {
  if (status === 'paid') return { bg: '#DCFCE7', fg: GREEN, label: 'Paid' };
  if (status === 'sent') return { bg: INDIGO_TINT, fg: INDIGO, label: 'Sent' };
  return { bg: '#F2F0EA', fg: MUTED, label: 'Draft' };
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getInvoice(id)
      .then(setInv)
      .finally(() => setLoading(false));
  }, [id]);

  async function refresh() {
    if (!id) return;
    const updated = await getInvoice(id);
    setInv(updated);
  }

  async function handleShare() {
    if (!inv) return;
    const link = `${WEB_URL}/invoice/${inv.id}`;
    try {
      await Share.share({
        message: `Invoice ${inv.number} for ${formatGBP(inv.total)}.\nView it here: ${link}`,
      });
      if (inv.status === 'draft') {
        await setInvoiceStatus(inv.id, 'sent');
        await refresh();
      }
    } catch {
      // user cancelled share, nothing to do
    }
  }

  function reminderMessage(invoice: Invoice): string {
    const link = `${WEB_URL}/invoice/${invoice.id}`;
    const overdue = invoice.due_date ? new Date(invoice.due_date) < new Date() : false;
    return `Hi ${invoice.customer_name}, a friendly reminder that invoice ${invoice.number} for ${formatGBP(invoice.total)} is ${overdue ? 'now due for payment' : 'due soon'}. You can view and pay it here: ${link}. Thank you.`;
  }

  function ukIntl(contact: string): string {
    let d = contact.replace(/[^0-9]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '44' + d.slice(1);
    else if (!d.startsWith('44')) d = '44' + d;
    return d;
  }

  async function markSentIfDraft() {
    if (inv && inv.status === 'draft') {
      await setInvoiceStatus(inv.id, 'sent');
      await refresh();
    }
  }

  async function remindByText() {
    if (!inv) return;
    const msg = reminderMessage(inv);
    const contact = inv.customer_contact || '';
    const digits = contact.replace(/[^0-9]/g, '');
    try {
      if (digits.length >= 10) {
        const phone = ukIntl(contact);
        const waApp = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`;
        const canWa = await Linking.canOpenURL(waApp);
        if (canWa) {
          await Linking.openURL(waApp);
        } else {
          await Linking.openURL(`sms:${contact}?body=${encodeURIComponent(msg)}`);
        }
      } else {
        await Share.share({ message: msg });
      }
      await markSentIfDraft();
    } catch {
      Alert.alert('Could not open your messages', 'You can copy the reminder and send it yourself.', [{ text: 'OK' }]);
    }
  }

  async function remindByEmail() {
    if (!inv) return;
    const msg = reminderMessage(inv);
    const to = (inv.customer_contact || '').includes('@') ? inv.customer_contact : '';
    const subject = `Reminder: invoice ${inv.number}`;
    try {
      await Linking.openURL(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`);
      await markSentIfDraft();
    } catch {
      Alert.alert('Could not open your email', 'You can copy the reminder and send it yourself.', [{ text: 'OK' }]);
    }
  }

  function sendReminder() {
    if (!inv) return;
    Alert.alert(
      'Send a payment reminder',
      'A polite reminder is ready to send from your own messages, with the pay link included. Pick how to send it.',
      [
        { text: 'By text', onPress: remindByText },
        { text: 'By email', onPress: remindByEmail },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function handleMarkPaid() {
    if (!inv) return;
    Alert.alert('Mark as paid?', `This books ${formatGBP(inv.total)} as income from ${inv.customer_name}.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          setBusy(true);
          const ok = await markInvoicePaid(inv);
          setBusy(false);
          if (ok) await refresh();
          else Alert.alert('Could not update', 'Please try again.');
        },
      },
    ]);
  }

  function handleDuplicate() {
    if (!inv) return;
    Alert.alert('Duplicate this invoice?', `Make a new draft for ${inv.customer_name} with the same lines. Handy for a repeat job.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Duplicate',
        onPress: async () => {
          if (!inv) return;
          setBusy(true);
          const newId = await createInvoice(inv.user_id, {
            customer_name: inv.customer_name,
            customer_contact: inv.customer_contact ?? undefined,
            line_items: inv.line_items,
            notes: inv.notes ?? undefined,
          });
          setBusy(false);
          if (newId) router.replace(`/invoice/${newId}`);
          else Alert.alert('Could not duplicate', 'Please try again.');
        },
      },
    ]);
  }

  function handleDelete() {
    if (!inv) return;
    Alert.alert('Delete this invoice?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteInvoice(inv.id);
          if (ok) router.back();
          else Alert.alert('Could not delete', 'Please try again.');
        },
      },
    ]);
  }

  const st = inv ? statusStyle(inv.status) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>{inv?.number ?? 'Invoice'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={INDIGO} size="large" />
        </View>
      ) : !inv ? (
        <View style={styles.centre}>
          <Text style={styles.missing}>We could not find that invoice.</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            <FadeIn style={styles.head}>
              <Text style={styles.customer}>{inv.customer_name}</Text>
              {st ? (
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                </View>
              ) : null}
            </FadeIn>
            {inv.customer_contact ? <Text style={styles.contact}>{inv.customer_contact}</Text> : null}

            <View style={styles.card}>
              {inv.line_items.map((li, i) => (
                <View key={i} style={[styles.lineRow, i > 0 ? styles.lineBorder : null]}>
                  <Text style={styles.lineDesc}>{li.description}</Text>
                  <Text style={styles.lineAmount}>{formatGBP(li.amount)}</Text>
                </View>
              ))}
              <View style={[styles.lineRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatGBP(inv.total)}</Text>
              </View>
            </View>

            {inv.notes ? <Text style={styles.notes}>{inv.notes}</Text> : null}

            {inv.status === 'paid' ? (
              <View style={styles.paidNote}>
                <Text style={styles.paidNoteText}>Paid. Booked as income in your books.</Text>
              </View>
            ) : (
              <Text style={styles.hint}>
                Share the link with your customer. When they pay, mark it paid and it lands in your income.
              </Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <PressableScale style={styles.shareButton} onPress={handleShare}>
              <Text style={styles.shareText}>Share with customer</Text>
            </PressableScale>
            {inv.status !== 'paid' ? (
              <PressableScale style={styles.remindButton} onPress={sendReminder}>
                <Text style={styles.remindText}>Send a payment reminder</Text>
              </PressableScale>
            ) : null}
            {inv.status !== 'paid' ? (
              <PressableScale style={styles.paidButton} onPress={handleMarkPaid} disabled={busy}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.paidButtonText}>Mark as paid</Text>}
              </PressableScale>
            ) : null}
            <TouchableOpacity onPress={handleDuplicate} style={styles.deleteButton} activeOpacity={0.7} disabled={busy}>
              <Text style={styles.duplicateText}>Duplicate for a repeat job</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} activeOpacity={0.7}>
              <Text style={styles.deleteText}>Delete invoice</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  missing: { fontSize: 15, color: MUTED },
  scroll: { paddingHorizontal: 24, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  customer: { fontSize: 24, fontWeight: '800', color: INK, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  contact: { fontSize: 14, color: MUTED, marginTop: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F2F0EA' },
  lineDesc: { fontSize: 15, color: INK, flex: 1, marginRight: 12 },
  lineAmount: { fontSize: 15, color: INK, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#ECECEC', marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: INK },
  totalValue: { fontSize: 18, fontWeight: '800', color: INK },
  notes: { fontSize: 14, color: MUTED, marginTop: 16, lineHeight: 20 },
  hint: { fontSize: 13, color: MUTED, marginTop: 20, lineHeight: 19, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14 },
  paidNote: { marginTop: 20, backgroundColor: '#DCFCE7', borderRadius: 10, padding: 14 },
  paidNoteText: { fontSize: 14, color: GREEN, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 10 },
  shareButton: { backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  remindButton: { backgroundColor: INDIGO_TINT, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  remindText: { color: INDIGO, fontSize: 16, fontWeight: '700' },
  paidButton: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  paidButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  deleteButton: { paddingVertical: 8, alignItems: 'center' },
  duplicateText: { color: INDIGO, fontSize: 15, fontWeight: '600' },
  deleteText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
