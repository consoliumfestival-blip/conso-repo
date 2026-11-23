import React, { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { AyaticLoadingScreen } from '@/components/loading-ui/AyaticLoadingScreen';
import { PortalManagementHeader } from '@/components/layout/PortalManagementHeader';

type PortalManagementPageProps = {
  title: string;
  description: string;
  loading?: boolean;
  beforeHeader?: ReactNode;
  children: ReactNode;
};

export function PortalManagementPage({
  title,
  description,
  loading = false,
  beforeHeader,
  children,
}: PortalManagementPageProps) {
  if (loading) return <PortalManagementPageLoading />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      horizontal={false}
      showsHorizontalScrollIndicator={false}
    >
      <View style={{ width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
        {beforeHeader}
        <PortalManagementHeader title={title} description={description} />
        {children}
      </View>
    </ScrollView>
  );
}

export function PortalManagementPageLoading({ section = false }: { section?: boolean }) {
  return (
    <View style={section ? { minHeight: 320, marginBottom: 14 } : { flex: 1 }}>
      <AyaticLoadingScreen />
    </View>
  );
}
