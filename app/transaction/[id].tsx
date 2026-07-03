import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
  Transaction,
} from '../../lib/supabase';
import { formatGBP, categoryEmoji } from '../../lib/format';
import { FadeIn, PressableScale } from '../../components/Motion';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#5B6470';
const GREEN = '#15803D';
const RED = '#C0392B';

// Keep in sync with app/add.tsx CATEGORIES so any logged category can be re-selected here.
const CATEGORIES = ['materials', 'fuel', 'tools', 'wages', 'subcontractor', 'meals', 'travel', 'phone', 'other'];

function prettyDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vendor, setVendor] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('other');
  // Explicit direction the user can correct, seeded from the loaded transaction.
  // Once set, the save uses this, not a re-derivation of the old amount's sign.
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');

  useEffect(() => {
    if (!id) return;
    getTransaction(id)
      .then((data) => {
        if (data) {
          setTx(data);
          setVendor(data.merchant_name ?? '');
          setAmountText(Math.abs(data.amount ?? 0).toFixed(2));
          setCategory((data.category ?? 'other').toLowerCase());
          setDirection((data.amount ?? 0) > 0 ? 'income' : 'expense');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isExpense = direction === 'expense';

  async function persist(extra: { confirmed?: boolean } = {}) {
    if (!id) return false;
    const magnitude = Math.abs(parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
    const signed = isExpense ? -magnitude : magnitude;
    setSaving(true);
    const ok = await updateTransaction(id, {
      merchant_name: vendor.trim() || 'Unknown',
      amount: signed,
      category,
      ...extra,
    });
    setSaving(false);
    return ok;
  }

  async function handleConfirm() {
    const ok = await persist({ confirmed: true });
    if (ok) {
      router.back();
    } else {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    }
  }

  async function handleSave() {
    const ok = await persist();
    if (ok) {
      router.back();
    } else {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    }
  }

  function handleDelete() {
    Alert.alert('Delete this entry?', 'This removes it from your books for good.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const ok = await deleteTransaction(id);
          if (ok) router.back();
          else Alert.alert('Could not delete', 'Please try again.');
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.back}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Receipt</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={INDIGO} size="large" />
        </View>
      ) : !tx ? (
        <View style={styles.centre}>
          <Text style={styles.missing}>We could not find that entry.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FadeIn style={styles.amountCard}>
            <Text style={styles.emoji}>{categoryEmoji(category)}</Text>
            <Text style={[styles.amountBig, { color: isExpense ? RED : GREEN }]}>
              {isExpense ? '-' : '+'}{formatGBP(Number(amountText) || 0)}
            </Text>
            <View style={[styles.statusPill, tx.confirmed ? styles.statusConfirmed : styles.statusReview]}>
              <Text style={[styles.statusText, tx.confirmed ? styles.statusTextConfirmed : styles.statusTextReview]}>
                {tx.confirmed ? 'Confirmed' : 'To review'}
              </Text>
            </View>
            {prettyDate(tx.transaction_date ?? tx.created_at) ? (
              <Text style={styles.dateText}>{prettyDate(tx.transaction_date ?? tx.created_at)}</Text>
            ) : null}
          </FadeIn>

          <Text style={styles.label}>Who from</Text>
          <TextInput style={styles.input} value={vendor} onChangeText={setVendor} placeholder="Vendor name" placeholderTextColor="#9CA3AF" />

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.pound}>£</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <Text style={styles.label}>Direction</Text>
          <View style={styles.chips}>
            {([
              { key: 'expense', label: 'Expense' },
              { key: 'income', label: 'Income' },
            ] as const).map((opt) => {
              const active = opt.key === direction;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => setDirection(opt.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark as ${opt.label}`}
                >
                  <Text style={styles.chipEmoji}>{opt.key === 'income' ? '⬆️' : '⬇️'}</Text>
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => setCategory(c)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipEmoji}>{categoryEmoji(c)}</Text>
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!tx.confirmed ? (
            <Text style={styles.reviewNote}>
              Check the details are right, then confirm. Nothing counts towards your tax until you confirm it.
            </Text>
          ) : null}

          <View style={styles.actions}>
            {!tx.confirmed ? (
              <PressableScale
                style={styles.confirmButton}
                onPress={handleConfirm}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Confirm receipt"
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Looks right. Confirm</Text>}
              </PressableScale>
            ) : (
              <PressableScale style={styles.saveButton} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={INDIGO} /> : <Text style={styles.saveText}>Save changes</Text>}
              </PressableScale>
            )}

            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} activeOpacity={0.7}>
              <Text style={styles.deleteText}>Delete this entry</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  missing: { fontSize: 15, color: MUTED },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  amountCard: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 12,
  },
  emoji: { fontSize: 36, marginBottom: 10 },
  amountBig: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  statusPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 12 },
  statusReview: { backgroundColor: '#FEF3C7' },
  statusConfirmed: { backgroundColor: '#DCFCE7' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextReview: { color: '#B45309' },
  statusTextConfirmed: { color: '#15803D' },
  dateText: { fontSize: 13, color: MUTED, marginTop: 10 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: INK,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  pound: { fontSize: 18, color: INK, marginRight: 4 },
  amountInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: INK },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: INDIGO_TINT, borderColor: INDIGO },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 14, color: INK, fontWeight: '500' },
  chipTextActive: { color: INDIGO, fontWeight: '700' },
  reviewNote: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
    marginTop: 20,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 14,
  },
  actions: { marginTop: 24, gap: 12 },
  confirmButton: {
    backgroundColor: INDIGO,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  saveButton: {
    backgroundColor: INDIGO_TINT,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  saveText: { color: INDIGO, fontSize: 16, fontWeight: '700' },
  deleteButton: { paddingVertical: 12, alignItems: 'center' },
  deleteText: { color: RED, fontSize: 15, fontWeight: '600' },
});
