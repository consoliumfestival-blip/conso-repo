export type TeamReadScope = {
  userId?: string | null; tenantId?: string | null; role?: string | null;
  assignmentId?: string | null; parentTenantId?: string | null;
  festivalId?: string | null; festivalTeamId?: string | null; organisationId?: string | null;
};
export function teamReadKey(scope: TeamReadScope, resource: string) {
  return ['team-read', scope.userId, scope.tenantId, scope.role, scope.assignmentId, scope.parentTenantId, scope.festivalId, scope.festivalTeamId, scope.organisationId, resource] as const;
}
export function isTeamAuthorizationError(error: any): boolean {
  return error?.status === 401 || error?.status === 403 || error?.code === '42501' || error?.code === 'PGRST301';
}
