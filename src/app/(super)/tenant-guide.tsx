import React from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Info, ShieldCheck } from 'lucide-react-native';
import { superAdminColor as coreColor } from '@/constants/superAdminTheme';
import { FEATURE_FLAGS } from '@/core/config/features';

const C = {
  bg: coreColor('#0B1524', 'background'),
  surface: coreColor('#111E35', 'surface'),
  border: coreColor('#1E3A5F', 'border'),
  accent: coreColor('#FBBF24', 'primary'),
  text: coreColor('#E2E8F0', 'text'),
  muted: coreColor('#94A3B8', 'textMuted'),
  green: coreColor('#34D399', 'success'),
  greenBg: coreColor('rgba(52,211,153,0.10)', 'successSoft'),
  warning: coreColor('#FBBF24', 'warning'),
  warningBg: coreColor('rgba(251,191,36,0.10)', 'warningSoft'),
};

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.green, fontWeight: '800', fontSize: 13 }}>{number}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 19 }}>{children}</Text>
      </View>
    </View>
  );
}

export default function TenantGuide() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 640;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 36 }}>
      <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: compact ? 16 : 28, paddingTop: Platform.OS === 'web' ? 24 : 44 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to Superadmin dashboard"
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}
        >
          <ArrowLeft size={19} color={C.text} />
        </TouchableOpacity>

        <Text style={{ color: C.accent, fontFamily: 'Poppins_600SemiBold', fontSize: 11, letterSpacing: 1.5 }}>SUPERADMIN HELP</Text>
        <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: compact ? 23 : 28, lineHeight: compact ? 30 : 36, marginTop: 4 }}>Create and activate a tenant</Text>
        <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 }}>
          A tenant account is linked to an organisation. Create the organisation first, then provision its admin account from Tenant Accounts.
        </Text>

        <View style={{ gap: 10 }}>
          <Step number="1" title="Create the organisation">
            Open Organisation Hierarchy and choose Create Organisation. Enter its name and level. State is the top level; District needs a State, Division needs a District, Sector needs a Division, and Unit needs a Sector. Create any required parent organisations first.
          </Step>
          <Step number="2" title="Open Tenant Accounts">
            Return to the Superadmin dashboard and open Tenant Accounts. Find the organisation you just created. An organisation without portal access is shown with an Onboard action.
          </Step>
          <Step number="3" title="Provision the tenant admin">
            Select Onboard, enter a valid admin email, choose Standard Festival or College Fest, then select Create Tenant Account. Wait for “Completed — account linked” before closing the form. If provisioning fails, use Retry in the same form; it resumes the organisation’s existing operation instead of starting a duplicate account.
          </Step>
          <Step number="4" title="Deliver the one-time credentials securely">
            After a new account is linked, the temporary password is shown once. Copy or record the login identifier and temporary password, then deliver them through a secure channel. The temporary password is not stored by the app. Ask the admin to sign in through the app’s login page. If the organisation was already linked, provisioning will not issue another password; use the existing credentials or the available credential-reset workflow.
          </Step>
        </View>

        <View style={{ marginTop: 14, padding: 15, borderRadius: 12, backgroundColor: C.greenBg, borderWidth: 1, borderColor: `${C.green}55`, flexDirection: 'row', gap: 10 }}>
          <CheckCircle2 size={18} color={C.green} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>New tenants are enabled when provisioning completes</Text>
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 }}>
              There is no separate activation step for a newly created tenant. Tenant Accounts should show it as Active after the account has been linked.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10, padding: 15, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 10 }}>
          <ShieldCheck size={18} color={C.accent} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Re-enable a disabled tenant</Text>
            <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 }}>
              In Tenant Accounts, open the Disabled organisation and choose Re-enable Access, then confirm. This restores tenant access and preserves festival data/history. It does not create a missing admin account or reset its password.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10, padding: 15, borderRadius: 12, backgroundColor: C.warningBg, borderWidth: 1, borderColor: `${C.warning}55`, flexDirection: 'row', gap: 10 }}>
          <Info size={18} color={C.warning} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: C.warning, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>If Onboard is unavailable</Text>
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 }}>
              {FEATURE_FLAGS.ENABLE_ONBOARDING
                ? 'Tenant onboarding is enabled in this build. If Onboard is still unavailable for an organisation, refresh Tenant Accounts and check that the organisation has not already been linked to a tenant.'
                : 'Tenant onboarding is disabled in this build. EXPO_PUBLIC_ENABLE_ONBOARDING defaults to off; the deployed app configuration must enable it for Onboard and credential-reset actions to appear.'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, marginTop: 18 }}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/(super)/organisations')}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>Open Organisation Hierarchy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/(super)/tenants')}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.green, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>Open Tenant Accounts</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
