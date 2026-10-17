// Central feature-flag configuration.
//
// EXPO_PUBLIC_ENABLE_ONBOARDING controls the tenant/child organisation
// onboarding and credential-reset surfaces (superadmin "Onboard" / "Reset",
// unit admin "Add New" / "Reset").
//
// SAFE DEFAULT: false. Enable ONLY after the final runtime validation PASS:
//   EXPO_PUBLIC_ENABLE_ONBOARDING=true
export const FEATURE_FLAGS = {
  ENABLE_ONBOARDING: (process.env.EXPO_PUBLIC_ENABLE_ONBOARDING || 'false') === 'true',
} as const;
