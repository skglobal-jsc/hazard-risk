import type { RiskLevel, RiskStat, GridPoint } from './types';

// Phân loại rủi ro từ màu RGB
export function classifyRiskFromRGB(r: number, g: number, b: number): RiskLevel {
  // Dựa trên bảng màu trong báo cáo
  if (r === 255 && g === 0 && b === 0) return 3; // Đỏ - Rất nguy hiểm
  if (r === 255 && g === 165 && b === 0) return 2; // Cam - Cảnh báo
  if (r === 255 && g === 255 && b === 0) return 1; // Vàng - Chú ý
  if (r === 0 && g === 0 && b === 0) return 0; // Đen - Không rủi ro

  // Mặc định không rủi ro
  return 0;
}

// Tính thống kê kết quả
export function calculateRiskStats(grid: GridPoint[]): RiskStat[] {
  const stats: { [key: string]: number } = {
    '0': 0,
    '1': 0,
    '2': 0,
    '3': 0,
    'water': 0
  };

  let total = 0;

  // Đếm số điểm theo từng level
  for (const point of grid) {
    if (point.isWater) {
      stats.water++;
    } else if (point.riskLevel !== undefined) {
      stats[point.riskLevel.toString()]++;
    }
    total++;
  }

  // Chuyển thành array RiskStat
  const result: RiskStat[] = [];
  for (const [level, count] of Object.entries(stats)) {
    if (count > 0) {
      result.push({
        level: level === 'water' ? 'water' : parseInt(level) as RiskLevel,
        count,
        ratio: total > 0 ? (count / total) * 100 : 0
      });
    }
  }

  return result;
}
