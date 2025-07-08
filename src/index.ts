import { createGrid } from './grid';
import { classifyRiskFromRGB, calculateRiskStats, isWaterColor, DEFAULT_TSUNAMI_CONFIG } from './risk';
import { createNodeTileProvider, NodeRasterReader } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, AnalyzeRiskResult, GridPoint, HazardConfig } from './types';
import { PNG, PNGWithMetadata } from 'pngjs';
import * as turf from '@turf/turf';
import type { Feature, Point } from 'geojson';
import { BrowserRasterReader, createBrowserTileProvider } from './raster';

// Preload all hazard and base tiles in parallel
async function preloadTiles(tileCoords, hazardTileProvider, baseTileProvider) {
  await Promise.all([
    ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y)),
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y))
  ]);
}

// Group points by tile
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

// Calculate statistics and optionally nearestPoints
async function calculateStatsAndOptionallyNearestPoints(
  grid: GridPoint[],
  hazardTileProvider: { (z: number, x: number, y: number): Promise<Buffer>; (arg0: any, arg1: any, arg2: any): any; },
  baseTileProvider: { (z: number, x: number, y: number): Promise<Buffer>; (arg0: any, arg1: any, arg2: any): any; },
  hazardConfig: HazardConfig | undefined,
  currentLocation: { lat: number; lon: number; } | undefined // can be undefined
): Promise<{ stats: { [level: string]: number, total: number }, nearestPoints?: any, waterCount: number, currentLocationRisk?: { riskLevel: number, isWater: boolean } }> {
  const stats: { [level: string]: number, total: number } = { total: 0 };
  let total = 0;
  let waterCount = 0;
  const tilePointMap = groupPointsByTile(grid);
  const hasNearest = !!currentLocation;
  // Group valid points by risk level
  const levelPoints: { [level: string]: Feature<Point>[] } = {};

  // Determine risk at currentLocation (if exists)
  let currentLocationRisk: { riskLevel: number, isWater: boolean } | undefined = undefined;
  if (currentLocation) {
    // Find tile and pixel containing currentLocation
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
  // Calculate nearestPoints using turf
  let nearestPoints: { [level: string]: any } = {};
  if (hasNearest && currentLocation) {
    const from = turf.point([currentLocation.lon, currentLocation.lat]);
    for (const level in levelPoints) {
      const fc = turf.featureCollection<Point>(levelPoints[level]);
      if (fc.features.length > 0) {
        const nearest = turf.nearestPoint(from, fc, { units: 'meters' });
        nearestPoints[level] = {
          ...nearest.properties,
          distance: nearest.properties?.distanceToPoint // already in meters
        };
      }
    }
    return { stats, nearestPoints, waterCount, currentLocationRisk, hazardConfig } as any;
  } else {
    return { stats, waterCount, currentLocationRisk, hazardConfig } as any;
  }
}

// Main function common for both Node.js and Browser
async function analyzeRiskInPolygonCore(
  options: AnalyzeRiskOptions,
  hazardTileProvider: (z: number, x: number, y: number) => Promise<any>,
  baseTileProvider: (z: number, x: number, y: number) => Promise<any>,
  rasterReader: any,
  cache?: TileCache
): Promise<any> {
  const {
    polygon,
    gridSize,
    zoom,
    hazardConfig = DEFAULT_TSUNAMI_CONFIG,
    currentLocation
  } = options;

  const grid = createGrid(polygon, gridSize, zoom);
  const tileCoords = [...new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`))]
    .map(key => { const [z, x, y] = key.split('/').map(Number); return { z, x, y }; });

  // Preload tiles (only for Node.js, browser handles itself)
  if (typeof window === 'undefined') {
    await preloadTiles(tileCoords, hazardTileProvider, baseTileProvider);
  }

  // Process each point in grid
  const riskLevels: number[] = [];
  const waterPoints: GridPoint[] = [];
  let nearestPoint: GridPoint | null = null;
  let minDistance = Infinity;

  for (const point of grid) {
    try {
      const { riskLevel, isWater } = await rasterReader.getPixelRiskInfo(
        point.tile,
        point.pixel,
        hazardConfig
      );

      riskLevels.push(riskLevel);
      if (isWater) {
        waterPoints.push(point);
      }

      // Find nearest point if currentLocation exists
      if (currentLocation) {
        const pointFeature = turf.point([point.lon, point.lat]);
        const currentPoint = turf.point([currentLocation.lon, currentLocation.lat]);
        const distance = turf.distance(pointFeature, currentPoint);
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = point;
        }
      }
    } catch (error) {
      console.warn(`Error processing point:`, error);
      riskLevels.push(0); // Fallback to level 0
    }
  }

  // Create GridPoint array with calculated riskLevel
  const gridWithRisk = grid.map((point, index) => ({
    ...point,
    riskLevel: riskLevels[index],
    isWater: waterPoints.includes(point)
  }));

  const stats = calculateRiskStats(gridWithRisk, hazardConfig);

  return {
    ...stats,
    hazardConfig,
    waterPointCount: waterPoints.length,
    nearestPoint: nearestPoint ? {
      lat: nearestPoint.lat,
      lon: nearestPoint.lon,
      riskLevel: riskLevels[grid.indexOf(nearestPoint)],
      distance: minDistance
    } : null
  };
}

// Wrapper for Node.js
export async function analyzeRiskInPolygon(options: AnalyzeRiskOptions, cache?: TileCache): Promise<any> {
  const {
    hazardTileUrl,
    baseTileUrl
  } = options;

  // Only use createNodeTileProvider for Node.js
  let hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  let baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  if (typeof window === 'undefined') {
    hazardTileProvider = createNodeTileProvider(hazardTileUrl, cache);
    baseTileProvider = createNodeTileProvider(baseTileUrl, cache);
  } else {
    throw new Error('Browser environment not supported in this Node.js pipeline');
  }

  const grid = createGrid(options.polygon, options.gridSize, options.zoom);
  const tileCoords = [...new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`))]
    .map(key => { const [z, x, y] = key.split('/').map(Number); return { z, x, y }; });
  await preloadTiles(tileCoords, hazardTileProvider, baseTileProvider);

  // Use old logic to maintain compatibility with example.ts
  return await calculateStatsAndOptionallyNearestPoints(
    grid,
    hazardTileProvider,
    baseTileProvider,
    options.hazardConfig,
    options.currentLocation
  );
}

// Wrapper for Browser
export async function analyzeRiskInPolygonBrowser(options: AnalyzeRiskOptions): Promise<any> {
  const {
    hazardTileUrl,
    baseTileUrl
  } = options;

  // Use createBrowserTileProvider for browser
  const hazardTileProvider = createBrowserTileProvider(hazardTileUrl);
  const baseTileProvider = createBrowserTileProvider(baseTileUrl);

  const rasterReader = new BrowserRasterReader(hazardTileProvider, baseTileProvider);

  return await analyzeRiskInPolygonCore(
    options,
    hazardTileProvider,
    baseTileProvider,
    rasterReader
  );
}

// Export necessary types and functions
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

export { NodeRasterReader } from './raster';
export { BrowserRasterReader, createBrowserTileProvider } from './raster';
export { TileCache } from './cache';
export { DEFAULT_TSUNAMI_CONFIG, createHazardConfig } from './risk';
