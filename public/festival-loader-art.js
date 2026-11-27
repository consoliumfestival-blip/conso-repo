;(function () {
        var NS = 'http://www.w3.org/2000/svg'
        var svg = document.querySelector('#loader .ld-pookalam')
        if (!svg) return
        var C = { p: '#6D28D9', r: '#E11D48', b: '#2563EB', g: '#10B981', y: '#F59E0B', i: '#202124' }
        function el(tag, attrs, parent) {
          var n = document.createElementNS(NS, tag)
          for (var k in attrs) n.setAttribute(k, attrs[k])
          parent.appendChild(n)
          return n
        }
        function ring(cls) { return el('g', { class: 'ld-ring ' + (cls || '') }, svg) }
        // The five racing bands used for the reveal.
        var heads = {
          p: '<circle cx="50" cy="50" r="48" fill="#6D28D9"/><circle cx="50" cy="50" r="28" fill="none" stroke="#fff" stroke-width="8"/><circle cx="50" cy="50" r="12" fill="#fff"/>',
          r: '<rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(60 50 50)"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(120 50 50)"/>',
          b: '<circle cx="50" cy="50" r="48" fill="#2563EB"/><path d="M50 20.24C55.36 44.64 55.36 44.64 79.76 50 55.36 55.36 55.36 55.36 50 79.76 44.64 55.36 44.64 55.36 20.24 50 44.64 44.64 44.64 44.64 50 20.24Z" fill="#fff"/>',
          g: '<circle cx="50" cy="50" r="41.76" fill="#fff" stroke="#10B981" stroke-width="12.48"/><path d="M2 50A48 48 0 0 0 98 50Z" fill="#10B981"/>',
          y: (function () {
            var s = ''
            for (var k = 0; k < 8; k++) {
              var t = (k / 8) * Math.PI * 2
              s += '<circle cx="' + (50 + Math.cos(t) * 31.68) + '" cy="' + (50 + Math.sin(t) * 31.68) + '" r="16.32" fill="#F59E0B"/>'
            }
            return s + '<circle cx="50" cy="50" r="31.68" fill="#F59E0B"/><circle cx="50" cy="50" r="14.4" fill="#fff"/>'
          })(),
        }
        var bands = document.querySelector('#loader .ld-bands')
        ;['p', 'r', 'b', 'g', 'y'].forEach(function (k) {
          var band = document.createElement('div')
          band.className = 'ld-band'
          band.style.setProperty('--c', C[k])
          band.innerHTML = '<div class="ld-head"><svg viewBox="0 0 100 100">' + heads[k] + '</svg></div>'
          bands.appendChild(band)
        })
      })()