import React, { useRef, useEffect, useState } from 'react';

export function BentoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let fadeInterval: any;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        // Prepare to play
        video.volume = 0;
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Successfully autoplayed unmuted
              setIsMuted(false);
              video.muted = false;
              // Fade in volume
              clearInterval(fadeInterval);
              fadeInterval = setInterval(() => {
                if (video.volume < 0.95) {
                  video.volume += 0.05;
                } else {
                  video.volume = 1;
                  clearInterval(fadeInterval);
                }
              }, 100);
            })
            .catch((e: any) => {
              console.log("Autoplay prevented, falling back to muted:", e);
              // Fallback to muted autoplay
              video.muted = true;
              video.play().catch(err => console.log("Muted autoplay also failed:", err));
              setIsMuted(true);
            });
        }
      } else {
        // Pause when out of view
        video.pause();
        clearInterval(fadeInterval);
      }
    }, { threshold: 0.5 }); // Trigger when 50% visible

    observer.observe(video);
    return () => {
      observer.disconnect();
      clearInterval(fadeInterval);
    };
  }, []);

  const handleUnmute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = false;
    video.volume = 0;
    setIsMuted(false);
    
    // Fade in
    let fadeInterval = setInterval(() => {
      if (video.volume < 0.95) {
        video.volume += 0.05;
      } else {
        video.volume = 1;
        clearInterval(fadeInterval);
      }
    }, 100);
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      <video
        ref={videoRef}
        src="/videos/bento-video.mp4"
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        loop
        playsInline
        crossOrigin="anonymous"
      />
      {/* Remove any dark overlay if there was one naturally in the video? No, it's just the video content. */}
      {isMuted && (
        <button 
          onClick={(e) => { e.stopPropagation(); handleUnmute(); }}
          className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md border border-white/20 p-3 rounded-full text-white shadow-xl hover:bg-black/80 transition-colors z-20 flex items-center gap-2 group"
        >
          <span className="material-symbols-outlined" style={{fontSize: "20px"}}>volume_off</span>
          <span className="text-xs font-bold tracking-widest hidden group-hover:block px-1">UNMUTE</span>
        </button>
      )}
    </div>
  );
}
