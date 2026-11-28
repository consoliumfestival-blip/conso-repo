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
        <script src="/festival-curtain.js?v=20261128i" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          #portal-bootstrap-loader{display:none}
          html[data-public-candidate],html[data-public-candidate] body{background:#FAFBFD!important}
          html[data-private-loading] body{background:#FFFEF9!important}
          html[data-private-loading] #portal-bootstrap-loader{display:flex;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;background:#FFFEF9}
          .bootstrap-logo{position:relative;width:134px;height:133px}
          .bootstrap-logo img{position:absolute;animation:portal-wave 2s linear infinite;opacity:0}
          @keyframes portal-wave{0%{opacity:0;transform:translateY(9px)}11%,75%{opacity:1;transform:translateY(0)}97%,100%{opacity:0;transform:translateY(0)}}
          @media(prefers-reduced-motion:reduce){.bootstrap-logo img{animation:none;opacity:1}}
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){var p=location.pathname;if(/^\\/candidate\\/.+/.test(p)){document.documentElement.setAttribute('data-public-candidate','');var s=decodeURIComponent(p.split('/')[2]||'');var q=new URLSearchParams(location.search);var m='/portal-manifest?portal=candidate&identity='+encodeURIComponent(s);if(q.get('tenant_id'))m+='&tenant_id='+encodeURIComponent(q.get('tenant_id'));if(q.get('festival_id'))m+='&festival_id='+encodeURIComponent(q.get('festival_id'));var l=document.createElement('link');l.id='candidate-portal-manifest';l.rel='manifest';l.href=m;document.head.appendChild(l);window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__candidatePortalInstallEvent=e;window.dispatchEvent(new Event('candidateportalinstallavailable'));});if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/candidate/'}).catch(function(){});},{once:true});}return;}if(/^\\/candidate-search(\\/|$)/.test(p)){document.documentElement.setAttribute('data-public-candidate','');return;}if(p==='/'||/^\\/(leaderboard|participant-result|unavailable)(\\/|$)/.test(p))return;
          document.documentElement.setAttribute('data-private-loading','');
        })();
        ` }} />
      </head>
      <body style={{ backgroundColor: '#FFFEF9' }}>
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
