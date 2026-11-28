import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CandidateStandaloneLogin } from '../../components/publicLanding/CandidateAppControls';
import { DEFAULT_PUBLIC_TENANT_ID, LEGACY_PUBLIC_TENANT_ALIAS } from '../../components/publicLanding/PublicFestivalMenu';
import {
  isCandidateLoggedOut,
  readPinnedCandidate,
  writePinnedCandidate,
} from '../../core/utils/candidateWebPush';

export default function CandidateAppEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeTenant = Array.isArray(params.tenant_id) ? params.tenant_id[0] : params.tenant_id;
  const festivalId = Array.isArray(params.festival_id) ? params.festival_id[0] : params.festival_id;
  const effectiveTenantId =
    routeTenant && routeTenant !== LEGACY_PUBLIC_TENANT_ALIAS
      ? routeTenant
      : DEFAULT_PUBLIC_TENANT_ID;
  const [readyForLogin, setReadyForLogin] = useState(false);

  useEffect(() => {
    const loggedOut = isCandidateLoggedOut();
    const pinned = readPinnedCandidate();
    if (!loggedOut && pinned?.slug) {
      router.replace({
        pathname: '/candidate/[slug]',
        params: {
          slug: pinned.slug,
          installedPortal: 'candidate',
          ...(pinned.tenant_id ? { tenant_id: pinned.tenant_id } : {}),
          ...(pinned.festival_id ? { festival_id: pinned.festival_id } : {}),
        },
      } as any);
      return;
    }
    setReadyForLogin(true);
  }, [router]);

  if (!readyForLogin) {
    return null;
  }

  return (
    <CandidateStandaloneLogin
      tenantId={effectiveTenantId}
      festivalId={festivalId}
      onSelectCandidate={(slug, name) => {
        writePinnedCandidate({
          slug,
          name,
          tenant_id: routeTenant || null,
          festival_id: festivalId || null,
        });
        router.replace({
          pathname: '/candidate/[slug]',
          params: {
            slug,
            installedPortal: 'candidate',
            ...(routeTenant ? { tenant_id: routeTenant } : {}),
            ...(festivalId ? { festival_id: festivalId } : {}),
          },
        } as any);
      }}
    />
  );
}
