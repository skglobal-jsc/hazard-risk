// Risk level can be any number
export type RiskLevel = number;

// Configuration for a risk level
export interface RiskLevelConfig {
  name: string;
  color: string; // Format: "r,g,b" or "#rrggbb"
  description: string;
}

// Configuration for a hazard type
export interface HazardConfig {
  name: string;
  levels: {
    [level: number]: RiskLevelConfig;
  };
  waterColors?: string[]; // Array of predefined water colors (format: "#rrggbb")
}

// Risk analysis result statistics
export interface RiskStat {
  level: RiskLevel | 'water';
  count: number;
  ratio: number; // percentage
}

// A point in the grid
export interface GridPoint {
  lat: number;
  lon: number;
  tile: TileCoord;
  pixel: PixelCoord;
  riskLevel?: RiskLevel;
  isWater: boolean;
}

// Analysis options (simplified)
export interface AnalyzeRiskOptions {
  polygon: GeoJSONPolygon;
  hazardTileUrl: string; // URL template for hazard tile
  baseTileUrl: string;   // URL template for base tile
  gridSize: number; // meters
  zoom: number;
  hazardConfig?: HazardConfig; // Hazard configuration
  currentLocation?: { lat: number; lon: number };
}

// Analysis result
export interface AnalyzeRiskResult {
  grid: GridPoint[];
  stats: RiskStat[];
  total: number;
  hazardConfig?: HazardConfig; // Add config to result
}

// GeoJSON polygon
export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

// XYZ tile coordinates
export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

// Pixel coordinates in tile
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
