// Role-specific utility fallbacks keep shared components unchanged outside Core.
const colors = require('tailwindcss/colors');
const tokens = require('../src/constants/coreThemeTokens.json');
const roles = Object.keys(tokens.legacy);
const kebab = (name) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const rgb = (hex) => hex.replace('#', '').match(/../g).map(part => parseInt(part, 16)).join(' ');
const variable = (role, fallback) => `rgb(var(--core-${kebab(role)}-rgb, ${rgb(fallback)}) / <alpha-value>)`;
const utilityColors = {};
for (const role of roles) {
  const variants = { white: variable(role, '#ffffff'), black: variable(role, '#000000') };
  variants.hex = Object.fromEntries(require('./core-theme-hex.json').map(hex => [hex, variable(role, `#${hex}`)]));
  for (const family of ['slate','gray','zinc','neutral','stone','red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose']) {
    variants[family] = Object.fromEntries(Object.entries(colors[family]).map(([shade, hex]) => [shade, variable(role, hex)]));
  }
  utilityColors[kebab(role)] = variants;
}
const semantic = Object.fromEntries(Object.entries(tokens.legacy).map(([role, hex]) => [role, variable(role, hex)]));
module.exports = { utilityColors, semantic, scoped: variable };
