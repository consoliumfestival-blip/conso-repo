import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SahithyolsavLandingPage } from '../../../components/publicLanding/SahithyolsavLandingPage.web';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../core/config/supabase';
import { storageService } from '../../../services/storage/storageService';
import { Download, Play, X, Maximize2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const signedUrlCache = new Map<string, { url: string, expires: number }>();

export default function PublicMediaCenter() {
  const params = useLocalSearchParams();
  const tenantId = params.tenant_id as string;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const { data: festivalInfo } = useQuery({
    queryKey: ['public-tenant-festival', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('festival_calendar')
        .select('id, custom_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!tenantId
  });

  const { data: posters = [], isLoading } = useQuery({
    queryKey: ['public-generated-posters', festivalInfo?.id],
    queryFn: async () => {
      if (!festivalInfo?.id) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select(`
          *,
          item:items(item_name_en, item_name_ml, item_type),
          result:results(public_result_no)
        `)
        .eq('festival_id', festivalInfo.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const grouped = (data as any[]).reduce((acc, curr, idx) => {
        const key = curr.render_hash || `_ungrouped_${idx}`;
        if (!acc[key]) {
          acc[key] = {
            id: curr.id,
            render_hash: key,
            event_name: curr.event_name || curr.item?.item_name_en || curr.item?.item_name_ml || 'Result Poster',
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
    enabled: !!festivalInfo?.id,
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
              <p className="text-white/60 text-sm">Download and share competition result posters</p>
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
                const imgUrl = poster.resolutions['1080x1080'] || Object.values(poster.resolutions)[0] as string;
                return (
                  <div key={idx} className="bg-[#121212]/70 backdrop-blur-md border border-[#333] rounded-[2rem] overflow-hidden shadow-xl group hover:border-[#555] transition-colors flex flex-col">
                    <div className="aspect-square w-full relative bg-black/50">
                      {imgUrl ? (
                        <img src={imgUrl} alt={poster.event_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <h4 className="text-white font-bold line-clamp-2 leading-tight">{poster.event_name}</h4>
                      <button 
                        onClick={() => handleDownload(imgUrl, `${poster.event_name}_poster.jpg`)}
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
               const imgUrl = activePoster.resolutions['1080x1080'] || Object.values(activePoster.resolutions)[0] as string;
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




