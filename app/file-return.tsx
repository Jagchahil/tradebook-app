import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  Linking,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getHmrcConnectUrl, postHmrcFraud } from '../lib/supabase';
import { collectClientFraud } from '../lib/fraud';
import {
  INK, RIVER, RIVER_TINT, RIVER_DEEP, GREEN, GREEN_TINT, SAFFRON_DEEP, SAFFRON_TINT,
  PAPER, SURFACE, LINE, MUTED, WHITE,
} from '../lib/theme';
import { FadeIn, PressableScale, RiverAccent } from '../components/Motion';

const HMRC_URL = 'https://www.gov.uk/log-in-file-self-assessment-tax-return';

type Step = { key: string; emoji: string; tint: string; fg: string; title: string; lead: string; does: string[]; tip: string };
const steps: Step[] = [
  {
    key: 'utr', emoji: '🆔', tint: RIVER_TINT, fg: RIVER, title: 'Register, get your UTR',
    lead: 'First time only. Tell HMRC you have started for yourself.',
    does: ["On GOV.UK, search 'register for Self Assessment', choose self employed.", 'Enter your details and the date you started trading.', 'HMRC posts your 10 digit UTR in 2 to 3 weeks.', 'Set up your Government Gateway login.'],
    tip: 'Done before? Skip it. Just have your UTR and login ready.',
  },
  {
    key: 'gather', emoji: '📂', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, title: 'Gather your numbers',
    lead: 'Five things, in front of you before you start.',
    does: ['UTR and Government Gateway login.', 'National Insurance number.', 'Total income, 6 April to 5 April.', 'Total expenses, split by category.', 'Any other income, a job (P60), interest.'],
    tip: 'Lekhio has your totals added up and split by category already.',
  },
  {
    key: 'login', emoji: '🔑', tint: GREEN_TINT, fg: GREEN, title: 'Log in, open the return',
    lead: 'Everything happens on the official HMRC site.',
    does: ['Sign in to HMRC Self Assessment with your Gateway login.', 'Start the return for the 2025/26 tax year.', 'Add the self employment section, the SA103.', 'It picks short or full from your turnover.'],
    tip: 'Under £90k turnover uses the short pages, SA103S.',
  },
  {
    key: 'form', emoji: '✍️', tint: RIVER_TINT, fg: RIVER, title: 'Fill the pages',
    lead: 'The heart of it. Two figures plus the detail.',
    does: ['Turnover: everything you were paid, before expenses.', 'Expenses, by category: materials, travel, phone, insurance.', 'Income under £1,000? Use the £1,000 trading allowance.', 'Big tools or kit? Claim capital allowances.'],
    tip: 'Split expenses into categories, do not lump them in one box.',
  },
  {
    key: 'maths', emoji: '🧮', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, title: 'HMRC does the maths',
    lead: 'You do not work out the tax. The return does.',
    does: ['Add other income, like a PAYE job (P60).', 'It applies your £12,570 personal allowance.', 'It works out Income Tax and Class 4 National Insurance.', 'It shows your bill and any payments on account.'],
    tip: 'Class 2 NI changed. Most no longer pay it but still build state pension.',
  },
  {
    key: 'submit', emoji: '✅', tint: GREEN_TINT, fg: GREEN, title: 'Check and submit',
    lead: 'Slow down here for one minute.',
    does: ['Read the calculation, check it matches your records.', 'Submit. HMRC confirms on screen straight away.', 'Save the confirmation and your reference.', 'That is your return filed. Done.'],
    tip: 'File early, still pay on 31 Jan. Just no last minute panic.',
  },
  {
    key: 'pay', emoji: '💷', tint: RIVER_TINT, fg: RIVER, title: 'Pay by 31 January',
    lead: 'The deadline that matters.',
    does: ['Pay by 31 Jan: online, bank transfer, or through your tax code.', 'Bill over £1,000? You also make payments on account.', 'Half by 31 January, half by 31 July.', 'Set aside roughly 30% of profit as you go.'],
    tip: 'Lekhio keeps a running set aside figure, so it is always there.',
  },
];

const everyoneClaims = ['Materials', 'Tools', 'Mileage', 'PPE', 'Phone', 'Insurance'];

type Trade = { id: string; name: string; cis: boolean; items: string[] };
const trades: Trade[] = [
  { id: 'electricians', name: 'Electricians', cis: false, items: ['Cable and fittings', 'Test gear and calibration', 'NICEIC or NAPIT fees', 'PAT testing kit', 'Van racking'] },
  { id: 'plumbers', name: 'Plumbers', cis: false, items: ['Pipe and fittings', 'Leak and pressure kit', 'Blow torch', 'WaterSafe membership', 'Van racking'] },
  { id: 'builders', name: 'Builders', cis: true, items: ['Cement and timber', 'Plant hire', 'Skip and waste', 'Scaffold hire', 'Site PPE'] },
  { id: 'plasterers', name: 'Plasterers', cis: true, items: ['Plaster and boards', 'Mixer and stilts', 'Dust sheets', 'Tower hire', 'Masks and PPE'] },
  { id: 'roofers', name: 'Roofers', cis: true, items: ['Tiles, felt, lead', 'Harnesses', 'Scaffold hire', 'Roof ladders', 'PPE'] },
  { id: 'joiners', name: 'Joiners', cis: true, items: ['Timber and sheets', 'Ironmongery', 'Power tools', 'Dust extraction', 'Workshop costs'] },
  { id: 'decorators', name: 'Decorators', cis: false, items: ['Paint and fillers', 'Brushes and rollers', 'Dust sheets', 'Spray gear', 'Access towers'] },
  { id: 'tilers', name: 'Tilers', cis: false, items: ['Tiles and adhesive', 'Trims and levellers', 'Cutters', 'Knee pads', 'Access hire'] },
  { id: 'gas', name: 'Gas engineers', cis: false, items: ['Parts and fittings', 'Flue gas analyser', 'Gas Safe registration', 'Tools', 'Van racking'] },
  { id: 'scaffolders', name: 'Scaffolders', cis: true, items: ['Tube and boards', 'Harnesses', 'Transport', 'CISRS training', 'Trailer costs'] },
  { id: 'groundworkers', name: 'Groundworkers', cis: true, items: ['Concrete and drainage', 'Digger hire', 'Fuel for plant', 'Setting out kit', 'Site welfare'] },
  { id: 'landscapers', name: 'Landscapers', cis: false, items: ['Plants and turf', 'Paving', 'Mowers', 'Tip fees', 'Fuel and servicing'] },
  { id: 'hairdressers', name: 'Hairdressers & barbers', cis: false, items: ['Products and colour', 'Scissors and clippers', 'Chair or booth rent', 'Gowns and towels', 'Insurance and training'] },
  { id: 'cleaners', name: 'Cleaners', cis: false, items: ['Cleaning products', 'Vacuums and equipment', 'Mileage between jobs', 'Gloves and PPE', 'Insurance and DBS'] },
  { id: 'drivers', name: 'Drivers & couriers', cis: false, items: ['Fuel or mileage', 'Vehicle servicing', 'Licensing and badges', 'Phone and apps', 'Insurance'] },
  { id: 'beauticians', name: 'Beauticians & nails', cis: false, items: ['Products and consumables', 'Kit, lamps and tools', 'Couch or room hire', 'PPE and sanitiser', 'Insurance and training'] },
  { id: 'photographers', name: 'Photographers', cis: false, items: ['Cameras and lenses', 'Editing software', 'Studio or location hire', 'Travel to shoots', 'Website and insurance'] },
  { id: 'trainers', name: 'Personal trainers', cis: false, items: ['Equipment and weights', 'Gym or studio hire', 'App subscriptions', 'Insurance and quals', 'Branded kit'] },
  { id: 'tutors', name: 'Tutors', cis: false, items: ['Books and resources', 'Printing and materials', 'Room or platform hire', 'Travel to students', 'DBS and memberships'] },
  { id: 'creatives', name: 'Designers & freelancers', cis: false, items: ['Software subscriptions', 'Laptop and equipment', 'Website and hosting', 'Home or co-working', 'Training and assets'] },
];

const deadlines = [
  { date: '5 Oct', sub: 'Register' },
  { date: '31 Jan', sub: 'File and pay' },
  { date: '31 Jul', sub: 'On account' },
];

// --- Animation primitives -------------------------------------------------
function Pop({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true })]).start();
  }, []);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>{children}</Animated.View>;
}
function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}
function FillBar({ delay = 0, color, height = 24 }: { delay?: number; color: string; height?: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: 1, duration: 620, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, []);
  return (
    <View style={{ height, borderRadius: height / 3, backgroundColor: SURFACE, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ['8%', '100%'] }) }} />
    </View>
  );
}

// --- The hero form-fill loop ---------------------------------------------
function FormFillLoop() {
  const bars = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const tick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fill = (v: Animated.Value, delay = 0) => Animated.timing(v, { toValue: 1, duration: 460, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    const reset = (v: Animated.Value) => Animated.timing(v, { toValue: 0, duration: 240, useNativeDriver: false });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(250), fill(bars[0]), fill(bars[1]), fill(bars[2]),
        Animated.spring(tick, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.delay(1000),
        Animated.parallel([reset(bars[0]), reset(bars[1]), reset(bars[2]), Animated.timing(tick, { toValue: 0, duration: 240, useNativeDriver: true })]),
        Animated.delay(250),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const widths = bars.map((b) => b.interpolate({ inputRange: [0, 1], outputRange: ['8%', '100%'] }));
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroCardHead}><View style={styles.heroDot} /><Text style={styles.heroCardTitle}>Self Assessment</Text></View>
      {widths.map((w, i) => (
        <View key={i} style={styles.heroBarTrack}><Animated.View style={[styles.heroBarFill, { width: w }]} /></View>
      ))}
      <Animated.View style={[styles.heroTick, { opacity: tick, transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
        <Text style={styles.heroTickMark}>✓</Text>
      </Animated.View>
    </View>
  );
}

// --- Per step animated mocks (match the website) -------------------------
function MockUtr() {
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>GOV.UK</Text></View>
      <View style={{ padding: 16, minHeight: 150 }}>
        <Rise delay={40}><Text style={styles.mockMuted}>Self Assessment</Text></Rise>
        <Rise delay={130}><Text style={styles.mockHead}>Your Unique Taxpayer Reference</Text></Rise>
        <Pop delay={420} style={{ marginTop: 14, backgroundColor: RIVER_TINT, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: RIVER_DEEP, letterSpacing: 2 }}>1234 567 890</Text>
        </Pop>
        <Rise delay={720}><Text style={styles.mockSmall}>Posted to you in 2 to 3 weeks.</Text></Rise>
      </View>
    </View>
  );
}
function MockGather() {
  const items = ['UTR and Gateway login', 'National Insurance number', 'Total income', 'Total expenses', 'Other income (P60)'];
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>Before you start</Text></View>
      <View style={{ padding: 13, minHeight: 150 }}>
        {items.map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 }}>
            <Pop delay={150 + i * 120} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text></Pop>
            <Text style={{ fontSize: 13, color: INK }}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
function MockLogin() {
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>HMRC sign in</Text></View>
      <View style={{ padding: 16, minHeight: 150 }}>
        <Text style={styles.mockMuted}>Government Gateway user ID</Text>
        <View style={styles.mockField}><Text style={{ fontSize: 13, color: INK }}>1357924680</Text></View>
        <Text style={[styles.mockMuted, { marginTop: 10 }]}>Password</Text>
        <View style={styles.mockField}><Text style={{ fontSize: 13, color: INK, letterSpacing: 2 }}>••••••••</Text></View>
        <Pop delay={520} style={{ marginTop: 12, backgroundColor: RIVER, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Sign in</Text></Pop>
        <Rise delay={950}><Text style={{ color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 10 }}>✓ Tax year 2025 to 2026</Text></Rise>
      </View>
    </View>
  );
}
function MockForm() {
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>SA103 Self employment</Text></View>
      <View style={{ padding: 16, minHeight: 150 }}>
        <Text style={styles.mockMuted}>Turnover</Text>
        <View style={{ marginTop: 5, position: 'relative', justifyContent: 'center' }}>
          <FillBar delay={150} color={RIVER_TINT} />
          <Pop delay={700} style={{ position: 'absolute', right: 10 }}><Text style={{ fontSize: 12.5, fontWeight: '800', color: RIVER_DEEP }}>£38,400</Text></Pop>
        </View>
        <Text style={[styles.mockMuted, { marginTop: 12 }]}>Allowable expenses</Text>
        <View style={{ marginTop: 5, position: 'relative', justifyContent: 'center' }}>
          <FillBar delay={450} color={GREEN_TINT} />
          <Pop delay={1000} style={{ position: 'absolute', right: 10 }}><Text style={{ fontSize: 12.5, fontWeight: '800', color: GREEN }}>£9,250</Text></Pop>
        </View>
        <Rise delay={1200}><Text style={[styles.mockSmall, { marginTop: 12 }]}>Net profit, worked out: <Text style={{ fontWeight: '800', color: INK }}>£29,150</Text></Text></Rise>
      </View>
    </View>
  );
}
function MockMaths() {
  const rows: [string, string][] = [['Profit', '£29,150'], ['Less allowance', '− £12,570'], ['Income tax, 20%', '£3,316'], ['Class 4 NI, 6%', '£995']];
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>Your tax, worked out</Text></View>
      <View style={{ padding: 14, minHeight: 150 }}>
        {rows.map((r, i) => (
          <Rise key={r[0]} delay={100 + i * 160} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: SURFACE }}>
            <Text style={{ fontSize: 12.5, color: MUTED }}>{r[0]}</Text><Text style={{ fontSize: 12.5, fontWeight: '600', color: INK }}>{r[1]}</Text>
          </Rise>
        ))}
        <Pop delay={950} style={{ marginTop: 11, backgroundColor: RIVER, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, color: '#fff' }}>Your bill</Text><Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>£4,311</Text>
        </Pop>
      </View>
    </View>
  );
}
function MockSubmit() {
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>Submit your return</Text></View>
      <View style={{ padding: 18, alignItems: 'center', minHeight: 150 }}>
        <Pop delay={200} style={{ backgroundColor: RIVER, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 }}><Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Submit return</Text></Pop>
        <Pop delay={900} style={{ marginTop: 16, alignItems: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>✓</Text></View>
          <Text style={{ marginTop: 9, fontSize: 13.5, fontWeight: '700', color: INK }}>Submission received</Text>
          <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>Reference IRMARK 9F2A7C</Text>
        </Pop>
      </View>
    </View>
  );
}
function MockPay() {
  return (
    <View style={styles.mockCard}>
      <View style={styles.mockBar}><Text style={styles.mockBarText}>Pay by 31 January</Text></View>
      <View style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 150 }}>
        <Pop delay={200} style={{ width: 80, borderWidth: 1, borderColor: LINE, borderRadius: 12, overflow: 'hidden', alignItems: 'center' }}>
          <Text style={{ backgroundColor: RIVER, color: '#fff', fontSize: 11, fontWeight: '700', paddingVertical: 4, width: '100%', textAlign: 'center' }}>JAN</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: RIVER_DEEP, paddingVertical: 8 }}>31</Text>
        </Pop>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mockMuted, { marginBottom: 6 }]}>Set aside as you go</Text>
          <View style={{ position: 'relative', justifyContent: 'center' }}>
            <FillBar delay={350} color={GREEN} height={24} />
            <Pop delay={900} style={{ position: 'absolute', right: 10 }}><Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>£4,311</Text></Pop>
          </View>
          <Rise delay={1100}><Text style={[styles.mockSmall, { marginTop: 8 }]}>Roughly 30% of profit, saved already.</Text></Rise>
        </View>
      </View>
    </View>
  );
}
function StepMock({ k }: { k: string }) {
  if (k === 'utr') return <MockUtr />;
  if (k === 'gather') return <MockGather />;
  if (k === 'login') return <MockLogin />;
  if (k === 'form') return <MockForm />;
  if (k === 'maths') return <MockMaths />;
  if (k === 'submit') return <MockSubmit />;
  return <MockPay />;
}

function PulseButton({ label, onPress }: { label: string; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  return (
    <PressableScale onPress={onPress}>
      <Animated.View style={[styles.primaryBtn, { transform: [{ scale }] }]}><Text style={styles.primaryBtnText}>{label}</Text></Animated.View>
    </PressableScale>
  );
}

export default function FileReturnScreen() {
  const [tradeId, setTradeId] = useState<string>(trades[0].id);
  const [active, setActive] = useState<number>(0);
  const [connecting, setConnecting] = useState(false);
  const selected = trades.find((t) => t.id === tradeId) ?? trades[0];
  const step = steps[active];

  // Link the user's HMRC account for Making Tax Digital. Until HMRC has
  // recognised Lekhio and live credentials are set, the server returns "not
  // configured" and we are honest: we prepare, you file, and direct submission
  // arrives once we are recognised. Nothing is ever filed without your approval.
  const connectHmrc = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { url } = await getHmrcConnectUrl();
      if (url) {
        // Best effort: capture this device's fraud prevention values for MTD as
        // the user links HMRC. Fire and forget, never blocks the connect flow.
        collectClientFraud()
          .then((v) => postHmrcFraud(v as unknown as Record<string, unknown>))
          .catch(() => {});
        Linking.openURL(url);
      } else {
        // Until HMRC recognition + live credentials are in, there is no real
        // connection to make, so we are honest rather than showing an error.
        Alert.alert(
          'Direct filing is coming soon',
          'We are completing HMRC recognition for Making Tax Digital. For now Lekhio prepares your figures, split and totalled, and you file them on the HMRC service. The day we are recognised, you will be able to connect here and approve a submission in seconds.',
        );
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PAPER} />
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} style={styles.backHit}><Text style={styles.back}>{'←'}</Text></PressableScale>
        <Text style={styles.topTitle}>File your tax return</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <FormFillLoop />
          <Text style={styles.h1}>15 minutes. That is it.</Text>
          <RiverAccent />
          <Text style={styles.intro}>Once your records are in order, your tax return is quick. Tap through the steps below to see exactly what to do.</Text>
        </FadeIn>

        {/* Trade selector */}
        <FadeIn delay={80}>
          <Text style={styles.sectionLabel}>Pick your trade</Text>
          <View style={styles.chips}>
            {trades.map((t) => {
              const on = t.id === tradeId;
              return (
                <PressableScale key={t.id} onPress={() => setTradeId(t.id)} style={[styles.chip, on ? styles.chipOn : null]} accessibilityRole="button" accessibilityLabel={t.name}>
                  <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{t.name}</Text>
                </PressableScale>
              );
            })}
          </View>
        </FadeIn>

        <FadeIn delay={120} style={styles.claimCard}>
          <Text style={styles.claimHead}>Everyone claims</Text>
          <View style={styles.tagWrap}>{everyoneClaims.map((e) => (<View key={e} style={[styles.tag, { backgroundColor: GREEN_TINT }]}><Text style={[styles.tagText, { color: GREEN }]}>{e}</Text></View>))}</View>
          <Text style={[styles.claimHead, { marginTop: 14 }]}>{selected.name} also</Text>
          <View style={styles.tagWrap}>{selected.items.map((e) => (<View key={e} style={[styles.tag, { backgroundColor: RIVER_TINT }]}><Text style={[styles.tagText, { color: RIVER }]}>{e}</Text></View>))}</View>
          {selected.cis ? <View style={styles.cisNote}><Text style={styles.cisText}>Construction (CIS): tax is taken off your pay, then comes off your bill or is refunded. Keep your CIS statements.</Text></View> : null}
        </FadeIn>

        {/* Interactive animated walkthrough */}
        <FadeIn delay={140}>
          <Text style={styles.sectionLabel}>The walkthrough, tap through it</Text>
          <View style={styles.stepDots}>
            {steps.map((s, i) => {
              const on = i === active;
              return (
                <PressableScale key={s.key} onPress={() => setActive(i)} style={[styles.stepDot, on ? styles.stepDotOn : null]} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}`}>
                  <Text style={[styles.stepDotText, on ? styles.stepDotTextOn : null]}>{i + 1}</Text>
                </PressableScale>
              );
            })}
          </View>

          {/* The mock remounts on step change (key), so its animation replays */}
          <StepMock key={active} k={step.key} />

          <View style={styles.detail}>
            <Text style={[styles.stepKicker, { color: step.fg }]}>Step {active + 1} of 7</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepLead}>{step.lead}</Text>
            {step.does.map((d, j) => (
              <View key={j} style={styles.doRow}>
                <Text style={[styles.doNum, { backgroundColor: step.tint, color: step.fg }]}>{j + 1}</Text>
                <Text style={styles.doText}>{d}</Text>
              </View>
            ))}
            <View style={styles.tipBox}><Text style={styles.tipText}>💡 {step.tip}</Text></View>
          </View>
        </FadeIn>

        {/* Deadlines */}
        <FadeIn delay={120}>
          <Text style={styles.sectionLabel}>Key dates, 2026/27</Text>
          <View style={styles.dlRow}>{deadlines.map((d) => (<View key={d.date} style={styles.dlPill}><Text style={styles.dlDate}>{d.date}</Text><Text style={styles.dlSub}>{d.sub}</Text></View>))}</View>
          <Text style={styles.smallNote}>Miss 31 Jan and it is an automatic £100 penalty. Mileage is 55p a mile this year.</Text>
        </FadeIn>

        <FadeIn delay={120}>
          <View style={styles.mtdCard}>
            <Text style={styles.mtdText}>From April 2026, over £50k turnover means four short updates a year instead of one return. Lekhio keeps you ready.</Text>
            <PressableScale style={styles.mtdConnect} onPress={connectHmrc} accessibilityRole="button" accessibilityLabel="Connect your HMRC account">
              <Text style={styles.mtdConnectText}>{connecting ? 'Opening…' : 'Connect your HMRC account'}</Text>
            </PressableScale>
            <Text style={styles.mtdConnectNote}>We prepare, you approve. Nothing is sent to HMRC without your say so.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={120}>
          <PulseButton label="Set a deadline reminder" onPress={() => router.push('/diary')} />
          <PressableScale style={styles.secondaryBtn} onPress={() => Linking.openURL(HMRC_URL)}><Text style={styles.secondaryBtnText}>Open the HMRC service</Text></PressableScale>
        </FadeIn>

        <FadeIn delay={120}><Text style={styles.caveat}>Guidance, not personal tax advice. You file your own return. Lekhio is not HMRC. Figures for 2026/27, checked against GOV.UK June 2026.</Text></FadeIn>
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.OS === 'web'
  ? ({ boxShadow: '0 10px 28px rgba(17,17,17,0.06)' } as any)
  : { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backHit: { paddingHorizontal: 4, paddingVertical: 2 },
  back: { fontSize: 22, color: INK },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 24, paddingBottom: 56 },

  heroCard: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 18, marginTop: 8, ...cardShadow },
  heroCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  heroDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: RIVER },
  heroCardTitle: { fontSize: 12.5, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
  heroBarTrack: { height: 10, borderRadius: 5, backgroundColor: SURFACE, overflow: 'hidden', marginBottom: 10 },
  heroBarFill: { height: 10, borderRadius: 5, backgroundColor: RIVER },
  heroTick: { position: 'absolute', right: 16, bottom: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  heroTickMark: { color: WHITE, fontSize: 18, fontWeight: '900' },

  h1: { fontSize: 27, fontWeight: '800', color: INK, marginTop: 20, letterSpacing: -0.8 },
  intro: { fontSize: 14.5, color: MUTED, marginTop: 12, lineHeight: 21 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 26, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: WHITE, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: RIVER, borderColor: RIVER },
  chipText: { fontSize: 13.5, fontWeight: '600', color: INK },
  chipTextOn: { color: WHITE },

  claimCard: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 18, marginTop: 14, ...cardShadow },
  claimHead: { fontSize: 11.5, fontWeight: '700', color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  tagText: { fontSize: 13, fontWeight: '700' },
  cisNote: { backgroundColor: SAFFRON_TINT, borderRadius: 10, padding: 12, marginTop: 14 },
  cisText: { fontSize: 12.5, color: SAFFRON_DEEP, lineHeight: 18 },

  stepDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  stepDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: LINE, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: RIVER, borderColor: RIVER },
  stepDotText: { fontSize: 15, fontWeight: '800', color: INK },
  stepDotTextOn: { color: WHITE },

  mockCard: { backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 16, overflow: 'hidden', ...cardShadow },
  mockBar: { backgroundColor: INK, paddingVertical: 9, paddingHorizontal: 14 },
  mockBarText: { color: '#fff', fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 },
  mockMuted: { fontSize: 11.5, color: MUTED },
  mockHead: { fontSize: 13.5, fontWeight: '700', color: INK, marginTop: 6 },
  mockSmall: { fontSize: 11.5, color: MUTED },
  mockField: { height: 34, borderRadius: 8, borderWidth: 1, borderColor: LINE, justifyContent: 'center', paddingHorizontal: 10, marginTop: 5 },

  detail: { marginTop: 16 },
  stepKicker: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  stepTitle: { fontSize: 18, fontWeight: '800', color: INK, marginTop: 5 },
  stepLead: { fontSize: 13.5, color: MUTED, lineHeight: 19, marginTop: 5, marginBottom: 10 },
  doRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 6 },
  doNum: { width: 19, height: 19, borderRadius: 5, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 19, overflow: 'hidden' },
  doText: { flex: 1, fontSize: 13, color: INK, lineHeight: 18 },
  tipBox: { backgroundColor: SAFFRON_TINT, borderRadius: 10, padding: 10, marginTop: 10 },
  tipText: { fontSize: 12, color: SAFFRON_DEEP, lineHeight: 17 },

  dlRow: { flexDirection: 'row', gap: 10 },
  dlPill: { flex: 1, backgroundColor: WHITE, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', ...cardShadow },
  dlDate: { fontSize: 16, fontWeight: '800', color: RIVER_DEEP },
  dlSub: { fontSize: 12, color: MUTED, marginTop: 3 },
  smallNote: { fontSize: 12.5, color: MUTED, lineHeight: 18, marginTop: 12 },

  mtdCard: { backgroundColor: RIVER_DEEP, borderRadius: 16, padding: 18, marginTop: 20 },
  mtdText: { fontSize: 14, color: '#DCE9F8', lineHeight: 20 },
  mtdConnect: { backgroundColor: WHITE, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  mtdConnectText: { color: RIVER_DEEP, fontSize: 14.5, fontWeight: '700' },
  mtdConnectNote: { fontSize: 11.5, color: '#AFC6E6', lineHeight: 16, marginTop: 10, textAlign: 'center' },

  primaryBtn: { backgroundColor: RIVER, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 22 },
  primaryBtnText: { color: WHITE, fontSize: 15.5, fontWeight: '700' },
  secondaryBtn: { backgroundColor: WHITE, borderWidth: 1.5, borderColor: RIVER, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  secondaryBtnText: { color: RIVER, fontSize: 15.5, fontWeight: '700' },
  caveat: { fontSize: 11.5, color: MUTED, lineHeight: 17, marginTop: 20 },
});
