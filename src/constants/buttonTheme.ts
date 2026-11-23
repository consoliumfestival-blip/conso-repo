/** Action colours are separate from navigation, charts and lifecycle colours. */
export const legacyButtonColors = {
  buttonPrimary: '#0F766E', buttonHover: '#0B5D56', buttonForeground: '#FFFFFF',
  buttonSoft: '#E7F6F3', buttonBorder: '#E2E8F0', buttonText: '#0F766E',
};

export function resolveButtonColors(colors: { primary: string; primaryHover: string; primarySoft: string; onPrimary: string; primaryText?: string }, reference = false) {
  return reference ? {
    buttonPrimary: '#4ADE80', buttonHover: '#22C55E', buttonForeground: '#14532D',
    buttonSoft: '#DCFCE7', buttonBorder: '#86EFAC', buttonText: '#14532D',
  } : {
    buttonPrimary: colors.primary, buttonHover: colors.primaryHover, buttonForeground: colors.onPrimary,
    buttonSoft: colors.primarySoft, buttonBorder: colors.primary, buttonText: colors.primaryText ?? colors.primary,
  };
}

export function buttonVariables(colors: typeof legacyButtonColors) {
  return Object.fromEntries(Object.entries(colors).flatMap(([key, value]) => {
    const name = `--core-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    return [[name, value], [`${name}-rgb`, value.slice(1).match(/../g)!.map(part => parseInt(part, 16)).join(' ')]];
  }));
}
