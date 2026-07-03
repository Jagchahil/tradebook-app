import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  RefreshControl,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getEvents, deleteEvent, getReminderPrefs, setReminderPrefs, DiaryEvent } from '../lib/supabase';
import { INK, RIVER, RIVER_TINT, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

function kindEmoji(kind: string): string {
  if (kind === 'job') return '🔧';
  if (kind === 'quote') return '📋';
  if (kind === 'note') return '📝';
  return '⏰';
}

function whenLabel(iso: string | null): string {
  if (!iso) return 'No time set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No time set';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export default function DiaryScreen() {
  const { user } = useCurrentUser();
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyNudges, setDailyNudges] = useState(true);

  async function load() {
    if (!user) return;
    const [evs, prefs] = await Promise.all([getEvents(user.id), getReminderPrefs(user.id)]);
    setEvents(evs);
    setDailyNudges(prefs.daily_nudges);
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleNudges(value: boolean) {
    setDailyNudges(value);
    if (user) await setReminderPrefs(user.id, { daily_nudges: value });
  }

  function confirmDelete(ev: DiaryEvent) {
    Alert.alert('Remove this?', `"${ev.title}" will be removed from your diary.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteEvent(ev.id);
          if (ok) setEvents((prev) => prev.filter((e) => e.id !== ev.id));
        },
      },
    ]);
  }

  const now = Date.now();
  const upcoming = events.filter((e) => !e.remind_at || new Date(e.remind_at).getTime() >= now - 3600000);
  const past = events.filter((e) => e.remind_at && new Date(e.remind_at).getTime() < now - 3600000);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PAPER} />
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} style={styles.backHit}>
          <Text style={styles.back}>{'←'}</Text>
        </PressableScale>
        <Text style={styles.topTitle}>Diary</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={RIVER} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RIVER} colors={[RIVER]} />}
        >
          <FadeIn>
            <Text style={styles.h1}>Your diary</Text>
            <RiverAccent />
            <Text style={styles.intro}>Text Lekhio things like "remind me to price up Dave's job tomorrow at 8am" and they land here. You get a text when they are due.</Text>
          </FadeIn>

          {/* Reminder toggle */}
          <FadeIn delay={80}>
            <View style={styles.toggleCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Daily expense reminders</Text>
                <Text style={styles.toggleSub}>A gentle nudge twice a day so you never forget to log a receipt.</Text>
              </View>
              <Switch value={dailyNudges} onValueChange={toggleNudges} trackColor={{ false: '#D8D4CC', true: RIVER }} thumbColor={WHITE} />
            </View>
          </FadeIn>

          {/* Upcoming */}
          <FadeIn delay={140}>
            <Text style={styles.sectionLabel}>Coming up</Text>
          </FadeIn>
          {upcoming.length === 0 ? (
            <FadeIn delay={160}>
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🗓️</Text>
                <Text style={styles.emptyText}>Nothing in the diary yet. Text Lekhio to add your first reminder.</Text>
              </View>
            </FadeIn>
          ) : (
            <View style={styles.list}>
              {upcoming.map((ev, i) => (
                <FadeIn key={ev.id} delay={160 + i * 50}>
                  <PressableScale style={styles.row} onPress={() => confirmDelete(ev)}>
                    <View style={styles.rowIcon}><Text style={{ fontSize: 17 }}>{kindEmoji(ev.kind)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{ev.title}</Text>
                      <Text style={styles.rowWhen}>{whenLabel(ev.remind_at)}</Text>
                    </View>
                  </PressableScale>
                </FadeIn>
              ))}
            </View>
          )}

          {/* Past */}
          {past.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Done and gone</Text>
              <View style={[styles.list, { opacity: 0.6 }]}>
                {past.slice(0, 10).map((ev) => (
                  <View key={ev.id} style={styles.row}>
                    <View style={styles.rowIcon}><Text style={{ fontSize: 17 }}>{kindEmoji(ev.kind)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{ev.title}</Text>
                      <Text style={styles.rowWhen}>{whenLabel(ev.remind_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backHit: { paddingHorizontal: 4, paddingVertical: 2 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  h1: { fontSize: 24, fontWeight: '800', color: INK, marginTop: 8, letterSpacing: -0.6 },
  intro: { fontSize: 14, color: MUTED, marginTop: 12, lineHeight: 20 },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE,
    borderRadius: 16, padding: 18, marginTop: 18,
  },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: INK },
  toggleSub: { fontSize: 12.5, color: MUTED, lineHeight: 18, marginTop: 3 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 26, marginBottom: 10 },
  list: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SURFACE, backgroundColor: WHITE },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: RIVER_TINT, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  rowWhen: { fontSize: 13, color: RIVER, marginTop: 2, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 38, marginBottom: 10 },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
});
