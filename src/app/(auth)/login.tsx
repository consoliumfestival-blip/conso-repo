import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { DevConfig } from '../../core/config/dev_config';
import { authService } from '../../services/authService';

const palette = {
  ink: '#071827',
  surface: '#FFFFFF',
  line: '#E4E9F3',
  muted: '#667085',
  pink: '#0F766E',
  yellow: '#D6A84F',
  orange: '#9A6B24',
  green: '#047A55',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isMobile = width < 640;

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both User ID and password.');
      return;
    }

    setLoading(true);

    if (DevConfig.isDevMode) {
      setTimeout(() => {
        setUser({ id: 'dev-user', email }, DevConfig.tenant_id, DevConfig.role);
        setLoading(false);
      }, 800);
      return;
    }

    try {
      const result = await authService.login(email, password);
      setUser(result.user, result.tenant_id, result.role, result.is_superadmin);
    } catch (error: any) {
      setErrorMsg(authService.friendlyError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#071827', '#0B2A3D', '#0E4C48', '#175E4B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
      >
        <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
          <View style={[styles.heroPane, isDesktop && styles.heroPaneDesktop]}>
            <View style={styles.brandRow}>
              <Image
                source={{ uri: '/logo/image-removebg-preview.png' }}
                style={{ width: 44, height: 44, marginRight: 8 }}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.brandTitle}>Kodasseri Sector</Text>
                <Text style={styles.brandSub}>Sahithyolsav 2026</Text>
              </View>
            </View>

            <View style={styles.kicker}>
              <Sparkles size={16} color={palette.yellow} />
              <Text style={styles.kickerText}>Festival operations portal</Text>
            </View>

            <Text style={[styles.scriptTitle, isMobile && styles.scriptTitleMobile]}>Sahityotsav</Text>
            <Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>
              Manage results with the same clean public theme.
            </Text>
            <Text style={styles.heroLead}>
              Sign in to control schedules, participants, judging, and published leaderboard updates from one focused dashboard.
            </Text>

            <View style={styles.heroActions}>
              <TouchableOpacity onPress={() => router.replace('/(public)/leaderboard' as never)} style={styles.publicButton}>
                <Trophy size={18} color={palette.ink} />
                <Text style={styles.publicButtonText}>Public Leaderboard</Text>
              </TouchableOpacity>
            </View>

            {!isMobile && (
              <View style={styles.featureRow}>
                <Feature icon={ShieldCheck} title="Published only" subtitle="Public-safe results" />
                <Feature icon={LockKeyhole} title="Secure portal" subtitle="Role based access" />
              </View>
            )}
          </View>

          <View style={styles.loginCard}>
            <View style={styles.loginHeader}>
              <View style={styles.loginIcon}>
                <LockKeyhole size={24} color={palette.pink} />
              </View>
              <Text style={styles.loginTitle}>Sign in</Text>
              <Text style={styles.loginSub}>Use your assigned festival portal credentials.</Text>
            </View>

            <Field
              label="User ID / Email"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setErrorMsg('');
              }}
              placeholder="e.g., kodasseri_sector"
              icon={UserRound}
              autoCapitalize="none"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setErrorMsg('');
              }}
              placeholder="Enter password"
              icon={LockKeyhole}
              secureTextEntry={!showPassword}
              rightSlot={
                <TouchableOpacity onPress={() => setShowPassword((current) => !current)} style={styles.eyeButton}>
                  {showPassword ? <EyeOff size={18} color={palette.muted} /> : <Eye size={18} color={palette.muted} />}
                </TouchableOpacity>
              }
            />

            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity activeOpacity={0.86} onPress={handleLogin} disabled={loading} style={styles.loginButton}>
              {loading ? (
                <ActivityIndicator color={palette.ink} />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Sign In</Text>
                  <ArrowRight size={18} color={palette.ink} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/(public)/leaderboard' as never)} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Continue to public results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  rightSlot,
  secureTextEntry,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: React.ComponentType<any>;
  rightSlot?: React.ReactNode;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Icon size={18} color={palette.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          style={styles.input}
        />
        {rightSlot}
      </View>
    </View>
  );
}

function Feature({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<any>;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Icon size={20} color={palette.yellow} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 28px 80px rgba(0,0,0,0.24)' },
  default: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.ink,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 18,
    justifyContent: 'center',
  },
  scrollContentDesktop: {
    padding: 28,
  },
  shell: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    gap: 24,
  },
  shellDesktop: {
    minHeight: 680,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  heroPane: {
    minWidth: 0,
  },
  heroPaneDesktop: {
    flex: 1.05,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    fontFamily: 'CooperBlack',
    color: palette.ink,
    fontSize: 18,
  },
  brandTitle: {
    fontFamily: 'Poppins_900Black',
    color: palette.surface,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  brandSub: {
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  kicker: {
    marginTop: 66,
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,231,106,0.24)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 8,
  },
  kickerText: {
    fontFamily: 'Poppins_900Black',
    color: palette.yellow,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scriptTitle: {
    marginTop: 24,
    fontFamily: 'CooperBlack',
    color: palette.surface,
    fontSize: 76,
    lineHeight: 82,
  },
  scriptTitleMobile: {
    fontSize: 50,
    lineHeight: 56,
  },
  heroTitle: {
    maxWidth: 620,
    marginTop: 16,
    fontFamily: 'Poppins_900Black',
    color: palette.surface,
    fontSize: 39,
    lineHeight: 47,
  },
  heroTitleMobile: {
    fontSize: 28,
    lineHeight: 35,
  },
  heroLead: {
    maxWidth: 590,
    marginTop: 16,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.76)',
    fontSize: 16,
    lineHeight: 26,
  },
  heroActions: {
    marginTop: 28,
    flexDirection: 'row',
  },
  publicButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: palette.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 9,
  },
  publicButtonText: {
    fontFamily: 'Poppins_900Black',
    color: palette.ink,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  featureRow: {
    marginTop: 42,
    flexDirection: 'row',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,231,106,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    fontFamily: 'Poppins_900Black',
    color: palette.surface,
    fontSize: 13,
  },
  featureSub: {
    marginTop: 3,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
  },
  loginCard: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: palette.surface,
    padding: 22,
    ...cardShadow,
  },
  loginHeader: {
    marginBottom: 24,
  },
  loginIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#E8F3EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loginTitle: {
    fontFamily: 'Poppins_900Black',
    color: palette.ink,
    fontSize: 31,
    lineHeight: 38,
  },
  loginSub: {
    marginTop: 6,
    fontFamily: 'Poppins_400Regular',
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  fieldWrap: {
    marginBottom: 15,
  },
  fieldLabel: {
    marginBottom: 8,
    fontFamily: 'Poppins_900Black',
    color: palette.ink,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  inputShell: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    backgroundColor: '#FBFCFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Poppins_400Regular',
    color: palette.ink,
    fontSize: 14,
    outlineStyle: 'none' as any,
  },
  eyeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    padding: 12,
    marginBottom: 15,
  },
  errorText: {
    fontFamily: 'Poppins_700Bold',
    color: '#B42318',
    fontSize: 12,
    lineHeight: 18,
  },
  loginButton: {
    minHeight: 54,
    borderRadius: 13,
    backgroundColor: palette.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  loginButtonText: {
    fontFamily: 'Poppins_900Black',
    color: palette.ink,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  linkButton: {
    minHeight: 44,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    fontFamily: 'Poppins_900Black',
    color: palette.green,
    fontSize: 13,
  },
});
