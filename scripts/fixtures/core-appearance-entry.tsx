import React from 'react';
import LoginScreen from '../../src/app/(auth)/login';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { CoreAppearanceProvider } from '../../src/core/contexts/CoreAppearanceContext';
import { AdminAppShell } from '../../src/components/layout/AdminAppShell';
import AppearanceSettings from '../../src/app/(admin)/settings/appearance';
import { SsfCard } from '../../src/components/ui/SsfCard';
import { SsfSelectMenu } from '../../src/components/ui/SsfSelectMenu';
import { SsfButton } from '../../src/components/ui/SsfButton';
import { ui } from '../../src/constants/designSystem';
import StageVenuePortal from '../../src/components/stage/StageVenuePortal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamLeaderThemeProvider } from '../../src/core/contexts/TeamLeaderThemeContext';
import { Card as TeamCard, CardContent as TeamCardContent } from '../../src/components/team/TeamCard';
import { TeamText } from '../../src/components/team/TeamText';

const queryClient = new QueryClient();
function Fixture() {
  const [screen, setScreen] = React.useState('appearance');
  const [value, setValue] = React.useState('scheduled');
  return <QueryClientProvider client={queryClient}>
    <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:8, color:'#17212E', background:'#dbe3ed', fontFamily:'sans-serif' }}><strong>Isolated Core appearance fixture — no backend connection</strong>{['appearance','stage','login','isolation'].map(name=><button key={name} onClick={()=>setScreen(name)}>{name}</button>)}</div>
    {screen==='isolation' ? <TeamLeaderThemeProvider><TeamCard><TeamCardContent><TeamText>Team Leader retains its own palette</TeamText><SsfCard><Text>Shared fallback surface</Text></SsfCard></TeamCardContent></TeamCard></TeamLeaderThemeProvider> : <CoreAppearanceProvider>{screen==='login'?<LoginScreen/>:screen==='stage'?<StageVenuePortal venueId="11111111-1111-4111-8111-111111111111"/>:<AdminAppShell><View style={{ flex:1 }}><AppearanceSettings/><SsfCard style={{ margin:16 }}><Text style={{ color:ui.colors.text, marginBottom:8 }}>Actual shared components</Text><SsfSelectMenu value={value} options={[{label:'Upcoming',value:'scheduled'},{label:'Started',value:'ongoing'},{label:'Completed',value:'completed'}]} onValueChange={setValue}/><View style={{ marginTop:8, flexDirection:'row',flexWrap:'wrap',gap:8 }}><SsfButton label="Primary action" onPress={()=>undefined}/><SsfButton label="Secondary action" variant="outline" onPress={()=>undefined}/></View></SsfCard></View></AdminAppShell>}</CoreAppearanceProvider>}
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
