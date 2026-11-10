import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduleScreen from '../../src/app/team/schedule';
import DashboardScreen from '../../src/app/team/dashboard';
import ResultsScreen from '../../src/app/team/results';
import MyTeamScreen from '../../src/app/team/my-team';
import AnnouncementsScreen from '../../src/app/team/announcements';
import ParticipantsScreen from '../../src/app/team/participants';
import ProgramsScreen from '../../src/app/team/programs';
import ProfileScreen from '../../src/app/team/profile';

const root = createRoot(document.getElementById('root')!);
let version = 0;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
(window as any).mountPopupFixture = (options = {}) => {
  window.popupFixture = { complete: false, calls: 0, navigationCount: 0, ...options };
  queryClient.clear();
  root.render(<QueryClientProvider client={queryClient}><ScheduleScreen key={++version} /></QueryClientProvider>);
};
(window as any).updatePopupFixture = (options = {}) => {
  Object.assign(window.popupFixture, options);
  root.render(<QueryClientProvider client={queryClient}><ScheduleScreen key={version} /></QueryClientProvider>);
};
(window as any).leaveScheduleFixture = () => {
  root.render(<QueryClientProvider client={queryClient}><div>Fixture away</div></QueryClientProvider>);
};
(window as any).returnScheduleFixture = () => {
  root.render(<QueryClientProvider client={queryClient}><ScheduleScreen key={++version} /></QueryClientProvider>);
};
const screens: Record<string, React.ComponentType> = { schedule: ScheduleScreen, dashboard: DashboardScreen, results: ResultsScreen, team: MyTeamScreen, announcements: AnnouncementsScreen, participants: ParticipantsScreen, programs: ProgramsScreen, profile: ProfileScreen };
(window as any).navigateTeamFixture = (name: string) => {
  const Screen = screens[name];
  root.render(<QueryClientProvider client={queryClient}><Screen key={++version} /></QueryClientProvider>);
};
(window as any).mountPopupFixture();
