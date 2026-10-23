import React from 'react';
export const useSegments = () => ['(admin)', 'settings', 'appearance'];
export const usePathname = () => '/settings/appearance';
export const useRouter = () => ({ push: () => undefined, replace: () => undefined, back: () => undefined });
export const useLocalSearchParams = () => ({});
const auth = { user: {id:'fixture',email:'preview@example.test'}, role:'admin', tenant_id:'fixture', is_superadmin:false, logout:()=>undefined };
export const useAuthStore = (selector?: (state: typeof auth) => unknown) => selector ? selector(auth) : auth;
export const useFestival = () => ({ useActiveFestival: () => ({ data:{id:'fixture',custom_name:'Core appearance preview'} }) });
export const useJudgeApprovalStore = () => ({ pendingCount:0 });
export const JudgeApprovalToast = () => null;
export const useCodeLetterUpdates = () => undefined;
export const stageManagementService = { getVenuePortalData: async () => ({ venue: {name:'Preview Stage'}, schedules:[], registrations:[] }) };
export function StatusBar() { return null; }
export const DefaultTheme = { colors:{} };
export function ThemeProvider({children}: {children:React.ReactNode}) { return <>{children}</>; }

export const DevConfig = { isDevMode:false };
export const authService = { login:async()=>{throw new Error('Preview only: sign-in is disabled.');}, friendlyError:(message:string)=>message };
