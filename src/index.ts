import { createGrid } from './grid';
import { classifyRiskFromRGB, isWaterColor } from './risk';
import { createTileProvider } from './raster';
import { TileCache } from './cache';
import type { AnalyzeRiskOptions, GridPoint, HazardConfig } from './types';
import type { Feature, Point } from 'geojson';
import { point, featureCollection } from '@turf/helpers';
import nearestPoint from '@turf/nearest-point';
import { getPixelFromPNG, readPNGFromBuffer, latLngToTile } from './utils';

// Preload all hazard and base tiles in parallel
async function preloadRiskTiles(
  tileCoords: { z: number; x: number; y: number }[],
  hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
  baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>
) {
  await Promise.all([
    ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y)),
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y)),
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
  hazardTileProvider: {
    (z: number, x: number, y: number): Promise<Buffer>;
    (arg0: any, arg1: any, arg2: any): any;
  },
  baseTileProvider: {
    (z: number, x: number, y: number): Promise<Buffer>;
    (arg0: any, arg1: any, arg2: any): any;
  },
  hazardConfig: HazardConfig | undefined,
  currentLocation: { lat: number; lon: number } | undefined // can be undefined
): Promise<{
  stats: { [level: string]: number; total: number };
  nearestPoints?: any;
  waterCount: number;
  currentLocationRisk?: { riskLevel: number; isWater: boolean };
}> {
  const stats: { [level: string]: number; total: number } = { total: 0 };
  let total = 0;
  let waterCount = 0;
  const tilePointMap = groupPointsByTile(grid);
  const hasNearest = !!currentLocation;
  // Group valid points by risk level
  const levelPoints: { [level: string]: Feature<Point>[] } = {};

  // Determine risk at currentLocation (if exists)
  let currentLocationRisk: { riskLevel: number; isWater: boolean } | undefined =
    undefined;
    if (currentLocation) {
    // Method 1: Try to find exact point in grid
    let samplePoint = grid.find(
      pt =>
        Math.abs(pt.lat - currentLocation.lat) < 1e-6 &&
        Math.abs(pt.lon - currentLocation.lon) < 1e-6
    );

    // Method 2: If no exact match, find nearest point in grid
    if (!samplePoint && grid.length > 0) {
      let minDistance = Infinity;
      for (const pt of grid) {
        const distance = Math.sqrt(
          Math.pow(pt.lat - currentLocation.lat, 2) +
          Math.pow(pt.lon - currentLocation.lon, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          samplePoint = pt;
        }
      }
    }

    // Method 3: If still no point found, calculate exact tile/pixel for currentLocation
    if (!samplePoint) {
      // Get zoom from first grid point or use default
      const zoom = grid.length > 0 ? grid[0].tile.z : 12;
      const { tile: exactTile, pixel: exactPixel } = latLngToTile(currentLocation.lat, currentLocation.lon, zoom);

      // Check if this tile is within our analyzed area
      const tileKey = `${exactTile.z}/${exactTile.x}/${exactTile.y}`;
      const isTileAnalyzed = tilePointMap.has(tileKey);

      if (isTileAnalyzed) {
        samplePoint = {
          lat: currentLocation.lat,
          lon: currentLocation.lon,
          tile: exactTile,
          pixel: exactPixel,
          isWater: false
        };
      }
    }
    if (samplePoint) {
      console.log('samplePoint', samplePoint);
      const { z, x, y } = samplePoint.tile;
      let hazardPng: any | undefined, basePng: any | undefined;
      try {
        hazardPng = readPNGFromBuffer(await hazardTileProvider(z, x, y));
      } catch {}
      try {
        basePng = readPNGFromBuffer(await baseTileProvider(z, x, y));
      } catch {}
      const { riskLevel, isWater } = getRiskInfoFromTile(
        hazardPng,
        basePng,
        samplePoint.pixel.x,
        samplePoint.pixel.y,
        hazardConfig
      );
      currentLocationRisk = { riskLevel, isWater };
    }
  }

  await Promise.all(
    Array.from(tilePointMap.entries()).map(async ([key, points]) => {
      const { z, x, y } = points[0].tile;
      let hazardPng: any | undefined, basePng: any | undefined;
      try {
        hazardPng = readPNGFromBuffer(await hazardTileProvider(z, x, y));
      } catch {}
      try {
        basePng = readPNGFromBuffer(await baseTileProvider(z, x, y));
      } catch {}
      for (const p of points) {
        const { riskLevel, isWater } = getRiskInfoFromTile(
          hazardPng,
          basePng,
          p.pixel.x,
          p.pixel.y,
          hazardConfig
        );
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
              longitude: p.lon,
            })
          );
        }
      }
    })
  );
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
          distance: nearest.properties?.distanceToPoint, // already in meters
        };
      }
    }
    return {
      stats,
      nearestPoints,
      waterCount,
      currentLocationRisk,
      hazardConfig,
    } as any;
  } else {
    return { stats, waterCount, currentLocationRisk, hazardConfig } as any;
  }
}

// Wrapper for Node.js
export async function analyzeRiskInPolygon(
  options: AnalyzeRiskOptions,
  cache?: TileCache
): Promise<any> {
  const { hazardTileUrl, baseTileUrl } = options;
  // console.log('analyzeRiskInPolygon', JSON.stringify(options, null, 2));
  // Only use createNodeTileProvider for Node.js
  let hazardTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  let baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>;
  hazardTileProvider = createTileProvider(hazardTileUrl, cache);
  baseTileProvider = createTileProvider(baseTileUrl, cache);

  const grid = createGrid(options.polygon, options.gridSize, options.zoom);
  const tileCoordSet = new Set(
    grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`)
  );
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


// Export necessary types and functions
export type {
  RiskLevel,
  RiskStat,
  GridPoint,
  AnalyzeRiskOptions,
  AnalyzeRiskResult,
  GeoJSONPolygon,
  HazardConfig,
  RiskLevelConfig,
} from './types';

export { NodeRasterReader } from './raster';
export { TileCache } from './cache';
export { DEFAULT_TSUNAMI_CONFIG, createHazardConfig } from './risk';
export {
  getElevationFromDEM,
  DEFAULT_DEM_CONFIGS,
  type GetElevationOptions,
  type ElevationResult,
  type DEMConfig,
} from './dem';

// Export utility functions
export {
  latLngToTile,
  calculateElevationFromRGB,
  getPixelFromPNG,
  preloadTiles,
  createDEMUrlList,
  readPNGFromBuffer,
} from './utils';
