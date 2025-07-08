import { createGrid } from './grid';
import { classifyRiskFromRGB, calculateRiskStats, isWaterColor, DEFAULT_TSUNAMI_CONFIG } from './risk';
import { NodeRasterReader, BrowserRasterReader, createTileProvider } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, AnalyzeRiskResult, GridPoint } from './types';
import { PNG } from 'pngjs';

// Hàm chính phân tích rủi ro trong polygon
export async function analyzeRiskInPolygon(
  options: AnalyzeRiskOptions,
  cache?: TileCache
): Promise<AnalyzeRiskResult> {
  const {
    polygon,
    hazardTileUrl,
    baseTileUrl,
    gridSize,
    zoom,
    hazardConfig = DEFAULT_TSUNAMI_CONFIG
  } = options;

  // Tạo tile providers từ URL templates
  const hazardTileProvider = createTileProvider(hazardTileUrl, cache);
  const baseTileProvider = createTileProvider(baseTileUrl, cache);

  // Bước 1: Tạo lưới điểm trong polygon
  const grid = createGrid(polygon, gridSize, zoom);

  // Bước 2: Gom các tile cần preload
  const tileCoords = [...new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`))]
    .map(key => {
      const [z, x, y] = key.split('/').map(Number);
      return { z, x, y };
    });
  // Preload toàn bộ tile song song (không batch)
  await Promise.all([
    ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y)),
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y))
  ]);

  // Bước 3: Gom các điểm theo tile để decode tile 1 lần
  await processGridPixelsOptimized(grid, hazardTileProvider, baseTileProvider, hazardConfig);

  // Bước 4: Tính thống kê
  const stats = calculateRiskStats(grid, hazardConfig);

  return {
    stats,
    total: grid.length,
    grid,
    hazardConfig
  };
}

// Tối ưu: gom điểm theo tile, decode tile 1 lần
async function processGridPixelsOptimized(
  grid: GridPoint[],
  hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
  baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
  hazardConfig = DEFAULT_TSUNAMI_CONFIG
) {
  // Gom điểm theo tile
  const tilePointMap = new Map<string, GridPoint[]>();
  for (const point of grid) {
    const key = `${point.tile.z}/${point.tile.x}/${point.tile.y}`;
    if (!tilePointMap.has(key)) tilePointMap.set(key, []);
    tilePointMap.get(key)!.push(point);
  }

  // Xử lý hazard tile
  await Promise.all(Array.from(tilePointMap.entries()).map(async ([key, points]) => {
    const { z, x, y } = points[0].tile;
    let hazardPng: PNG | null = null;
    let basePng: PNG | null = null;
    try {
      const hazardBuffer = await hazardTileProvider(z, x, y);
      hazardPng = PNG.sync.read(hazardBuffer);
    } catch (e) {
      // Nếu tile không tồn tại, hazardPng = null
    }
    try {
      const baseBuffer = await baseTileProvider(z, x, y);
      basePng = PNG.sync.read(baseBuffer);
    } catch (e) {
      // Nếu tile không tồn tại, basePng = null
    }
    for (const point of points) {
      // Hazard pixel
      let r = 0, g = 0, b = 0;
      if (hazardPng) {
        const { width, height, data } = hazardPng;
        const { x: px, y: py } = point.pixel;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          r = data[idx] || 0;
          g = data[idx + 1] || 0;
          b = data[idx + 2] || 0;
        }
      }
      point.riskLevel = classifyRiskFromRGB(r, g, b, hazardConfig);
      // Base pixel (nước)
      let br = 0, bg = 0, bb = 0;
      if (basePng) {
        const { width, height, data } = basePng;
        const { x: px, y: py } = point.pixel;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          br = data[idx] || 0;
          bg = data[idx + 1] || 0;
          bb = data[idx + 2] || 0;
        }
      }
      point.isWater = isWaterColor(br, bg, bb, hazardConfig);
    }
  }));
}

// Export các type và function cần thiết
export type {
  RiskLevel,
  RiskStat,
  GridPoint,
  AnalyzeRiskOptions,
  AnalyzeRiskResult,
  GeoJSONPolygon,
  HazardConfig,
  RiskLevelConfig
} from './types';

export { NodeRasterReader, BrowserRasterReader, createTileProvider } from './raster';
export { TileCache } from './cache';
export { DEFAULT_TSUNAMI_CONFIG, createHazardConfig } from './risk';
