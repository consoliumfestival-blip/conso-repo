import React from 'react';

export function CometSpinner({ className = "size-12" }: { className?: string }) {
  return (
    <div className={`relative animate-spin rounded-full ${className}`}>
      {/* Dimmed trail */}
      <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-[#009499]/30"></div>
      {/* Bright comet head */}
      <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-[#c69a53]"></div>
    </div>
  );
}
