import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { FadeIn, PressableScale, CountUp } from '../../components/Motion';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#6B7280';

const INCLUDED = [
  'Snap receipts on WhatsApp. They get logged and sorted for you.',
  'Say an expense out loud. A voice note is all it takes.',
  'Income and expenses added up as you go.',
  'Quarterly tax summaries prepared and ready for you to approve.',
  'Ask about your money any time. Get a straight answer.',
];

function startTrial() {
  // Stripe is not wired yet. For now this moves the user into the app.
  router.replace('/(tabs)');
}

function skip() {
  router.replace('/(tabs)');
}

export default function SubscribeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View style={styles.trialBadge}>
            <Text style={styles.trialBadgeText}>30 DAYS FREE</Text>
          </View>

          <Text style={styles.heading}>Try Lekhio free for 30 days.</Text>
          <Text style={styles.sub}>
            Then £19.99 a month, or £199 a year. Cancel any time before the trial ends and you pay nothing.
          </Text>
        </FadeIn>

        <FadeIn delay={120} style={styles.card}>
          <Text style={styles.cardTitle}>What you get</Text>
          {INCLUDED.map((line, i) => (
            <View key={line} style={[styles.includedRow, i === INCLUDED.length - 1 ? { marginBottom: 0 } : null]}>
              <View style={styles.tickCircle}>
                <Text style={styles.tick}>{'✓'}</Text>
              </View>
              <Text style={styles.includedText}>{line}</Text>
            </View>
          ))}
        </FadeIn>

        <FadeIn delay={200}>
          <View style={styles.priceRow}>
            <CountUp value={19.99} format={(n) => `£${n.toFixed(2)}`} style={styles.priceBig} />
            <Text style={styles.priceUnit}>per month</Text>
            <View style={styles.priceSpacer} />
            <Text style={styles.priceAfter}>after your free trial</Text>
          </View>
        </FadeIn>
      </ScrollView>

      <View style={styles.footer}>
        <PressableScale
          style={styles.button}
          onPress={startTrial}
          accessibilityRole="button"
          accessibilityLabel="Start free trial"
        >
          <Text style={styles.buttonText}>Start free trial</Text>
        </PressableScale>
        <Text style={styles.reassure}>No charge today. We remind you before the trial ends.</Text>
        <TouchableOpacity
          onPress={skip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text style={styles.skip}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OFF_WHITE,
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'android' ? 56 : 72,
    paddingBottom: 24,
  },
  trialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: INDIGO_TINT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 18,
  },
  trialBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: INDIGO,
    letterSpacing: 0.6,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: INK,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  sub: {
    fontSize: 16,
    color: MUTED,
    lineHeight: 24,
    marginTop: 14,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.05)' } as any)
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }),
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  tickCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: INDIGO_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  tick: {
    fontSize: 12,
    fontWeight: '700',
    color: INDIGO,
  },
  includedText: {
    flex: 1,
    fontSize: 15,
    color: INK,
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 24,
    paddingHorizontal: 4,
  },
  priceBig: {
    fontSize: 34,
    fontWeight: '800',
    color: INK,
    letterSpacing: -1,
  },
  priceUnit: {
    fontSize: 15,
    color: MUTED,
    marginLeft: 8,
  },
  priceSpacer: {
    flex: 1,
  },
  priceAfter: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 36,
    backgroundColor: OFF_WHITE,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 14,
  },
  button: {
    backgroundColor: INDIGO,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reassure: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  skip: {
    fontSize: 15,
    color: MUTED,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 2,
  },
});
