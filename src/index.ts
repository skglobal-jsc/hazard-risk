import { createGrid } from './grid';
import { classifyRiskFromRGB, calculateRiskStats, isWaterColor, DEFAULT_TSUNAMI_CONFIG } from './risk';
import { NodeRasterReader, BrowserRasterReader, createTileProvider } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, AnalyzeRiskResult, GridPoint } from './types';

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

  // Bước 2: Preload tiles vào cache (nếu có cache)
  if (cache) {
    const tileCoords = [...new Set(grid.map(point => point.tile))];
    await cache.preloadTiles([hazardTileUrl, baseTileUrl], zoom, tileCoords);
  }

  // Bước 3: Đọc pixel từ hazard tile và base tile
  await processGridPixels(grid, hazardTileProvider, baseTileProvider, cache, hazardConfig);

  // Bước 4: Tính thống kê
  const stats = calculateRiskStats(grid, hazardConfig);

  return {
    stats,
    total: grid.length,
    grid,
    hazardConfig
  };
}

// Xử lý đọc pixel cho từng điểm trong grid
async function processGridPixels(
  grid: GridPoint[],
  hazardTileProvider: (z: number, x: number, y: number) => Promise<any>,
  baseTileProvider: (z: number, x: number, y: number) => Promise<any>,
  cache?: TileCache,
  hazardConfig = DEFAULT_TSUNAMI_CONFIG
) {
  // Lấy màu level 0 từ config
  const level0Color = hazardConfig.levels[0].color;

  // Tạo raster reader (tự động detect Node.js hay browser)
  const isNode = typeof window === 'undefined';
  const hazardReader = isNode
    ? new NodeRasterReader(hazardTileProvider, level0Color)
    : new BrowserRasterReader(hazardTileProvider, level0Color);
  const baseReader = isNode
    ? new NodeRasterReader(baseTileProvider, level0Color)
    : new BrowserRasterReader(baseTileProvider, level0Color);

  console.log(`🔍 Processing ${grid.length} grid points...`);

  // Xử lý từng điểm
  for (const point of grid) {
    try {
      // Đọc pixel từ hazard tile
      const hazardRGB = await hazardReader.getPixelRGB(point.tile, point.pixel);
      point.riskLevel = classifyRiskFromRGB(hazardRGB.r, hazardRGB.g, hazardRGB.b, hazardConfig);

      // Đọc pixel từ base tile để kiểm tra nước
      const baseRGB = await baseReader.getPixelRGB(point.tile, point.pixel);
      point.isWater = isWaterColor(baseRGB.r, baseRGB.g, baseRGB.b, hazardConfig);
    } catch (error: any) {
      // Phân biệt các loại lỗi
      if (error.message?.includes('TILE_NOT_FOUND')) {
        // Tile không tồn tại = không có dữ liệu rủi ro
        console.warn(`No hazard data for point at ${point.lat}, ${point.lon} - Treating as no risk`);
        point.riskLevel = 0; // Không rủi ro
        point.isWater = false;
      } else {
        // Lỗi khác (network, parsing, etc.)
        console.warn(`Error processing point at ${point.lat}, ${point.lon}:`, error);
        point.riskLevel = 0; // Mặc định không rủi ro
        point.isWater = false;
      }
    }
  }

  console.log(`✅ Processing completed. Cache stats:`, cache?.getStats());
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
