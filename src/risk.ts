import type {
  RiskLevel,
  RiskStat,
  GridPoint,
  HazardConfig,
  RiskLevelConfig,
} from './types';

// Default hazard config for tsunami (GSI Japan)
const DEFAULT_TSUNAMI_CONFIG: HazardConfig = {
  name: 'Tsunami',
  levels: {
    0: {
      name: 'level0',
      color: '0,0,0',
      description: 'No risk',
    },
    1: {
      name: 'level1',
      color: '255,255,0',
      description: 'Attention',
    },
    2: {
      name: 'level2',
      color: '255,165,0',
      description: 'Warning',
    },
    3: {
      name: 'level3',
      color: '255,0,0',
      description: 'Very dangerous',
    },
  },
  // Array of predefined water colors
  waterColors: ['#bed2ff', '#a8c8ff', '#8bb8ff', '#6aa8ff'],
};

// Convert RGB to hex format
function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

// Convert RGB string to RGB object
function parseRgbString(rgbString: string): {
  r: number;
  g: number;
  b: number;
} {
  const parts = rgbString.split(',').map(s => parseInt(s.trim()));
  if (parts.length !== 3) {
    throw new Error(`Invalid RGB string: ${rgbString}`);
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

// Normalize color to RGB object
export function normalizeColor(color: string): {
  r: number;
  g: number;
  b: number;
} {
  if (color.startsWith('#')) {
    return hexToRgb(color);
  } else {
    return parseRgbString(color);
  }
}

// Create color mapping from levels config
function createColorMapping(hazardConfig: HazardConfig): {
  [key: string]: RiskLevel;
} {
  const colorMapping: { [key: string]: RiskLevel } = {};

  for (const [level, config] of Object.entries(hazardConfig.levels)) {
    // Normalize color to RGB string for comparison
    const rgb = normalizeColor(config.color);
    const rgbString = `${rgb.r},${rgb.g},${rgb.b}`;
    colorMapping[rgbString] = parseInt(level);
  }

  return colorMapping;
}

// Classify risk from RGB color with hazard config
export function classifyRiskFromRGB(
  r: number,
  g: number,
  b: number,
  hazardConfig: HazardConfig = DEFAULT_TSUNAMI_CONFIG
): RiskLevel {
  const colorKey = `${r},${g},${b}`;
  const colorMapping = createColorMapping(hazardConfig);

  // Check in color mapping
  if (colorMapping[colorKey] !== undefined) {
    return colorMapping[colorKey];
  }

  // Default to level 0 (no risk) for undefined colors
  return 0;
}

// Check water color with predefined water color array
export function isWaterColor(
  r: number,
  g: number,
  b: number,
  hazardConfig: HazardConfig = DEFAULT_TSUNAMI_CONFIG
): boolean {
  const waterColors = hazardConfig.waterColors || ['#bed2ff'];
  const hexColor = rgbToHex(r, g, b);

  // Check if color is in water color list
  return waterColors.includes(hexColor);
}

// Create hazard config for different hazard types
export function createHazardConfig(
  name: string,
  levels: { [level: number]: RiskLevelConfig },
  waterColors?: string[]
): HazardConfig {
  return {
    name,
    levels,
    waterColors,
  };
}

// Export default configs
export { DEFAULT_TSUNAMI_CONFIG };
