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
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getUserProfile, updateUserProfile } from '../lib/supabase';

const RIVER = '#1B59A6';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#5B6470';

export default function ProfileScreen() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.id)
      .then((p) => {
        if (p) {
          setName(p.name ?? '');
          setBusiness(p.business_name ?? '');
          setAddress(p.address ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const ok = await updateUserProfile(user.id, {
      name: name.trim(),
      business_name: business.trim(),
      address: address.trim(),
    });
    setSaving(false);
    if (ok) router.back();
    else Alert.alert('Could not save', 'Please try again.');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Your business</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={RIVER} size="large" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>This is what shows at the top of your invoices.</Text>

            <Text style={styles.label}>Your name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Sam Smith" placeholderTextColor="#9CA3AF" />

            <Text style={styles.label}>Business name</Text>
            <TextInput style={styles.input} value={business} onChangeText={setBusiness} placeholder="Smith Electrical" placeholderTextColor="#9CA3AF" />

            <Text style={styles.label}>Address (optional)</Text>
            <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} placeholder="Unit 4, Mill Road, Leeds" placeholderTextColor="#9CA3AF" multiline />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  intro: { fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 8, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E3D9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: INK },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#F0EEE8' },
  saveButton: { backgroundColor: RIVER, borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
