import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#FFFFFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Consolium" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="48x48" href="/brand/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon-180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/brand/apple-touch-icon-167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/brand/apple-touch-icon-152.png" />
        <title>Consolium</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          #portal-bootstrap-loader{display:none}
          html[data-private-loading] body{background:#FFFEF9!important}
          html[data-private-loading] #portal-bootstrap-loader{display:flex;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;background:#FFFEF9}
          .bootstrap-logo{position:relative;width:134px;height:133px}
          .bootstrap-logo img{position:absolute;animation:portal-wave 2s linear infinite;opacity:0}
          @keyframes portal-wave{0%{opacity:0;transform:translateY(9px)}11%,75%{opacity:1;transform:translateY(0)}97%,100%{opacity:0;transform:translateY(0)}}
          @media(prefers-reduced-motion:reduce){.bootstrap-logo img{animation:none;opacity:1}}
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){var p=location.pathname;if(p==='/'||/^\\/(leaderboard|participant-result|unavailable)(\\/|$)/.test(p))return;
          document.documentElement.setAttribute('data-private-loading','');
          var observer=new MutationObserver(function(){var root=document.getElementById('root');if(root&&root.childElementCount){document.documentElement.removeAttribute('data-private-loading');observer.disconnect();}});
          observer.observe(document.documentElement,{childList:true,subtree:true});})();
        ` }} />
      </head>
      <body style={{ backgroundColor: '#011635' }}>
        <div id="portal-bootstrap-loader" role="status" aria-label="Loading">
          <div className="bootstrap-logo">{[
            [0,7.669173,34.776119,92.330827], [18.059701,0.150376,31.641791,99.849624],
            [34.776119,0,37.462687,99.849624], [51.343284,5.714286,40.746269,94.135338], [66.119403,24.210526,33.880597,75.789474],
          ].map(([left,top,width,height], index) => <img key={index} alt="" src={`/ayatic-loader/wave-${index+1}.webp`} style={{left:`${left}%`,top:`${top}%`,width:`${width}%`,height:`${height}%`,animationDelay:`${index*220}ms`}} />)}</div>
        </div>
        {children}
      </body>
    </html>
  );
}
