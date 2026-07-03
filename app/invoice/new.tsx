import React, { useState } from 'react';
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
import { router } from 'expo-router';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { createInvoice, LineItem } from '../../lib/supabase';
import { formatGBP } from '../../lib/format';
import { FadeIn, PressableScale } from '../../components/Motion';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#6B7280';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://tradebook-app-five.vercel.app';

interface EditableLine {
  description: string;
  amount: string;
}

export default function NewInvoiceScreen() {
  const { user } = useCurrentUser();
  const [customer, setCustomer] = useState('');
  const [contact, setContact] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([{ description: '', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [jobText, setJobText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount.replace(/[^0-9.]/g, '')) || 0), 0);

  function updateLine(i: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: '', amount: '' }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function draftWithAi() {
    if (!jobText.trim()) {
      Alert.alert('Tell me about the job', 'Type a few words about the work and I will draft the lines.');
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch(`${WEB_URL}/api/draft-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: jobText.trim() }),
      });
      if (!res.ok) throw new Error('draft failed');
      const data = (await res.json()) as {
        customer_name?: string;
        line_items?: Array<{ description: string; amount: number }>;
      };
      if (data.customer_name && !customer) setCustomer(data.customer_name);
      if (data.line_items && data.line_items.length > 0) {
        setLines(data.line_items.map((li) => ({ description: li.description, amount: String(li.amount) })));
      }
    } catch {
      Alert.alert('Could not draft that', 'Add the lines yourself below, or try again.');
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    if (!user) return;
    if (!customer.trim()) {
      Alert.alert('Who is it for?', 'Add the customer name.');
      return;
    }
    const items: LineItem[] = lines
      .map((l) => ({ description: l.description.trim(), amount: parseFloat(l.amount.replace(/[^0-9.]/g, '')) || 0 }))
      .filter((l) => l.description && l.amount > 0);
    if (items.length === 0) {
      Alert.alert('Add a line', 'Add at least one line with a description and an amount.');
      return;
    }
    setSaving(true);
    const id = await createInvoice(user.id, {
      customer_name: customer.trim(),
      customer_contact: contact.trim() || undefined,
      line_items: items,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (id) {
      router.replace(`/invoice/${id}`);
    } else {
      Alert.alert('Could not save', 'Please try again.');
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>New invoice</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* AI draft */}
        <FadeIn style={styles.aiCard}>
          <Text style={styles.aiTitle}>Let Lekhio draft it</Text>
          <Text style={styles.aiSub}>Say what the job was. We turn it into invoice lines.</Text>
          <TextInput
            style={styles.aiInput}
            value={jobText}
            onChangeText={setJobText}
            placeholder="Rewired the bathroom for Dave, 500 labour and 80 for materials"
            placeholderTextColor="#9CA3AF"
            multiline
          />
          <PressableScale style={styles.aiButton} onPress={draftWithAi} disabled={drafting}>
            {drafting ? <ActivityIndicator color={INDIGO} /> : <Text style={styles.aiButtonText}>Draft with AI</Text>}
          </PressableScale>
        </FadeIn>

        <Text style={styles.label}>Customer</Text>
        <TextInput style={styles.input} value={customer} onChangeText={setCustomer} placeholder="Customer name" placeholderTextColor="#9CA3AF" />

        <Text style={styles.label}>Their email or number (optional)</Text>
        <TextInput style={styles.input} value={contact} onChangeText={setContact} placeholder="dave@example.com" placeholderTextColor="#9CA3AF" autoCapitalize="none" />

        <Text style={styles.label}>Lines</Text>
        {lines.map((line, i) => (
          <View key={i} style={styles.lineRow}>
            <TextInput
              style={[styles.input, styles.lineDesc]}
              value={line.description}
              onChangeText={(t) => updateLine(i, { description: t })}
              placeholder="What for"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.lineAmountWrap}>
              <Text style={styles.pound}>£</Text>
              <TextInput
                style={styles.lineAmount}
                value={line.amount}
                onChangeText={(t) => updateLine(i, { amount: t })}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
            </View>
            {lines.length > 1 ? (
              <TouchableOpacity onPress={() => removeLine(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removeLine}>{'✕'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <TouchableOpacity onPress={addLine} style={styles.addLine} activeOpacity={0.7}>
          <Text style={styles.addLineText}>+ Add a line</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={[styles.input, styles.notes]} value={notes} onChangeText={setNotes} placeholder="Thanks for your business" placeholderTextColor="#9CA3AF" multiline />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatGBP(total)}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PressableScale style={styles.saveButton} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Create invoice</Text>}
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  aiCard: { backgroundColor: INDIGO_TINT, borderRadius: 16, padding: 18, marginBottom: 8 },
  aiTitle: { fontSize: 16, fontWeight: '700', color: INK },
  aiSub: { fontSize: 13, color: MUTED, marginTop: 4, marginBottom: 12 },
  aiInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: INK,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  aiButton: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: INDIGO },
  aiButtonText: { color: INDIGO, fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: INK },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  lineDesc: { flex: 1, marginBottom: 0 },
  lineAmountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, width: 110 },
  pound: { fontSize: 16, color: INK },
  lineAmount: { flex: 1, paddingVertical: 14, fontSize: 16, color: INK },
  removeLine: { fontSize: 16, color: '#DC2626', paddingHorizontal: 4 },
  addLine: { paddingVertical: 10 },
  addLineText: { color: INDIGO, fontSize: 15, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#ECECEC' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: INK },
  totalValue: { fontSize: 22, fontWeight: '800', color: INK },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  saveButton: { backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
