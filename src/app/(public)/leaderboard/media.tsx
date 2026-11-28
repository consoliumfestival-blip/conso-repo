import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SahithyolsavLandingPage } from '../../../components/publicLanding/SahithyolsavLandingPage.web';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../core/config/supabase';
import { storageService } from '../../../services/storage/storageService';
import { Download, Play, X, Maximize2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTenantFeatures } from '@/core/hooks/useTenantFeatures';
import { PublicUnavailableScreen } from '@/components/publicLanding/PublicUnavailableScreen';

type PublicMediaCard = {
  id: string;
  render_hash: string;
  event_name: string;
  created_at: string;
  download_url?: string;
  resolutions: Record<string, string | undefined>;
};

const DEFAULT_TENANT_ID = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const signedUrlCache = new Map<string, { url: string, expires: number }>();

export default function PublicMediaCenter() {
  const params = useLocalSearchParams();
  const rawTenantId = Array.isArray(params.tenant_id) ? params.tenant_id[0] : (params.tenant_id as string | undefined);
  const tenantId = rawTenantId || DEFAULT_TENANT_ID;
  const festivalIdParam = Array.isArray(params.festival_id) ? params.festival_id[0] : (params.festival_id as string | undefined);
  const { settings: publicFeatures, isLoading: publicFeaturesLoading } = useTenantFeatures(tenantId, true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const { data: festivalInfo } = useQuery({
    queryKey: ['public-tenant-festival', tenantId],
    queryFn: async () => {
      if (Platform.OS === 'web' || !tenantId) return null;
      const { data, error } = await supabase
        .from('festival_calendar')
        .select('id, custom_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .single();
      if (error) return null;
      return data;
    },
    enabled: Platform.OS !== 'web' && !!tenantId && !publicFeaturesLoading && publicFeatures.modules.public_page && publicFeatures.sections.public_page.media
  });

  const { data: posters = [], isLoading } = useQuery<PublicMediaCard[]>({
    queryKey: ['public-generated-posters', tenantId, festivalIdParam || festivalInfo?.id || 'active'],
    queryFn: async (): Promise<PublicMediaCard[]> => {
      if (Platform.OS === 'web') {
        const qs = new URLSearchParams({ tenant_id: tenantId, section: 'media' });
        if (festivalIdParam) qs.set('festival_id', festivalIdParam);
        const res = await fetch(`/api/public-media?${qs.toString()}`, {
          cache: 'no-store',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('Public media is unavailable');
        const payload = await res.json();
        if (payload?.enabled === false || !Array.isArray(payload?.items)) return [];
        return payload.items.map((item: any) => ({
          id: item.id,
          render_hash: item.render_hash,
          event_name: item.title || 'Event Media',
          created_at: item.created_at,
          download_url: item.original_download_path || item.download_url || item.image_url,
          resolutions: {
            hd: item.image_url,
            thumb: item.thumb_url || item.image_url,
          },
        }));
      }

      if (!festivalInfo?.id) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select(`
          *,
          item:items(item_name_en, item_name_ml, item_type),
          result:results(public_result_no, public_visible)
        `)
        .eq('festival_id', festivalInfo.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const grouped = (data as any[]).reduce((acc, curr, idx) => {
        if (curr.is_current === false) return acc;
        if (curr.visibility_status && curr.visibility_status !== 'published') return acc;
        if (curr.result && curr.result.public_visible === false) return acc;
        const key = curr.render_hash || `_ungrouped_${idx}`;
        if (!acc[key]) {
          acc[key] = {
            id: curr.id,
            render_hash: key,
            event_name: curr.event_name || curr.item?.item_name_en || curr.item?.item_name_ml || 'Event Media',
            created_at: curr.created_at,
            resolutions: {}
          };
        }
        acc[key].resolutions[curr.resolution] = curr.public_url;
        return acc;
      }, {} as Record<string, any>);
      
      const resultAssets = Object.values(grouped) as any[];
      
      for (const asset of resultAssets) {
        for (const res of Object.keys(asset.resolutions)) {
          let url = asset.resolutions[res];
          if (url && url.startsWith('r2://')) {
            const objectKey = url.replace('r2://', '');
            try {
              const now = Date.now();
              const storageKey = `presigned_${objectKey}`;
              let cachedUrl = signedUrlCache.get(objectKey)?.url;
              
              if (!cachedUrl) {
                const persisted = await AsyncStorage.getItem(storageKey);
                if (persisted) {
                   const parsed = JSON.parse(persisted);
                   if (parsed.expires > now) {
                     cachedUrl = parsed.url;
                   }
                }
              }

              if (cachedUrl) {
                asset.resolutions[res] = cachedUrl;
              } else {
                const signedUrl = await storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download');
                asset.resolutions[res] = signedUrl;
                const expires = now + 55 * 60 * 1000;
                signedUrlCache.set(objectKey, { url: signedUrl, expires });
                AsyncStorage.setItem(storageKey, JSON.stringify({ url: signedUrl, expires })).catch(console.error);
              }
            } catch (e) {
              console.error('Failed to presign URL', e);
            }
          }
        }
      }
      return resultAssets;
    },
    enabled: (Platform.OS === 'web' || !!festivalInfo?.id) && !publicFeaturesLoading && publicFeatures.modules.public_page && publicFeatures.sections.public_page.media,
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isFullscreen && posters.length > 0) {
      interval = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % posters.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isFullscreen, posters.length]);

  if (publicFeaturesLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220' }}><ActivityIndicator size="large" color="#FFFFFF" /></View>;
  if (!publicFeatures.modules.public_page || !publicFeatures.sections.public_page.media) {
    return <PublicUnavailableScreen title="Public media unavailable." message="The festival administrator has disabled the public media section." />;
  }

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
    <SahithyolsavLandingPage page="media">
      <div className="w-full px-4 pb-24 relative z-10 pt-8">
        <div className="max-w-[1200px] mx-auto">
          
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white/5 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 font-['Handjet'] tracking-widest uppercase">Media Center</h1>
              <p className="text-white/60 text-sm">Download and share official festival photos and event media</p>
            </div>
            
            <button 
              onClick={() => setIsFullscreen(true)}
              className="bg-[#1C5FA8] hover:bg-[#154a85] text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-colors shadow-lg"
            >
              <Play size={20} color="white" fill="white" />
              Start Presentation
            </button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
               <ActivityIndicator size="large" color="#c69a53" />
               <p className="text-white/60 font-['Handjet'] text-xl tracking-widest">Loading Posters...</p>
            </div>
          ) : posters.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
               <span className="material-symbols-outlined text-6xl text-white/20 mb-4">image_not_supported</span>
               <h3 className="text-xl text-white/60">No posters generated yet</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {posters.map((poster, idx) => {
                const thumbUrl = poster.resolutions.thumb || poster.resolutions.hd || poster.resolutions.standard || poster.resolutions.share || (Object.values(poster.resolutions)[0] as string);
                const fullUrl = poster.download_url || poster.resolutions.hd || poster.resolutions.standard || thumbUrl;
                return (
                  <div key={idx} className="bg-[#121212]/70 backdrop-blur-md border border-[#333] rounded-[2rem] overflow-hidden shadow-xl group hover:border-[#555] transition-colors flex flex-col">
                    <div className="aspect-square w-full relative bg-black/50">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={poster.event_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <h4 className="text-white font-bold line-clamp-2 leading-tight">{poster.event_name}</h4>
                      <button 
                        onClick={() => handleDownload(fullUrl, `${poster.event_name}_media.webp`)}
                        className="w-full bg-white/10 hover:bg-white/20 text-white py-2 rounded-xl flex items-center justify-center gap-2 transition-colors border border-white/5"
                      >
                        <Download size={16} color="white" />
                        <span className="font-bold text-sm">Download</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </SahithyolsavLandingPage>

      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <div className="absolute top-6 right-6 z-[110] flex gap-4">
            <button 
              onClick={() => setIsFullscreen(false)}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 transition-colors"
            >
              <X size={24} color="white" />
            </button>
          </div>
          
          <div className="w-full h-full flex items-center justify-center p-8">
             {posters.length > 0 && (() => {
               const activePoster = posters[activeSlide];
               const imgUrl = activePoster.resolutions.hd || activePoster.resolutions.standard || activePoster.resolutions.share || Object.values(activePoster.resolutions)[0] as string;
               return (
                 <div className="relative w-full h-full flex items-center justify-center animate-fade-in">
                   <img 
                     key={activeSlide} 
                     src={imgUrl} 
                     alt={activePoster.event_name} 
                     className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-2xl" 
                   />
                   <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10">
                     <p className="text-white font-bold text-xl tracking-wide">{activePoster.event_name}</p>
                   </div>
                 </div>
               );
             })()}
          </div>
        </div>
      )}
      </>
  );
}




