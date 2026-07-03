import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { INK, RIVER, RIVER_TINT, GREEN, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

// Connect your bank. Read only: Lekhio can see transactions to log them for
// tax, and can never move money. The consent journey is hosted by TrueLayer,
// our FCA regulated Open Banking provider; we never see bank credentials.
// The screen is reachable only when the server says the feature is on
// (Settings hides the row otherwise), and every imported transaction lands as
// "to review", so the user approves everything, same as a WhatsApp capture.

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://tradebook-app-five.vercel.app';

interface Institution {
  id: string;
  name: string;
  logo: string | null;
}

export default function BankConnectScreen() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        const res = await fetch(`${API_BASE}/api/bank/institutions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const json = (await res.json()) as { institutions?: Institution[] };
        setInstitutions(json.institutions ?? []);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function connect(institution: Institution) {
    if (connectingId) return;
    setConnectingId(institution.id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const res = await fetch(`${API_BASE}/api/bank/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ institution_id: institution.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!res.ok || !json.link) {
        // Surface the server's error code so a failure is diagnosable from the
        // phone during testing, without exposing anything sensitive.
        const code = json.error ? ` (${json.error} ${res.status})` : ` (${res.status})`;
        Alert.alert('Could not start that', `Give it another go in a minute. Nothing has been shared.${code}`);
        return;
      }
      await Linking.openURL(json.link);
      Alert.alert(
        'Finish up with your bank',
        'Approve read only access in the window that just opened. When it says connected, your transactions will start arriving each day, ready for you to review. Nothing counts toward your tax until you confirm it.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Could not start that', 'Check your connection and try again.');
    } finally {
      setConnectingId(null);
    }
  }

  const filtered = institutions.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </PressableScale>
        <Text style={styles.title}>Connect your bank</Text>
        <RiverAccent width={64} />
        <Text style={styles.sub}>
          Read only. Lekhio sees transactions so your books fill themselves in, and can never move your money.
          Everything arrives as "to review", so nothing counts until you confirm it.
        </Text>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={RIVER} />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <Text style={styles.emptyTitle}>Not available just now</Text>
          <Text style={styles.emptyBody}>Bank connections are not switched on yet, or the connection dropped. Try again later; your books by WhatsApp work as normal.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TextInput
              style={styles.search}
              placeholder="Search your bank..."
              placeholderTextColor={MUTED}
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search your bank"
            />
          }
          renderItem={({ item }) => (
            <PressableScale
              style={styles.bankRow}
              onPress={() => connect(item)}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${item.name}`}
            >
              <View style={styles.bankBadge}>
                <Text style={styles.bankBadgeText}>{item.name.slice(0, 1)}</Text>
              </View>
              <Text style={styles.bankName} numberOfLines={1}>{item.name}</Text>
              {connectingId === item.id ? (
                <ActivityIndicator size="small" color={RIVER} />
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </PressableScale>
          )}
          ListEmptyComponent={
            <View style={styles.centre}>
              <Text style={styles.emptyBody}>No bank matches that search.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <FadeIn style={styles.footer}>
        <Text style={styles.footerText}>
          Connections are provided by TrueLayer, an FCA regulated Open Banking provider. Lekhio never sees your
          bank login. Access is read only and you can disconnect at any time.
        </Text>
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  back: { color: RIVER, fontSize: 15, fontWeight: '600', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', color: INK, letterSpacing: -0.6, marginBottom: 8 },
  sub: { fontSize: 14.5, color: MUTED, lineHeight: 21, marginTop: 10 },
  centre: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: INK, marginBottom: 6 },
  emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  search: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15.5,
    color: INK,
    marginBottom: 12,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 12 },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  bankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RIVER_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bankBadgeText: { color: RIVER, fontWeight: '800', fontSize: 15 },
  bankName: { flex: 1, fontSize: 15.5, fontWeight: '600', color: INK },
  chevron: { fontSize: 22, color: MUTED, marginLeft: 8 },
  footer: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: SURFACE },
  footerText: { fontSize: 12, color: MUTED, lineHeight: 17 },
});
