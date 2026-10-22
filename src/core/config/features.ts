// Central feature-flag configuration.
//
// EXPO_PUBLIC_ENABLE_ONBOARDING controls the tenant/child organisation
// onboarding and credential-reset surfaces (superadmin "Onboard" / "Reset",
// unit admin "Add New" / "Reset").
//
// SAFE DEFAULT: false. Enable ONLY after the final runtime validation PASS:
//   EXPO_PUBLIC_ENABLE_ONBOARDING=true
// Communication Center is temporarily hidden/disabled. Re-enable by setting:
//   EXPO_PUBLIC_ENABLE_COMMUNICATION_CENTER=true
export const FEATURE_FLAGS = {
  ENABLE_ONBOARDING: (process.env.EXPO_PUBLIC_ENABLE_ONBOARDING || 'false') === 'true',
  ENABLE_COMMUNICATION_CENTER:
    (process.env.EXPO_PUBLIC_ENABLE_COMMUNICATION_CENTER || 'false') === 'true',
} as const;
