import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { INK, RIVER, RIVER_TINT, GREEN, PAPER, SURFACE, LINE, MUTED, WHITE } from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://tradebook-app-five.vercel.app';

interface Msg { role: 'user' | 'bot'; text: string }

const STARTERS = [
  'How much can I earn before I pay tax?',
  'Can I claim my van and fuel?',
  'Do I need to register for VAT?',
  'When is my first MTD update due?',
  'How much should I set aside for tax?',
];

const WELCOME =
  'Hi, I am your Lekhio accountant. Ask me anything about your tax, expenses, CIS, VAT, or your numbers. I will give you a real answer in plain English. I prepare and explain, you stay in control.';

export default function AccountantScreen() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, sending]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || sending || locked) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q }),
      });
      const json = (await res.json().catch(() => ({}))) as { answer?: string; remaining?: number; error?: string };
      const answer = json.answer || 'I could not work that out just now. Try rewording it, or ask me something else.';
      setMessages((m) => [...m, { role: 'bot', text: answer }]);
      if (typeof json.remaining === 'number') setRemaining(json.remaining);
      if (json.error === 'daily_limit') setLocked(true);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'I could not reach the accountant just now. Check your connection and try again.' }]);
    } finally {
      setSending(false);
    }
  }

  const showStarters = messages.length <= 1 && !sending;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
          <View style={styles.headRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>📊</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Ask Lekhio</Text>
              <Text style={styles.online}>Tax help, built on the UK tax rules</Text>
            </View>
            {remaining !== null ? (
              <View style={styles.pill}><Text style={styles.pillText}>{remaining} left today</Text></View>
            ) : null}
          </View>
          <RiverAccent />
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {messages.map((m, i) => (
            <FadeIn key={i} style={[styles.bubbleWrap, m.role === 'user' ? styles.bubbleWrapUser : null]}>
              <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={[styles.bubbleText, m.role === 'user' ? styles.bubbleTextUser : null]}>{m.text}</Text>
              </View>
            </FadeIn>
          ))}

          {sending ? (
            <View style={[styles.bubbleWrap]}>
              <View style={[styles.bubble, styles.bubbleBot, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <ActivityIndicator size="small" color={RIVER} />
                <Text style={styles.thinking}>Working it out…</Text>
              </View>
            </View>
          ) : null}

          {showStarters ? (
            <View style={styles.starters}>
              <Text style={styles.startersLabel}>Try asking</Text>
              {STARTERS.map((s) => (
                <PressableScale key={s} style={styles.starter} onPress={() => ask(s)} accessibilityRole="button" accessibilityLabel={s}>
                  <Text style={styles.starterText}>{s}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}

          <Text style={styles.disclaimer}>General guidance on UK tax, not advice for your exact situation. Lekhio prepares figures, you approve, and you stay responsible with HMRC. For complex matters, speak to a qualified accountant.</Text>
        </ScrollView>

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder={locked ? 'Back tomorrow for more questions' : 'Ask anything about your tax…'}
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            editable={!locked && !sending}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => ask(input)}
            blurOnSubmit
          />
          <PressableScale
            style={[styles.sendBtn, (!input.trim() || sending || locked) ? styles.sendBtnOff : null]}
            onPress={() => ask(input)}
            disabled={!input.trim() || sending || locked}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Text style={styles.sendBtnText}>{'↑'}</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: LINE },
  back: { fontSize: 15, color: RIVER, fontWeight: '600', marginBottom: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: RIVER_TINT, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20 },
  title: { fontSize: 19, fontWeight: '800', color: INK },
  online: { fontSize: 12.5, color: GREEN, fontWeight: '600', marginTop: 1 },
  pill: { backgroundColor: SURFACE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11.5, fontWeight: '700', color: MUTED },
  scroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  bubbleWrap: { marginBottom: 12, alignItems: 'flex-start' },
  bubbleWrapUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 12 },
  bubbleBot: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: RIVER, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 15, color: INK, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  thinking: { fontSize: 14, color: MUTED },
  starters: { marginTop: 6, marginBottom: 4 },
  startersLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 2 },
  starter: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 9 },
  starterText: { fontSize: 14.5, color: INK, fontWeight: '500' },
  disclaimer: { fontSize: 11.5, color: MUTED, lineHeight: 17, marginTop: 14, marginBottom: 4, textAlign: 'center', paddingHorizontal: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: WHITE },
  inputField: { flex: 1, maxHeight: 120, backgroundColor: SURFACE, borderRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15.5, color: INK },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: RIVER, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: '#C7D2E8' },
  sendBtnText: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 24 },
});
