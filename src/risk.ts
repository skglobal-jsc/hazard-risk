import type { RiskLevel, RiskStat, GridPoint, HazardConfig, RiskLevelConfig } from './types';

// Hazard config mặc định cho tsunami (GSI Japan)
const DEFAULT_TSUNAMI_CONFIG: HazardConfig = {
  name: 'Tsunami',
  levels: {
    0: {
      name: 'level0',
      color: '0,0,0',
      description: 'Không rủi ro'
    },
    1: {
      name: 'level1',
      color: '255,255,0',
      description: 'Chú ý'
    },
    2: {
      name: 'level2',
      color: '255,165,0',
      description: 'Cảnh báo'
    },
    3: {
      name: 'level3',
      color: '255,0,0',
      description: 'Rất nguy hiểm'
    }
  },
  // Array các màu nước đã xác định sẵn
  waterColors: ['#bed2ff', '#a8c8ff', '#8bb8ff', '#6aa8ff']
};

// Chuyển đổi RGB sang hex format
function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Chuyển đổi hex sang RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}

// Chuyển đổi RGB string sang RGB object
function parseRgbString(rgbString: string): { r: number; g: number; b: number } {
  const parts = rgbString.split(',').map(s => parseInt(s.trim()));
  if (parts.length !== 3) {
    throw new Error(`Invalid RGB string: ${rgbString}`);
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

// Chuẩn hóa color về RGB object
function normalizeColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) {
    return hexToRgb(color);
  } else {
    return parseRgbString(color);
  }
}

// Tạo color mapping từ levels config
function createColorMapping(hazardConfig: HazardConfig): { [key: string]: RiskLevel } {
  const colorMapping: { [key: string]: RiskLevel } = {};

  for (const [level, config] of Object.entries(hazardConfig.levels)) {
    // Chuẩn hóa color về RGB string để so sánh
    const rgb = normalizeColor(config.color);
    const rgbString = `${rgb.r},${rgb.g},${rgb.b}`;
    colorMapping[rgbString] = parseInt(level);
  }

  return colorMapping;
}

// Phân loại rủi ro từ màu RGB với hazard config
export function classifyRiskFromRGB(
  r: number,
  g: number,
  b: number,
  hazardConfig: HazardConfig = DEFAULT_TSUNAMI_CONFIG
): RiskLevel {
  const colorKey = `${r},${g},${b}`;
  const colorMapping = createColorMapping(hazardConfig);

  // Kiểm tra trong color mapping
  if (colorMapping[colorKey] !== undefined) {
    return colorMapping[colorKey];
  }

  // Mặc định level 0 (không rủi ro)
  return 0;
}

// Kiểm tra màu nước với array màu nước đã xác định sẵn
export function isWaterColor(
  r: number,
  g: number,
  b: number,
  hazardConfig: HazardConfig = DEFAULT_TSUNAMI_CONFIG
): boolean {
  const waterColors = hazardConfig.waterColors || ['#bed2ff'];
  const hexColor = rgbToHex(r, g, b);

  // Kiểm tra xem màu có trong danh sách màu nước không
  return waterColors.includes(hexColor);
}

// Tính thống kê kết quả với dynamic levels
export function calculateRiskStats(grid: GridPoint[], hazardConfig?: HazardConfig): RiskStat[] {
  const stats: { [key: string]: number } = {
    'water': 0
  };

  let total = 0;

  // Đếm số điểm theo từng level
  for (const point of grid) {
    if (point.isWater) {
      stats.water++;
    } else if (point.riskLevel !== undefined) {
      const levelKey = point.riskLevel.toString();
      stats[levelKey] = (stats[levelKey] || 0) + 1;
    }
    total++;
  }

  // Chuyển thành array RiskStat
  const result: RiskStat[] = [];
  for (const [level, count] of Object.entries(stats)) {
    if (count > 0) {
      result.push({
        level: level === 'water' ? 'water' : parseInt(level),
        count,
        ratio: total > 0 ? (count / total) * 100 : 0
      });
    }
  }

  // Sắp xếp theo level (water ở cuối)
  result.sort((a, b) => {
    if (a.level === 'water') return 1;
    if (b.level === 'water') return -1;
    return (a.level as number) - (b.level as number);
  });

  return result;
}

// Tạo hazard config cho các loại hazard khác nhau
export function createHazardConfig(
  name: string,
  levels: { [level: number]: RiskLevelConfig },
  waterColors?: string[]
): HazardConfig {
  return {
    name,
    levels,
    waterColors
  };
}

// Export configs mặc định
export { DEFAULT_TSUNAMI_CONFIG };
