import { ui } from '@/constants/designSystem';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react-native';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { supabase } from '../../../core/config/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { judgeTokenService } from '../../../services/judgeTokenService';

type ApprovalFilter = 'all' | 'pending_approval' | 'approved' | 'rejected';

type ApprovalRecord = {
  id: string;
  token: string | null;
  judge_id: string;
  schedule_id: string;
  status: string | null;
  is_used: boolean;
  is_revoked: boolean | null;
  expires_at: string | null;
  created_at: string;
  judges?: { name?: string | null } | null;
  schedules?: {
    items?: {
      item_name_en?: string | null;
      item_name_ml?: string | null;
      item_code?: string | null;
    } | null;
    venues?: { name?: string | null } | null;
  } | null;
};

const filters: { key: ApprovalFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const effectiveStatus = (approval: ApprovalRecord): ApprovalFilter => {
  if (approval.is_revoked || approval.status === 'rejected') return 'rejected';
  if (approval.status === 'approved') return 'approved';
  return 'pending_approval';
};

const statusStyle = (status: ApprovalFilter) => {
  if (status === 'approved') {
    return {
      label: 'Approved',
      background: 'bg-green-100',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: CheckCircle2,
      iconColor: '#15803D',
    };
  }
  if (status === 'rejected') {
    return {
      label: 'Rejected',
      background: 'bg-red-100',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: XCircle,
      iconColor: ui.colors.destructive,
    };
  }
  return {
    label: 'Pending',
    background: 'bg-amber-100',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: Clock3,
    iconColor: '#B45309',
  };
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function JudgeApprovalsPage() {
  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<ApprovalFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionTokenId, setActionTokenId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchApprovals = useCallback(async (showRefresh = false) => {
    if (!tenant_id) {
      setApprovals([]);
      setIsLoading(false);
      return;
    }

    if (showRefresh) setIsRefreshing(true);
    setErrorMessage(null);

    const { data: tokenRows, error } = await supabase
      .from('judge_tokens')
      .select('id, token, judge_id, schedule_id, status, is_used, is_revoked, expires_at, created_at')
      .eq('tenant_id', tenant_id)
      .in('status', ['pending_approval', 'approved', 'rejected'])
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMessage(error.message || 'Unable to load approval requests.');
    } else {
      const tokens = tokenRows ?? [];
      const judgeIds = [...new Set(tokens.map((row: any) => row.judge_id).filter(Boolean))];
      const scheduleIds = [...new Set(tokens.map((row: any) => row.schedule_id).filter(Boolean))];

      const [{ data: judgeRows, error: judgeError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
        judgeIds.length
          ? supabase.from('judges').select('id, name').in('id', judgeIds)
          : Promise.resolve({ data: [], error: null }),
        scheduleIds.length
          ? supabase.from('schedules').select('id, item_id, venue_id').in('id', scheduleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (judgeError || scheduleError) {
        setErrorMessage(judgeError?.message || scheduleError?.message || 'Unable to load approval details.');
      } else {
        const itemIds = [...new Set((scheduleRows ?? []).map((row: any) => row.item_id).filter(Boolean))];
        const venueIds = [...new Set((scheduleRows ?? []).map((row: any) => row.venue_id).filter(Boolean))];
        const [{ data: itemRows, error: itemError }, { data: venueRows, error: venueError }] = await Promise.all([
          itemIds.length
            ? supabase.from('items').select('id, item_name_en, item_name_ml, item_code').in('id', itemIds)
            : Promise.resolve({ data: [], error: null }),
          venueIds.length
            ? supabase.from('venues').select('id, name').in('id', venueIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (itemError || venueError) {
          setErrorMessage(itemError?.message || venueError?.message || 'Unable to load schedule details.');
        } else {
          const judgesById = new Map((judgeRows ?? []).map((row: any) => [row.id, row]));
          const schedulesById = new Map((scheduleRows ?? []).map((row: any) => [row.id, row]));
          const itemsById = new Map((itemRows ?? []).map((row: any) => [row.id, row]));
          const venuesById = new Map((venueRows ?? []).map((row: any) => [row.id, row]));

          setApprovals(tokens.map((token: any) => {
            const schedule: any = schedulesById.get(token.schedule_id);
            return {
              ...token,
              judges: judgesById.get(token.judge_id) ?? null,
              schedules: schedule ? {
                items: itemsById.get(schedule.item_id) ?? null,
                venues: venuesById.get(schedule.venue_id) ?? null,
              } : null,
            };
          }) as ApprovalRecord[]);
        }
      }
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [tenant_id]);

  useEffect(() => {
    fetchApprovals();

    if (!tenant_id) return;
    const channel = supabase
      .channel(`judge_approvals_${tenant_id}_${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'judge_tokens',
          filter: `tenant_id=eq.${tenant_id}`,
        },
        () => fetchApprovals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant_id, fetchApprovals]);

  const counts = useMemo(() => {
    const result = {
      all: approvals.length,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
    };
    approvals.forEach((approval) => {
      result[effectiveStatus(approval)] += 1;
    });
    return result;
  }, [approvals]);

  const filteredApprovals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return approvals.filter((approval) => {
      const status = effectiveStatus(approval);
      if (selectedFilter !== 'all' && status !== selectedFilter) return false;

      const judgeName = approval.judges?.name || '';
      const item = approval.schedules?.items;
      const eventName = item?.item_name_en || item?.item_name_ml || '';
      const itemCode = item?.item_code || '';
      const token = approval.token || '';

      return !query
        || judgeName.toLowerCase().includes(query)
        || eventName.toLowerCase().includes(query)
        || itemCode.toLowerCase().includes(query)
        || token.toLowerCase().includes(query);
    });
  }, [approvals, searchQuery, selectedFilter]);

  const approveRequest = async (tokenId: string) => {
    setActionTokenId(tokenId);
    setErrorMessage(null);
    try {
      await judgeTokenService.approveLogin(tokenId);
      await fetchApprovals();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to approve this request.');
    } finally {
      setActionTokenId(null);
    }
  };

  const rejectRequest = async (tokenId: string) => {
    const performReject = async () => {
      setActionTokenId(tokenId);
      setErrorMessage(null);
      try {
        await judgeTokenService.rejectLogin(tokenId);
        await fetchApprovals();
      } catch (error: any) {
        setErrorMessage(error?.message || 'Unable to reject this request.');
      } finally {
        setActionTokenId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Reject this judge login request?')) {
        await performReject();
      }
      return;
    }

    Alert.alert('Reject Login Request', 'Reject this judge login request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: performReject },
    ]);
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      <View className="bg-white border-b border-ui-border py-4 px-5">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="h-9 w-9 mr-3 rounded-lg border border-ui-border bg-white items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Back to Judge Panel"
          >
            <ArrowLeft size={18} color="#334155" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="font-poppins-black text-ui-text text-xl">
              Login Approvals
            </Text>
            <Text className="font-poppins text-ui-text-muted text-xs mt-0.5">
              Review pending, approved and rejected judge requests
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => fetchApprovals(true)}
            disabled={isRefreshing}
            className="h-9 w-9 rounded-lg bg-white border border-ui-border items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Refresh approvals"
          >
            {isRefreshing
              ? <ActivityIndicator size="small" color="#0F766E" />
              : <RefreshCw size={17} color="#0F766E" />}
          </TouchableOpacity>
        </View>
      </View>

      <View className="mx-4 mt-4 bg-white border border-ui-border rounded-xl p-3">
        <View className="flex-row items-center bg-white border border-ui-border rounded-lg px-3 h-10">
          <Search size={17} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search judge, event or code..."
            className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
            accessibilityLabel="Search approvals"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2.5"
          contentContainerStyle={{ gap: 8, paddingRight: 16 }}
        >
          {filters.map((filter) => {
            const isSelected = selectedFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                onPress={() => setSelectedFilter(filter.key)}
                className={`flex-row items-center px-3 h-8 rounded-lg border ${
                  isSelected
                    ? 'bg-teal-50 border-teal-200'
                    : 'bg-white border-ui-border'
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${filter.label}, ${counts[filter.key]}`}
              >
                <Text className={`font-poppins-bold text-xs ${
                  isSelected ? 'text-teal-700' : 'text-ui-text-muted'
                }`}>
                  {filter.label}
                </Text>
                <View className={`ml-2 min-w-5 h-5 px-1 rounded-full items-center justify-center ${
                  isSelected ? 'bg-teal-100' : 'bg-ui-muted'
                }`}>
                  <Text className={`font-poppins-bold text-[10px] ${
                    isSelected ? 'text-teal-700' : 'text-ui-text-muted'
                  }`}>
                    {counts[filter.key]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {errorMessage && (
        <View className="mx-4 mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
          <Text className="font-poppins text-xs text-red-700">{errorMessage}</Text>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 p-4">
          <SsfTableSkeleton rows={7} columns={4} />
        </View>
      ) : filteredApprovals.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-2xl bg-gray-100 items-center justify-center">
            <ShieldCheck size={30} color="#9CA3AF" />
          </View>
          <Text className="font-poppins-bold text-ssf-text mt-4">
            No approval requests found
          </Text>
          <Text className="font-poppins text-xs text-gray-500 text-center mt-1">
            New judge login requests will appear here automatically.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 mt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View className="flex-1 bg-white border border-ui-border rounded-xl overflow-hidden" style={{ minWidth: 1060 }}>
              <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
                <Text style={{ flex: 1.25 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Judge</Text>
                <Text style={{ flex: 1.7 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event</Text>
                <Text style={{ flex: 1.1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue</Text>
                <Text style={{ width: 120 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Access Code</Text>
                <Text style={{ width: 175 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Requested</Text>
                <Text style={{ width: 110 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Status</Text>
                <Text style={{ width: 170 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
              </View>

              {filteredApprovals.map((approval) => {
                const status = effectiveStatus(approval);
                const style = statusStyle(status);
                const StatusIcon = style.icon;
                const item = approval.schedules?.items;
                const eventName = item?.item_name_en || item?.item_name_ml || 'Unknown event';
                const judgeName = approval.judges?.name || 'Unknown judge';
                const isActionRunning = actionTokenId === approval.id;
                const isExpired = approval.expires_at
                  ? new Date(approval.expires_at).getTime() <= Date.now()
                  : false;

                return (
                  <View key={approval.id} className="min-h-16 px-4 flex-row items-center border-b border-ui-border bg-white">
                    <View style={{ flex: 1.25 }} className="flex-row items-center pr-3">
                      <View className="h-8 w-8 rounded-lg bg-teal-50 items-center justify-center mr-2.5">
                        <Text className="font-poppins-black text-xs text-teal-700">{judgeName.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text numberOfLines={1} className="flex-1 font-poppins-bold text-xs text-ui-text">{judgeName}</Text>
                    </View>
                    <View style={{ flex: 1.7 }} className="pr-3">
                      <Text numberOfLines={1} className="font-poppins text-xs text-ui-text">{eventName}</Text>
                      <Text className="font-poppins text-[10px] text-ui-text-muted">{item?.item_code || '—'}</Text>
                    </View>
                    <Text style={{ flex: 1.1 }} numberOfLines={1} className="font-poppins text-xs text-ui-text-muted pr-3">
                      {approval.schedules?.venues?.name || '—'}
                    </Text>
                    <View style={{ width: 120 }}>
                      <Text className="font-poppins-black text-xs text-teal-700 tracking-widest">{approval.token || 'Hidden'}</Text>
                      {(isExpired || approval.is_used) && (
                        <Text className="font-poppins-bold text-[9px] text-ui-text-muted mt-0.5">
                          {isExpired ? 'Expired' : 'Used'}
                        </Text>
                      )}
                    </View>
                    <Text style={{ width: 175 }} className="font-poppins text-[11px] text-ui-text-muted">
                      {formatDateTime(approval.created_at)}
                    </Text>
                    <View style={{ width: 110, alignItems: 'flex-start' }}>
                      <View className={`flex-row items-center px-2 py-1 rounded-full border ${style.background} ${style.border}`}>
                        <StatusIcon size={12} color={style.iconColor} />
                        <Text className={`font-poppins-bold text-[9px] ml-1 ${style.text}`}>{style.label}</Text>
                      </View>
                    </View>
                    <View style={{ width: 170 }} className="flex-row justify-end gap-x-2">
                      {status === 'pending_approval' ? (
                        <>
                          <TouchableOpacity
                            onPress={() => rejectRequest(approval.id)}
                            disabled={actionTokenId !== null}
                            className="h-8 px-3 rounded-lg border border-red-200 bg-white flex-row items-center justify-center"
                            accessibilityLabel={`Reject ${judgeName}'s login request`}
                          >
                            <X size={13} color="#DC2626" />
                            <Text className="ml-1 font-poppins-bold text-[10px] text-red-600">Reject</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => approveRequest(approval.id)}
                            disabled={actionTokenId !== null}
                            className="h-8 px-3 rounded-lg bg-teal-700 flex-row items-center justify-center"
                            accessibilityLabel={`Approve ${judgeName}'s login request`}
                          >
                            {isActionRunning
                              ? <ActivityIndicator size="small" color={ui.colors.surface} />
                              : <>
                                  <Check size={13} color={ui.colors.surface} />
                                  <Text className="ml-1 font-poppins-bold text-[10px] text-white">Approve</Text>
                                </>}
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text className="font-poppins text-[10px] text-ui-text-muted">No action required</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}
