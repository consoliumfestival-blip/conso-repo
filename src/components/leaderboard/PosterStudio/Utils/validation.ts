import { LayerData } from '../Stores/layerStore';
import { TemplateData, TemplateVariables } from '../Stores/templateStore';
import { measureText, isFontLoaded } from './fontLoader';
import { resolveTemplateVariables } from './resolver';

export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning';
  layerId?: string;
  message: string;
}

export function validateTemplateHealth(
  template: TemplateData,
  layers: LayerData[],
  variables: TemplateVariables
): ValidationIssue[] {
  const safeVariables = variables || {};
  const issues: ValidationIssue[] = [];

  // 1. Empty required fields (template name)
  if (!template.name || template.name.trim() === '') {
    issues.push({ id: 'no_name', type: 'error', message: 'Template name is required.' });
  }

  // 2. Missing background
  if (!template.background_url) {
    issues.push({ id: 'no_bg', type: 'warning', message: 'No background image is set.' });
  }

  layers.forEach((layer) => {
    // 3. Offscreen layers
    if (layer.x > template.width || layer.y > template.height || layer.x + layer.width < 0 || layer.y + layer.height < 0) {
      issues.push({ id: `offscreen_${layer.id}`, type: 'warning', layerId: layer.id, message: `Layer "${layer.name}" is completely outside the canvas boundaries.` });
    }

      if (layer.type === 'text' && layer.text) {
      // 4. Unresolved variables
      const unresolvedMatches = layer.text.match(/\{([^}]+)\}/g);
      if (unresolvedMatches) {
        unresolvedMatches.forEach((match) => {
          const key = match.slice(1, -1);
          if (!safeVariables[key]) {
            issues.push({ id: `unresolved_${layer.id}_${key}`, type: 'warning', layerId: layer.id, message: `Variable ${match} in "${layer.name}" is unresolved.` });
          }
        });
      }

      // 5. Missing Fonts
      if (layer.fontFamily && layer.fontFamily !== 'Inter' && !isFontLoaded(layer.fontFamily)) {
        issues.push({ id: `missing_font_${layer.id}`, type: 'warning', layerId: layer.id, message: `Font "${layer.fontFamily}" used in "${layer.name}" is not fully loaded.` });
      }

      // 6. Overflow text check
      if (layer.width && layer.overflowMode === 'clip') {
        const resolvedText = resolveTemplateVariables(layer.text, safeVariables);
        const metrics = measureText(resolvedText, layer.fontFamily || 'Inter', layer.fontSize || 24, layer.fontWeight || 400);
        if (metrics.width > layer.width) {
          issues.push({ id: `overflow_${layer.id}`, type: 'error', layerId: layer.id, message: `Text in "${layer.name}" exceeds layer width and will be clipped.` });
        }
      }
    }
  });

  return issues;
}
