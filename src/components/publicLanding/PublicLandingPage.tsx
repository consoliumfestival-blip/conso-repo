import React, { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArrowRight, CalendarDays, CheckCircle2, Flag, Gauge, Menu, ShieldCheck, UsersRound } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const festivalTypes = [
  { label: 'College Fest', icon: '🎓' },
  { label: 'Sahithyolsav', icon: '📚' },
  { label: 'School Fest', icon: '🏫' },
  { label: 'Custom Festival', icon: '✨' },
];

const features = [
  { title: 'Participant Registration', text: 'Register individuals and teams with clear, configurable workflows.', icon: UsersRound },
  { title: 'Competition Management', text: 'Organise items, categories, stages, venues, and rules in one place.', icon: Flag },
  { title: 'Schedule Planning', text: 'Build conflict-aware schedules and keep every team updated.', icon: CalendarDays },
  { title: 'Judge Mark Entry', text: 'Give judges a focused, reliable workspace for secure score entry.', icon: Gauge },
  { title: 'Result Publishing', text: 'Review, approve, and publish results without manual calculation.', icon: CheckCircle2 },
  { title: 'Team Leader Portal', text: 'Let leaders track participants, schedules, announcements, and results.', icon: ShieldCheck },
];

export function PublicLandingPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFestival, setSelectedFestival] = useState('College Fest');

  const goToLogin = () => router.push('/login' as never);

  return (
    <View style={styles.page}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerWrap}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setMenuOpen(false)} activeOpacity={0.8} style={styles.brandRow}>
              <View style={styles.logo}><Text style={styles.logoText}>F</Text></View>
              <Text style={styles.brand}>FestManager</Text>
            </TouchableOpacity>
            {isDesktop ? (
              <View style={styles.navLinks}>
                {['Features', 'How It Works', 'Roles', 'Security'].map((item) => <Text key={item} style={styles.navText}>{item}</Text>)}
              </View>
            ) : (
              <TouchableOpacity onPress={() => setMenuOpen((value) => !value)} style={styles.menuButton} accessibilityLabel="Open navigation menu">
                <Menu color={COLORS.navy} size={22} />
              </TouchableOpacity>
            )}
            <View style={styles.headerActions}>
              {isDesktop && <TouchableOpacity onPress={goToLogin}><Text style={styles.signIn}>Sign In</Text></TouchableOpacity>}
              <TouchableOpacity onPress={goToLogin} style={styles.headerCta}><Text style={styles.headerCtaText}>Get Started</Text></TouchableOpacity>
            </View>
          </View>
          {menuOpen && !isDesktop && <View style={styles.mobileMenu}>{['Features', 'How It Works', 'Roles', 'Security'].map((item) => <Text key={item} style={styles.mobileMenuText}>{item}</Text>)}<TouchableOpacity onPress={goToLogin}><Text style={styles.mobileMenuText}>Sign In</Text></TouchableOpacity></View>}
        </View>

        <View style={[styles.hero, isDesktop ? styles.heroDesktop : styles.heroMobile]}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>FESTIVAL MANAGEMENT PLATFORM</Text>
            <Text style={[styles.heroTitle, isDesktop ? styles.heroTitleDesktop : styles.heroTitleMobile]}>One Platform.{"\n"}Every Festival.{"\n"}Fully Managed.</Text>
            <Text style={styles.heroText}>Manage participants, competitions, schedules, judges, teams, and results from one calm, reliable workspace.</Text>
            <View style={styles.heroActions}>
              <TouchableOpacity onPress={goToLogin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create Your Festival</Text><ArrowRight color="#fff" size={18} /></TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedFestival('College Fest')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Explore Platform</Text></TouchableOpacity>
            </View>
          </View>
          <DashboardPreview />
        </View>

        <Section title="Tailored for every scale" subtitle="Choose the festival model that fits your event. Your workflows stay configurable.">
          <View style={styles.typeGrid}>{festivalTypes.map((type) => <TouchableOpacity key={type.label} onPress={() => setSelectedFestival(type.label)} style={[styles.typeCard, selectedFestival === type.label && styles.typeCardSelected]}><Text style={styles.typeIcon}>{type.icon}</Text><Text style={[styles.typeLabel, selectedFestival === type.label && styles.typeLabelSelected]}>{type.label}</Text></TouchableOpacity>)}</View>
        </Section>

        <Section id="features" title="Everything you need to run a flawless festival" subtitle="Purpose-built modules for educational, cultural, and multi-stage events.">
          <View style={styles.featureGrid}>{features.map(({ title, text, icon: Icon }) => <View key={title} style={styles.featureCard}><View style={styles.featureIcon}><Icon color={COLORS.teal} size={23} /></View><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureText}>{text}</Text></View>)}</View>
        </Section>

        <View style={styles.darkSection}>
          <Text style={styles.darkEyebrow}>SIMPLE, CONNECTED WORKFLOW</Text><Text style={styles.darkTitle}>From registration to results.</Text>
          <View style={styles.steps}>{['Create your festival', 'Register participants', 'Run competitions', 'Publish results'].map((step, index) => <View key={step} style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}</View>
        </View>

        <Section title="Built around every role" subtitle="Each person gets a focused portal with only the tools they need.">
          <View style={styles.roleGrid}>{[['Festival Admin', 'Control the entire event'], ['Judge', 'Enter marks with confidence'], ['Team Leader', 'Track your team in real time'], ['Participant', 'Follow schedules and results']].map(([title, text]) => <View key={title} style={styles.roleCard}><Text style={styles.roleTitle}>{title}</Text><Text style={styles.roleText}>{text}</Text></View>)}</View>
        </Section>

        <View style={styles.securitySection}><View style={styles.securityCopy}><Text style={styles.eyebrow}>SECURITY AND RELIABILITY</Text><Text style={styles.securityTitle}>A dependable foundation for high-stakes coordination.</Text><Text style={styles.heroText}>Keep festival data isolated, permissions clear, and publishing under administrative control.</Text></View><View style={styles.securityList}>{['Tenant-isolated festivals', 'Role-based access', 'Safe result publishing', 'Audit-friendly workflows'].map((item) => <View key={item} style={styles.securityItem}><CheckCircle2 color={COLORS.teal} size={21} /><Text style={styles.securityItemText}>{item}</Text></View>)}</View></View>

        <View style={styles.cta}><View style={styles.ctaPattern} /><Text style={[styles.ctaTitle, styles.ctaTitleLight]}>Run your next festival with confidence.</Text><Text style={[styles.ctaText, styles.ctaTextLight]}>Bring registrations, schedules, judging, and results together in one platform.</Text><TouchableOpacity onPress={goToLogin} style={styles.ctaButton}><Text style={styles.ctaButtonText}>Get Started Today</Text></TouchableOpacity></View>
        <View style={styles.footer}><View><Text style={styles.footerBrand}>FestManager</Text><Text style={styles.footerText}>One platform for every festival.</Text></View><View style={styles.footerLinks}>{['Features', 'How It Works', 'Security', 'Sign In'].map((item) => <TouchableOpacity key={item} onPress={item === 'Sign In' ? goToLogin : undefined}><Text style={styles.footerLink}>{item}</Text></TouchableOpacity>)}</View><Text style={styles.footerText}>© 2026 FestManager. All rights reserved.</Text></View>
      </ScrollView>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode; id?: string }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text>{children}</View>; }

function DashboardPreview() { return <View style={styles.preview}><Image source={require('../../assets/images/festival-dashboard-preview.png')} style={styles.dashboardImage} resizeMode="cover" accessibilityLabel="Festival management dashboard preview" /></View>; }

const COLORS = { navy: '#0F172A', teal: '#0D9488', mint: '#D1FAE5', border: '#E2E8F0', bg: '#FCF8FA', muted: '#64748B', gold: '#FEF3C7' };
const shadow = Platform.select({ web: { boxShadow: '0 12px 28px rgba(15,23,42,0.07)' }, default: { shadowColor: COLORS.navy, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } } });
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: COLORS.bg }, dashboardImage: { width: '100%', height: '100%' }, content: { paddingBottom: 0 }, headerWrap: { backgroundColor: 'rgba(252,248,250,0.96)', borderBottomWidth: 1, borderBottomColor: COLORS.border }, header: { width: '100%', maxWidth: 1180, height: 76, alignSelf: 'center', paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 22, fontWeight: '800' }, brand: { color: COLORS.navy, fontSize: 21, fontWeight: '800' }, navLinks: { flexDirection: 'row', gap: 28 }, navText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 }, signIn: { color: COLORS.muted, fontSize: 14, fontWeight: '600' }, headerCta: { backgroundColor: COLORS.navy, borderRadius: 9, paddingHorizontal: 17, paddingVertical: 11 }, headerCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 }, menuButton: { padding: 8 }, mobileMenu: { padding: 18, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 18 }, mobileMenuText: { color: COLORS.navy, fontWeight: '700', fontSize: 15 }, hero: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 72, gap: 40 }, heroDesktop: { flexDirection: 'row', alignItems: 'center' }, heroMobile: { flexDirection: 'column' }, heroCopy: { flex: 1 }, eyebrow: { color: COLORS.teal, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 }, heroTitle: { color: COLORS.navy, fontWeight: '800', letterSpacing: -1 }, heroTitleDesktop: { fontSize: 48, lineHeight: 56, marginTop: 16 }, heroTitleMobile: { fontSize: 36, lineHeight: 43, marginTop: 14 }, heroText: { color: COLORS.muted, fontSize: 17, lineHeight: 27, marginTop: 18, maxWidth: 600 }, heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28 }, primaryButton: { backgroundColor: COLORS.navy, borderRadius: 9, paddingHorizontal: 19, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 }, secondaryButton: { borderColor: COLORS.teal, borderWidth: 1, borderRadius: 9, paddingHorizontal: 19, paddingVertical: 14 }, secondaryButtonText: { color: COLORS.teal, fontWeight: '700', fontSize: 14 }, preview: { flex: 1.15, minHeight: 360, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...shadow }, previewTop: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#F8FAFC' }, previewDots: { flexDirection: 'row', gap: 6 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E77D8A' }, previewLabel: { flex: 1, textAlign: 'center', color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, previewBody: { flex: 1, flexDirection: 'row', padding: 16, gap: 14, backgroundColor: '#EFF4F8' }, previewSidebar: { width: 105, borderRightWidth: 1, borderRightColor: COLORS.border, gap: 14 }, sidebarMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.teal, color: '#fff', textAlign: 'center', paddingTop: 4, fontWeight: '800', overflow: 'hidden' }, sidebarRow: { gap: 5 }, sidebarRowActive: { backgroundColor: '#ECFDF5', padding: 6, borderRadius: 6, marginRight: 8 }, sidebarLine: { width: 56, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' }, sidebarText: { color: COLORS.muted, fontSize: 9 }, previewMain: { flex: 1, gap: 15 }, previewHeading: { color: COLORS.navy, fontSize: 17, fontWeight: '800' }, previewStats: { flexDirection: 'row', gap: 8 }, previewStat: { flex: 1, padding: 10, borderRadius: 9, backgroundColor: '#F8FAFC' }, previewStatValue: { color: COLORS.navy, fontSize: 16, fontWeight: '800' }, previewStatLabel: { color: COLORS.muted, fontSize: 9, marginTop: 4 }, scheduleCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, backgroundColor: '#fff' }, scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, scheduleTitle: { color: COLORS.navy, fontSize: 12, fontWeight: '800' }, liveBadge: { color: COLORS.teal, fontSize: 9, fontWeight: '800' }, scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, scheduleItem: { color: COLORS.muted, fontSize: 10 }, scheduleTime: { color: COLORS.teal, fontSize: 10, fontWeight: '700' }, chartRow: { height: 65, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10 }, chartBar: { width: 20, height: 24, borderRadius: 4, backgroundColor: '#8FD8CC' }, resultsBadge: { position: 'absolute', top: 28, right: 28, padding: 14, borderRadius: 10, backgroundColor: '#fff', minWidth: 142, ...shadow }, resultsLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' }, resultsValue: { color: COLORS.teal, fontSize: 22, fontWeight: '800', marginTop: 4 }, resultsSub: { color: COLORS.muted, fontSize: 9, marginTop: 2 }, section: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 72 }, sectionTitle: { color: COLORS.navy, fontSize: 30, lineHeight: 38, fontWeight: '800', textAlign: 'center' }, sectionSubtitle: { color: COLORS.muted, fontSize: 16, lineHeight: 25, textAlign: 'center', maxWidth: 650, alignSelf: 'center', marginTop: 10, marginBottom: 30 }, typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }, typeCard: { minWidth: 150, flex: 1, maxWidth: 230, alignItems: 'center', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff', ...shadow }, typeCardSelected: { borderColor: COLORS.teal, borderWidth: 2, backgroundColor: '#F0FDFA' }, typeIcon: { fontSize: 28 }, typeLabel: { color: COLORS.navy, fontSize: 14, fontWeight: '700', marginTop: 8 }, typeLabelSelected: { color: COLORS.teal }, featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, featureCard: { flexGrow: 1, flexBasis: 300, minHeight: 166, padding: 22, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff', ...shadow }, featureIcon: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, featureTitle: { color: COLORS.navy, fontSize: 17, fontWeight: '800' }, featureText: { color: COLORS.muted, fontSize: 14, lineHeight: 22, marginTop: 7 }, darkSection: { backgroundColor: COLORS.navy, paddingHorizontal: 24, paddingVertical: 70, alignItems: 'center' }, darkEyebrow: { color: '#99F6E4', fontSize: 12, fontWeight: '800', letterSpacing: 1.8 }, darkTitle: { color: '#fff', fontSize: 31, fontWeight: '800', marginTop: 12, textAlign: 'center' }, steps: { width: '100%', maxWidth: 950, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 20, marginTop: 38 }, step: { flex: 1, minWidth: 170, alignItems: 'center', gap: 12 }, stepNumber: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: '#fff', fontWeight: '800' }, stepText: { color: '#E2E8F0', textAlign: 'center', fontSize: 14, fontWeight: '700' }, roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, roleCard: { flex: 1, minWidth: 210, padding: 22, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border }, roleTitle: { color: COLORS.navy, fontSize: 17, fontWeight: '800' }, roleText: { color: COLORS.muted, fontSize: 14, marginTop: 8 }, securitySection: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 72, flexDirection: 'row', flexWrap: 'wrap', gap: 45, alignItems: 'center' }, securityCopy: { flex: 1, minWidth: 280 }, securityTitle: { color: COLORS.navy, fontSize: 31, lineHeight: 39, fontWeight: '800', marginTop: 12 }, securityList: { flex: 1, minWidth: 280, gap: 15 }, securityItem: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border }, securityItemText: { color: COLORS.navy, fontSize: 15, fontWeight: '700' }, cta: { marginHorizontal: 24, marginBottom: 0, paddingHorizontal: 24, paddingVertical: 62, borderRadius: 20, backgroundColor: COLORS.navy, alignItems: 'center', overflow: 'hidden' }, ctaPattern: { ...StyleSheet.absoluteFillObject, opacity: 0.13, backgroundColor: 'transparent' }, ctaTitle: { color: COLORS.navy, fontSize: 30, fontWeight: '800', textAlign: 'center' }, ctaTitleLight: { color: '#fff' }, ctaText: { color: '#34515B', fontSize: 16, marginTop: 10, textAlign: 'center' }, ctaTextLight: { color: '#CBD5E1' }, ctaButton: { marginTop: 24, borderRadius: 9, backgroundColor: COLORS.teal, paddingHorizontal: 20, paddingVertical: 14 }, ctaButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 }, footer: { marginTop: 64, paddingHorizontal: 24, paddingVertical: 38, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 28 }, footerBrand: { color: COLORS.navy, fontSize: 21, fontWeight: '800' }, footerText: { color: COLORS.muted, fontSize: 13, marginTop: 8 }, footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, footerLink: { color: COLORS.navy, fontSize: 13, fontWeight: '700' } });
