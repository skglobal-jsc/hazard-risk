import { createGrid } from './grid';
import { classifyRiskFromRGB, calculateRiskStats, isWaterColor, DEFAULT_TSUNAMI_CONFIG } from './risk';
import { NodeRasterReader, BrowserRasterReader, createTileProvider } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, AnalyzeRiskResult, GridPoint, HazardConfig } from './types';
import { PNG, PNGWithMetadata } from 'pngjs';
import * as turf from '@turf/turf';
import type { Feature, Point } from 'geojson';

// Preload tất cả tile hazard và base song song
async function preloadTiles(tileCoords, hazardTileProvider, baseTileProvider) {
  await Promise.all([
    ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y)),
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y))
  ]);
}

// Gom điểm theo tile
function groupPointsByTile(grid) {
  const tilePointMap = new Map();
  for (const point of grid) {
    const key = `${point.tile.z}/${point.tile.x}/${point.tile.y}`;
    if (!tilePointMap.has(key)) tilePointMap.set(key, []);
    tilePointMap.get(key).push(point);
  }
  return tilePointMap;
}

function getPixelFromPng(png: PNGWithMetadata | undefined, x: number, y: number): [number, number, number] {
  if (!png) return [0, 0, 0];
  const { width, height, data } = png;
  if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0];
  const idx = (y * width + x) * 4;
  return [data[idx] || 0, data[idx + 1] || 0, data[idx + 2] || 0];
}

function getRiskInfoFromTile(
  hazardPng: PNGWithMetadata | undefined,
  basePng: PNGWithMetadata | undefined,
  px: number,
  py: number,
  hazardConfig: HazardConfig | undefined
) {
  const [r, g, b] = getPixelFromPng(hazardPng, px, py);
  const riskLevel = classifyRiskFromRGB(r, g, b, hazardConfig);
  const [br, bg, bb] = getPixelFromPng(basePng, px, py);
  const isWater = isWaterColor(br, bg, bb, hazardConfig);
  return { riskLevel, isWater };
}

// Tính thống kê và optionally nearestPoints
async function calculateStatsAndOptionallyNearestPoints(
  grid: GridPoint[],
  hazardTileProvider: { (z: number, x: number, y: number): Promise<Buffer>; (arg0: any, arg1: any, arg2: any): any; },
  baseTileProvider: { (z: number, x: number, y: number): Promise<Buffer>; (arg0: any, arg1: any, arg2: any): any; },
  hazardConfig: HazardConfig | undefined,
  currentLocation: { lat: number; lon: number; } | undefined // có thể undefined
): Promise<{ stats: { [level: string]: number, total: number }, nearestPoints?: any, waterCount: number, currentLocationRisk?: { riskLevel: number, isWater: boolean } }> {
  const stats: { [level: string]: number, total: number } = { total: 0 };
  let total = 0;
  let waterCount = 0;
  const tilePointMap = groupPointsByTile(grid);
  const hasNearest = !!currentLocation;
  // Gom các điểm hợp lệ theo risk level
  const levelPoints: { [level: string]: Feature<Point>[] } = {};

  // Xác định risk tại currentLocation (nếu có)
  let currentLocationRisk: { riskLevel: number, isWater: boolean } | undefined = undefined;
  if (currentLocation) {
    // Tìm tile và pixel chứa currentLocation
    const samplePoint = grid.find(pt => Math.abs(pt.lat - currentLocation.lat) < 1e-6 && Math.abs(pt.lon - currentLocation.lon) < 1e-6);
    if (samplePoint) {
      const { z, x, y } = samplePoint.tile;
      let hazardPng: PNGWithMetadata | undefined, basePng: PNGWithMetadata | undefined;
      try { hazardPng = PNG.sync.read(await hazardTileProvider(z, x, y)); } catch {}
      try { basePng = PNG.sync.read(await baseTileProvider(z, x, y)); } catch {}
      const { riskLevel, isWater } = getRiskInfoFromTile(hazardPng, basePng, samplePoint.pixel.x, samplePoint.pixel.y, hazardConfig);
      currentLocationRisk = { riskLevel, isWater };
    }
  }

  await Promise.all(Array.from(tilePointMap.entries()).map(async ([key, points]) => {
    const { z, x, y } = points[0].tile;
    let hazardPng: PNGWithMetadata | undefined, basePng: PNGWithMetadata | undefined;
    try { hazardPng = PNG.sync.read(await hazardTileProvider(z, x, y)); } catch {}
    try { basePng = PNG.sync.read(await baseTileProvider(z, x, y)); } catch {}
    for (const point of points) {
      const { riskLevel, isWater } = getRiskInfoFromTile(hazardPng, basePng, point.pixel.x, point.pixel.y, hazardConfig);
      if (isWater) {
        waterCount++;
        continue;
      }
      stats[riskLevel] = (stats[riskLevel] || 0) + 1;
      total++;
      if (hasNearest) {
        if (!levelPoints[riskLevel]) levelPoints[riskLevel] = [];
        levelPoints[riskLevel].push(
          turf.point([point.lon, point.lat], {
            level: riskLevel,
            color: hazardConfig!.levels[riskLevel]?.color,
            latitude: point.lat,
            longitude: point.lon
          })
        );
      }
    }
  }));
  stats.total = total;
  // Tính nearestPoints bằng turf
  let nearestPoints: { [level: string]: any } = {};
  if (hasNearest && currentLocation) {
    const from = turf.point([currentLocation.lon, currentLocation.lat]);
    for (const level in levelPoints) {
      const fc = turf.featureCollection<Point>(levelPoints[level]);
      if (fc.features.length > 0) {
        const nearest = turf.nearestPoint(from, fc, { units: 'meters' });
        nearestPoints[level] = {
          ...nearest.properties,
          distance: nearest.properties?.distanceToPoint // đã là mét
        };
      }
    }
    return { stats, nearestPoints, waterCount, currentLocationRisk };
  } else {
    return { stats, waterCount, currentLocationRisk };
  }
}

// Hàm chính
export async function analyzeRiskInPolygon(options: AnalyzeRiskOptions, cache?: TileCache): Promise<any> {
  const {
    polygon,
    hazardTileUrl,
    baseTileUrl,
    gridSize,
    zoom,
    hazardConfig = DEFAULT_TSUNAMI_CONFIG,
    currentLocation
  } = options;

  const hazardTileProvider = createTileProvider(hazardTileUrl, cache);
  const baseTileProvider = createTileProvider(baseTileUrl, cache);
  const grid = createGrid(polygon, gridSize, zoom);
  const tileCoords = [...new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`))]
    .map(key => { const [z, x, y] = key.split('/').map(Number); return { z, x, y }; });
  await preloadTiles(tileCoords, hazardTileProvider, baseTileProvider);

  const result = await calculateStatsAndOptionallyNearestPoints(
    grid,
    hazardTileProvider,
    baseTileProvider,
    hazardConfig,
    currentLocation
  );
  return { ...result, hazardConfig };
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
