import { createGrid } from './grid';
import { classifyRiskFromRGB, isWaterColor } from './risk';
import { createBrowserTileProvider, createTileProvider } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, GridPoint, HazardConfig } from './types';
import type { Feature, Point } from 'geojson';
import { point, featureCollection } from '@turf/helpers';
import nearestPoint from '@turf/nearest-point';
import { getPixelFromPNG, readPNGFromBuffer } from './utils';


// Preload all hazard and base tiles in parallel
async function preloadRiskTiles(tileCoords: { z: number, x: number, y: number }[], hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>, baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>) {
  await Promise.all([
    ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y)),
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y))
  ]);
}

// Group points by tile
function groupPointsByTile(grid: GridPoint[]) {
  const tilePointMap = new Map();
  for (const point of grid) {
    const key = `${point.tile.z}/${point.tile.x}/${point.tile.y}`;
    if (!tilePointMap.has(key)) tilePointMap.set(key, []);
    tilePointMap.get(key).push(point);
  }
  return tilePointMap;
}



function getRiskInfoFromTile(
  hazardPng: any | undefined,
  basePng: any | undefined,
  px: number,
  py: number,
  hazardConfig: HazardConfig | undefined
) {
  const [r, g, b] = getPixelFromPNG(hazardPng, px, py);
  const riskLevel = classifyRiskFromRGB(r, g, b, hazardConfig);
  const [br, bg, bb] = getPixelFromPNG(basePng, px, py);
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
      let hazardPng: any | undefined, basePng: any | undefined;
      try { hazardPng = readPNGFromBuffer(await hazardTileProvider(z, x, y)); } catch {}
      try { basePng = readPNGFromBuffer(await baseTileProvider(z, x, y)); } catch {}
      const { riskLevel, isWater } = getRiskInfoFromTile(hazardPng, basePng, samplePoint.pixel.x, samplePoint.pixel.y, hazardConfig);
      currentLocationRisk = { riskLevel, isWater };
    }
  }

  await Promise.all(Array.from(tilePointMap.entries()).map(async ([key, points]) => {
    const { z, x, y } = points[0].tile;
    let hazardPng: any | undefined, basePng: any | undefined;
    try { hazardPng = readPNGFromBuffer(await hazardTileProvider(z, x, y)); } catch {}
    try { basePng = readPNGFromBuffer(await baseTileProvider(z, x, y)); } catch {}
    for (const p of points) {
      const { riskLevel, isWater } = getRiskInfoFromTile(hazardPng, basePng, p.pixel.x, p.pixel.y, hazardConfig);
      if (isWater) {
        waterCount++;
        continue;
      }
      stats[riskLevel] = (stats[riskLevel] || 0) + 1;
      total++;
      if (hasNearest) {
        if (!levelPoints[riskLevel]) levelPoints[riskLevel] = [];
        levelPoints[riskLevel].push(
          point([p.lon, p.lat], {
            level: riskLevel,
            color: hazardConfig!.levels[riskLevel]?.color,
            latitude: p.lat,
            longitude: p.lon
          })
        );
      }
    }
  }));
  stats.total = total;
  // Calculate nearestPoints using turf
  let nearestPoints: { [level: string]: any } = {};
  if (hasNearest && currentLocation) {
    const from = point([currentLocation.lon, currentLocation.lat]);
    for (const level in levelPoints) {
      const fc = featureCollection<Point>(levelPoints[level]);
      if (fc.features.length > 0) {
        const nearest = nearestPoint(from, fc, { units: 'meters' });
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


// Wrapper for Node.js
export async function analyzeRiskInPolygon(options: AnalyzeRiskOptions, cache?: TileCache): Promise<any> {
  const {
    hazardTileUrl,
    baseTileUrl
  } = options;
  // console.log('analyzeRiskInPolygon', JSON.stringify(options, null, 2));
  // Only use createNodeTileProvider for Node.js
  let hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  let baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  if (typeof window === 'undefined') {
    hazardTileProvider = createTileProvider(hazardTileUrl, cache);
    baseTileProvider = createTileProvider(baseTileUrl, cache);
  } else {
    throw new Error('Browser environment not supported in this Node.js pipeline');
  }

  const grid = createGrid(options.polygon, options.gridSize, options.zoom);
  const tileCoordSet = new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`));
  const tileCoords = Array.from(tileCoordSet).map(key => {
    const [z, x, y] = key.split('/').map(Number);
    return { z, x, y };
  });
  await preloadRiskTiles(tileCoords, hazardTileProvider, baseTileProvider);

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

  const grid = createGrid(options.polygon, options.gridSize, options.zoom);
  const tileCoordSet = new Set(grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`));
  const tileCoords = Array.from(tileCoordSet).map(key => {
    const [z, x, y] = key.split('/').map(Number);
    return { z, x, y };
  });
  // await preloadTiles(tileCoords, hazardTileProvider, baseTileProvider);
  // return await calculateStatsAndOptionallyNearestPoints(
  //   grid,
  //   hazardTileProvider,
  //   baseTileProvider,
  //   options.hazardConfig,
  //   options.currentLocation
  // );

  return {
    stats: {
      total: 0,
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
      level5: 0
    },
    nearestPoints: {},
    waterCount: 0,
    currentLocationRisk: undefined,
    hazardConfig: options.hazardConfig
  };
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
export {
  getElevationFromDEM,
  getElevationFromDEMBrowser,
  DEFAULT_DEM_CONFIGS,
  type GetElevationOptions,
  type ElevationResult,
  type DEMConfig
} from './dem';

// Export utility functions
export {
  latLngToTile,
  calculateElevationFromRGB,
  getPixelFromPNG,
  getPixelFromImageBitmap,
  preloadTiles,
  createDEMUrlList,
  readPNGFromBuffer
} from './utils';
