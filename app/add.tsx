import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { addManualTransaction } from '../lib/supabase';
import { INK, RIVER, RIVER_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

type Kind = 'expense' | 'income' | 'mileage';
const CATEGORIES = ['materials', 'fuel', 'tools', 'wages', 'subcontractor', 'meals', 'travel', 'phone', 'other'];
const MILE_RATE = 0.55; // HMRC simplified rate 2026/27: car or van, 55p first 10,000 business miles, then 25p
const JOURNEYS_KEY = 'lekhio.journeys';

type Journey = { name: string; miles: number };

export default function AddScreen() {
  const { user } = useCurrentUser();
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [miles, setMiles] = useState('');
  const [who, setWho] = useState('');
  const [category, setCategory] = useState('materials');
  const [saving, setSaving] = useState(false);
  const [journeyName, setJourneyName] = useState('');
  const [journeys, setJourneys] = useState<Journey[]>([]);

  const milesNum = parseInt(miles || '0', 10) || 0;
  const mileageAmount = Math.round(milesNum * MILE_RATE * 100) / 100;

  useEffect(() => {
    AsyncStorage.getItem(JOURNEYS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setJourneys(parsed);
        } catch {
          // ignore corrupt store
        }
      })
      .catch(() => {});
  }, []);

  async function persistJourneys(next: Journey[]) {
    setJourneys(next);
    try {
      await AsyncStorage.setItem(JOURNEYS_KEY, JSON.stringify(next));
    } catch {
      // best effort, not critical
    }
  }

  function saveJourney() {
    const nm = journeyName.trim();
    if (milesNum <= 0 || !nm) {
      Alert.alert('Name and miles', 'Add the miles and a short name, like Yard to site.');
      return;
    }
    const next = [{ name: nm, miles: milesNum }, ...journeys.filter((j) => j.name.toLowerCase() !== nm.toLowerCase())].slice(0, 8);
    persistJourneys(next);
    setJourneyName('');
    Alert.alert('Saved', `${nm} saved. Tap it next time to log ${milesNum} miles in one go.`);
  }

  async function save() {
    if (!user) {
      Alert.alert('Not signed in', 'Open the app and sign in first.');
      return;
    }
    setSaving(true);
    let ok = false;
    if (kind === 'mileage') {
      if (milesNum <= 0) {
        setSaving(false);
        Alert.alert('Add the miles', 'Tell me how many business miles to log.');
        return;
      }
      ok = await addManualTransaction(user.id, { direction: 'expense', amount: mileageAmount, merchant_name: 'Mileage', category: 'travel' });
    } else {
      const amt = parseFloat(amount || '0') || 0;
      if (amt <= 0) {
        setSaving(false);
        Alert.alert('Add the amount', 'Tell me how much it was.');
        return;
      }
      ok = await addManualTransaction(user.id, {
        direction: kind === 'income' ? 'income' : 'expense',
        amount: amt,
        merchant_name: who.trim(),
        category: kind === 'income' ? 'income' : category,
      });
    }
    setSaving(false);
    if (ok) {
      Alert.alert('Logged', 'It is in your Lekhio, ready to review and approve.', [{ text: 'Done', onPress: () => router.back() }]);
    } else {
      Alert.alert('Could not save', 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FadeIn style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <Text style={styles.title}>Add an entry</Text>
          <RiverAccent />
          <Text style={styles.sub}>For when WhatsApp is not handy. It still goes to review so you approve it.</Text>
        </FadeIn>

        {/* Kind toggle */}
        <FadeIn delay={70}>
          <View style={styles.seg}>
            {(['expense', 'income', 'mileage'] as Kind[]).map((k) => (
              <PressableScale key={k} onPress={() => setKind(k)} style={[styles.segBtn, kind === k ? styles.segBtnOn : null]}>
                <Text style={[styles.segText, kind === k ? styles.segTextOn : null]}>{k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Mileage'}</Text>
              </PressableScale>
            ))}
          </View>
        </FadeIn>

        <FadeIn delay={110}>
          <View style={styles.card}>
            {kind === 'mileage' ? (
              <>
                <Text style={styles.label}>Business miles</Text>
                <TextInput value={miles} onChangeText={(v) => setMiles(v.replace(/[^0-9]/g, ''))} placeholder="e.g. 24" placeholderTextColor="#9AA3AF" keyboardType="number-pad" style={styles.input} />
                <View style={styles.mileNote}>
                  <Text style={styles.mileNoteText}>{milesNum > 0 ? `${milesNum} miles at 55p is £${mileageAmount.toFixed(2)} of travel.` : 'Car or van, 55p a mile for the first 10,000 business miles. The HMRC approved rate.'}</Text>
                </View>

                {journeys.length > 0 ? (
                  <>
                    <Text style={[styles.label, { marginTop: 16 }]}>Your regular trips</Text>
                    <View style={styles.chips}>
                      {journeys.map((j) => (
                        <PressableScale key={j.name} onPress={() => setMiles(String(j.miles))} style={styles.journeyChip}>
                          <Text style={styles.journeyChipText}>{j.name}</Text>
                          <Text style={styles.journeyChipMiles}>{j.miles} mi</Text>
                        </PressableScale>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={[styles.label, { marginTop: 16 }]}>Save this as a regular trip (optional)</Text>
                <View style={styles.saveTripRow}>
                  <TextInput value={journeyName} onChangeText={setJourneyName} placeholder="e.g. Yard to site" placeholderTextColor="#9AA3AF" style={[styles.input, { flex: 1 }]} />
                  <PressableScale onPress={saveJourney} style={styles.saveTripBtn}>
                    <Text style={styles.saveTripBtnText}>Save</Text>
                  </PressableScale>
                </View>

                <View style={styles.autoMile}>
                  <View style={styles.autoMileTop}>
                    <Text style={styles.autoMileTitle}>Automatic mileage tracking</Text>
                    <View style={styles.soonPill}><Text style={styles.soonText}>COMING SOON</Text></View>
                  </View>
                  <Text style={styles.autoMileSub}>Soon Lekhio will log your business drives for you in the background, so you never lose a mile. Optional, private, and you stay in control.</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Amount</Text>
                <View style={styles.amountWrap}>
                  <Text style={styles.pound}>£</Text>
                  <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor="#9AA3AF" keyboardType="decimal-pad" style={styles.amountInput} />
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>{kind === 'income' ? 'From (optional)' : 'Where (optional)'}</Text>
                <TextInput value={who} onChangeText={setWho} placeholder={kind === 'income' ? 'e.g. Dave Wilson' : 'e.g. Screwfix'} placeholderTextColor="#9AA3AF" style={styles.input} />

                {kind === 'expense' ? (
                  <>
                    <Text style={[styles.label, { marginTop: 16 }]}>Category</Text>
                    <View style={styles.chips}>
                      {CATEGORIES.map((c) => (
                        <PressableScale key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c ? styles.chipOn : null]}>
                          <Text style={[styles.chipText, category === c ? styles.chipTextOn : null]}>{c}</Text>
                        </PressableScale>
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            )}
          </View>
        </FadeIn>

        <FadeIn delay={150}>
          <PressableScale onPress={save} style={[styles.saveBtn, saving ? { opacity: 0.6 } : null]} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Log it'}</Text>
          </PressableScale>
        </FadeIn>

        <Text style={styles.footnote}>Tip: the fastest way is still WhatsApp. Snap a receipt or say it, and it lands here too.</Text>
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
  seg: { flexDirection: 'row', backgroundColor: SURFACE, borderRadius: 12, padding: 4, marginHorizontal: 24, marginTop: 14, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: WHITE, ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 }) },
  segText: { fontSize: 14, fontWeight: '700', color: MUTED },
  segTextOn: { color: INK },
  card: { marginHorizontal: 24, marginTop: 16, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 20 },
  label: { fontSize: 13, fontWeight: '700', color: INK, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, fontSize: 16, color: INK, backgroundColor: WHITE },
  amountWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12, backgroundColor: WHITE },
  pound: { fontSize: 20, fontWeight: '800', color: RIVER, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '700', color: INK, paddingVertical: 13 },
  mileNote: { backgroundColor: RIVER_TINT, borderRadius: 10, padding: 12, marginTop: 12 },
  mileNoteText: { fontSize: 13.5, color: RIVER, lineHeight: 19 },
  journeyChip: { borderWidth: 1.5, borderColor: RIVER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: RIVER_TINT, alignItems: 'center' },
  journeyChipText: { fontSize: 13.5, fontWeight: '700', color: RIVER },
  journeyChipMiles: { fontSize: 11.5, fontWeight: '600', color: RIVER, marginTop: 1, opacity: 0.8 },
  saveTripRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveTripBtn: { backgroundColor: RIVER, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveTripBtnText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  autoMile: { marginTop: 18, backgroundColor: SURFACE, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: LINE },
  autoMileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  autoMileTitle: { fontSize: 14.5, fontWeight: '800', color: INK },
  autoMileSub: { fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 18 },
  soonPill: { backgroundColor: '#FBEFD8', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  soonText: { fontSize: 10, fontWeight: '800', color: '#C9842A', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: LINE, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: WHITE },
  chipOn: { backgroundColor: RIVER, borderColor: RIVER },
  chipText: { fontSize: 13.5, fontWeight: '600', color: INK, textTransform: 'capitalize' },
  chipTextOn: { color: WHITE },
  saveBtn: { marginHorizontal: 24, marginTop: 18, backgroundColor: RIVER, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: WHITE, fontSize: 16, fontWeight: '700' },
  footnote: { fontSize: 12.5, color: MUTED, paddingHorizontal: 24, marginTop: 22, lineHeight: 18, textAlign: 'center' },
});
