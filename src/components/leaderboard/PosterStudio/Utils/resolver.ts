import { TemplateVariables } from '../Stores/templateStore';
import { LayerData } from '../Stores/layerStore';

/**
 * Resolves template variable placeholders (e.g. {first_place}) in a text string
 * using the provided variables dictionary.
 */
export function resolveTemplateVariables(text: string | undefined, variables: TemplateVariables): string {
  if (!text) return '';
  if (!variables) return text;
  return text.replace(/\{([^}]+)\}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{${key}}`;
  });
}

/**
 * Per-layer resolver that respects the manualOverride flag.
 * If a user has manually edited a layer's text, variable injection is skipped
 * so manual edits are never overwritten by dynamic data re-injection.
 */
export function resolveLayerText(layer: LayerData, variables: TemplateVariables): string {
  // Manual override wins — never re-inject variables into a manually edited layer
  if (layer.manualOverride === true) {
    return layer.text ?? '';
  }
  // No dynamic binding set — return literal text as-is
  if (!layer.dynamicBinding && !layer.text?.includes('{')) {
    return layer.text ?? '';
  }
  return resolveTemplateVariables(layer.text, variables);
}
