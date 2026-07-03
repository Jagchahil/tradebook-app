import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import {
  signInAnonymously,
  saveUserPhone,
  OTP_ENABLED,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '../../lib/supabase';
import { FadeIn, PressableScale } from '../../components/Motion';

// Sign up and payment are on the web. The app only logs existing users in.
const SIGNUP_URL = 'https://tradebook-app-five.vercel.app';

const INDIGO = '#1B59A6';
const INDIGO_TINT = '#E9F1FA';
const INK = '#111111';
const OFF_WHITE = '#FBFAF7';
const MUTED = '#6B7280';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

// Turn whatever the user typed into a single +44 number. Handles a leading 0
// (07700...), a country code already typed (447700... or 00447700...), and the
// common "+44 07700..." double-prefix typo.
// MUST stay byte-identical to `normalizeUkPhone` in tradebook-web/lib/supabase.ts:
// this stores the number, that matches it for WhatsApp. If they diverge, a user's
// WhatsApp messages would land on a different account. Same steps, same order.
function toUkE164(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (!d) return '';
  return `+44${d}`;
}

export default function PhoneScreen() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [fullNumber, setFullNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = digitsOnly(phone);
  const ready = digits.length >= 10 && !loading;
  const codeReady = digitsOnly(code).length === 6 && !loading;

  async function handleContinue() {
    const cleaned = digitsOnly(phone);
    if (cleaned.length < 10) {
      setError('Enter a full UK mobile number.');
      return;
    }

    setError('');
    setLoading(true);
    Keyboard.dismiss();
    const e164 = toUkE164(cleaned);
    setFullNumber(e164);

    // Real one-time-code login, once an SMS provider is switched on.
    if (OTP_ENABLED) {
      const res = await sendPhoneOtp(e164);
      setLoading(false);
      if (!res.ok) {
        setError('Could not send your code. Check the number and try again.');
        return;
      }
      setStep('code');
      return;
    }

    // Fallback while OTP is not yet switched on, so dev builds still work.
    try {
      const data = await signInAnonymously();
      const userId = data.user?.id;
      if (userId) await saveUserPhone(userId, e164);
      router.replace('/(tabs)');
    } catch {
      setError('Could not log you in. Check your connection and try again.');
      setLoading(false);
    }
  }

  async function handleVerify() {
    const token = digitsOnly(code);
    if (token.length !== 6) {
      setError('Enter the 6 digit code we sent you.');
      return;
    }
    setError('');
    setLoading(true);
    Keyboard.dismiss();

    const res = await verifyPhoneOtp(fullNumber, token);
    if (!res.ok || !res.userId) {
      setError('That code did not match. Check it and try again.');
      setLoading(false);
      return;
    }
    await saveUserPhone(res.userId, fullNumber);
    router.replace('/(tabs)');
  }

  async function handleResend() {
    if (loading) return;
    setError('');
    setLoading(true);
    const res = await sendPhoneOtp(fullNumber);
    setLoading(false);
    if (!res.ok) setError('Could not resend the code. Try again in a moment.');
  }

  function editNumber() {
    setStep('phone');
    setCode('');
    setError('');
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="dark-content" backgroundColor={OFF_WHITE} />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (step === 'code' ? editNumber() : router.back())}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.6}
        >
          <Text style={styles.backArrow}>{'←'}</Text>
        </TouchableOpacity>

        {step === 'phone' ? (
          <>
            <FadeIn style={styles.body}>
              <Text style={styles.heading}>Log in</Text>
              <Text style={styles.sub}>
                Enter the mobile number you signed up with. It is the number linked to your WhatsApp. No spam. No sharing.
              </Text>

              <View style={[styles.phoneRow, error ? styles.phoneRowError : null]}>
                <View style={styles.prefixBox}>
                  <Text style={styles.flag}>{'🇬🇧'}</Text>
                  <Text style={styles.prefixText}>+44</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="7700 900 000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    if (error) setError('');
                  }}
                  maxLength={14}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </FadeIn>

            <View style={styles.footer}>
              <PressableScale
                style={[styles.button, !ready ? styles.buttonDisabled : null]}
                onPress={handleContinue}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityState={{ disabled: !ready }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Log in</Text>
                )}
              </PressableScale>
              <TouchableOpacity onPress={() => Linking.openURL(SIGNUP_URL)} accessibilityRole="link" accessibilityLabel="Create your account on the web">
                <Text style={styles.signupLink}>Not signed up yet? Create your account on the web</Text>
              </TouchableOpacity>
              <Text style={styles.legal}>
                By logging in you agree to our Terms and Privacy Policy.
              </Text>
            </View>
          </>
        ) : (
          <>
            <FadeIn style={styles.body}>
              <Text style={styles.heading}>Enter your code</Text>
              <Text style={styles.sub}>
                We sent a 6 digit code to {fullNumber}. It can take a few seconds to arrive.
              </Text>

              <View style={[styles.phoneRow, error ? styles.phoneRowError : null]}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="123456"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={(t) => {
                    setCode(t);
                    if (error) setError('');
                  }}
                  maxLength={6}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity onPress={handleResend} disabled={loading} accessibilityRole="button" accessibilityLabel="Resend code">
                <Text style={styles.resend}>Did not get it? Resend code</Text>
              </TouchableOpacity>
            </FadeIn>

            <View style={styles.footer}>
              <PressableScale
                style={[styles.button, !codeReady ? styles.buttonDisabled : null]}
                onPress={handleVerify}
                disabled={!codeReady}
                accessibilityRole="button"
                accessibilityLabel="Verify code"
                accessibilityState={{ disabled: !codeReady }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </PressableScale>
              <TouchableOpacity onPress={editNumber} accessibilityRole="button" accessibilityLabel="Edit number">
                <Text style={styles.signupLink}>Wrong number? Edit it</Text>
              </TouchableOpacity>
              <Text style={styles.legal}>
                By logging in you agree to our Terms and Privacy Policy.
              </Text>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: INK,
    lineHeight: 22,
  },
  body: {
    flex: 1,
    paddingTop: 36,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.8,
  },
  sub: {
    fontSize: 16,
    color: MUTED,
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 32,
    maxWidth: 320,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    overflow: 'hidden',
  },
  phoneRowError: {
    borderColor: '#EF4444',
  },
  prefixBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: INDIGO_TINT,
    borderRightWidth: 1.5,
    borderRightColor: '#E5E7EB',
  },
  flag: {
    fontSize: 16,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: INDIGO,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 17,
    color: INK,
    letterSpacing: 0.5,
  },
  codeInput: {
    letterSpacing: 10,
    fontWeight: '700',
    fontSize: 22,
    textAlign: 'center',
  },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 10,
  },
  resend: {
    fontSize: 14,
    color: INDIGO,
    fontWeight: '600',
    marginTop: 18,
  },
  footer: {
    gap: 14,
  },
  button: {
    backgroundColor: INDIGO,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonDisabled: {
    backgroundColor: '#C7D2FE',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signupLink: {
    fontSize: 14,
    color: INDIGO,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 4,
  },
  legal: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
