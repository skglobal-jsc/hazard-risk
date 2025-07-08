// Risk level có thể là bất kỳ số nào
export type RiskLevel = number;

// Cấu hình cho một level rủi ro
export interface RiskLevelConfig {
  name: string;
  color: string; // Format: "r,g,b" hoặc "#rrggbb"
  description: string;
}

// Cấu hình cho một loại hazard
export interface HazardConfig {
  name: string;
  levels: {
    [level: number]: RiskLevelConfig;
  };
  waterColors?: string[]; // Array các màu nước đã xác định sẵn (format: "#rrggbb")
}

// Thống kê kết quả rủi ro
export interface RiskStat {
  level: RiskLevel | 'water';
  count: number;
  ratio: number; // phần trăm
}

// Một điểm trong lưới
export interface GridPoint {
  lat: number;
  lon: number;
  tile: TileCoord;
  pixel: PixelCoord;
  riskLevel?: RiskLevel;
  isWater: boolean;
}

// Tùy chọn phân tích (đơn giản hóa)
export interface AnalyzeRiskOptions {
  polygon: GeoJSONPolygon;
  hazardTileUrl: string; // URL template cho hazard tile
  baseTileUrl: string;   // URL template cho base tile
  gridSize: number; // mét
  zoom: number;
  hazardConfig?: HazardConfig; // Cấu hình hazard
}

// Kết quả phân tích
export interface AnalyzeRiskResult {
  grid: GridPoint[];
  stats: RiskStat[];
  total: number;
  hazardConfig?: HazardConfig; // Thêm config vào kết quả
}

// Polygon dạng GeoJSON
export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

// Tọa độ tile XYZ
export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

// Tọa độ pixel trong tile
export interface PixelCoord {
  x: number;
  y: number;
}

export interface TileProvider {
  getTileUrl: (x: number, y: number, z: number) => string;
}

export interface AnalysisResult {
  grid: GridPoint[];
  stats: RiskStat[];
  totalPoints: number;
  waterPoints: number;
  riskPoints: number;
}
