// Risk level (0: none, 1: low, 2: medium, 3: high)
export type RiskLevel = 0 | 1 | 2 | 3;

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
  isWater?: boolean;
}

// Tùy chọn phân tích (đơn giản hóa)
export interface AnalyzeRiskOptions {
  polygon: GeoJSONPolygon;
  hazardTileUrl: string; // URL template cho hazard tile
  baseTileUrl: string;   // URL template cho base tile
  gridSize: number; // mét
  zoom: number;
}

// Kết quả phân tích
export interface AnalyzeRiskResult {
  stats: RiskStat[];
  total: number;
  grid: GridPoint[];
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
