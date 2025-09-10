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
  hazardTileProviders: ((z: number, x: number, y: number) => Promise<Buffer>)[],
  baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>
) {
  const allPromises = [
    ...tileCoords.map(coord => baseTileProvider(coord.z, coord.x, coord.y)),
  ];

  // Add all hazard tile providers
  for (const hazardTileProvider of hazardTileProviders) {
    allPromises.push(
      ...tileCoords.map(coord => hazardTileProvider(coord.z, coord.x, coord.y))
    );
  }

  await Promise.all(allPromises);
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

// Merge risk levels from multiple tiles based on specified strategy
function mergeRiskLevels(
  riskLevels: { level: number; color?: string; name?: string }[],
  strategy: 'max' | 'average' | 'weighted' | 'priority' = 'max',
  weights: number[] = [],
  priorities: number[] = []
): { level: number; color?: string; name?: string } {
  // console.log('mergeRiskLevels', riskLevels, strategy, weights, priorities);
  if (riskLevels.length === 0) {
    return { level: 0, color: '#000000', name: 'No Risk' };
  }

  if (riskLevels.length === 1) {
    return riskLevels[0];
  }

  switch (strategy) {
    case 'max':
      console.log('max strategy', riskLevels);
      // Return the highest risk level (safest approach)
      // Use when safety is priority and false positives are acceptable
      const maxLevel = riskLevels.reduce((max, current) => {
        return current.level > max.level ? current : max;
      });
      return maxLevel;

    case 'average':
      // Calculate average risk level (balanced approach)
      // Use when all tile sources are equally reliable
      const avgLevel = Math.round(
        riskLevels.reduce((sum, rl) => sum + rl.level, 0) / riskLevels.length
      );
      return riskLevels.find(rl => rl.level === avgLevel) || riskLevels[0];

    case 'weighted':
      // Weighted average based on provided weights
      // Use when tile sources have different reliability levels
      if (weights.length !== riskLevels.length) {
        console.warn('Weights length does not match risk levels length, falling back to max strategy');
        return mergeRiskLevels(riskLevels, 'max');
      }

      const weightedSum = riskLevels.reduce((sum, rl, index) => {
        return sum + (rl.level * weights[index]);
      }, 0);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      const weightedLevel = Math.round(weightedSum / totalWeight);
      return riskLevels.find(rl => rl.level === weightedLevel) || riskLevels[0];

    case 'priority':
      // Use priority-based selection (highest priority wins)
      // Use when one tile source is more authoritative than others
      if (priorities.length !== riskLevels.length) {
        console.warn('Priorities length does not match risk levels length, falling back to max strategy');
        return mergeRiskLevels(riskLevels, 'max');
      }

      const maxPriority = Math.max(...priorities);
      const maxPriorityIndex = priorities.indexOf(maxPriority);
      return riskLevels[maxPriorityIndex];

    default:
      // Fallback to max strategy for unknown strategies
      return mergeRiskLevels(riskLevels, 'max');
  }
}

// Calculate combined risk from multiple hazard tiles using merge strategy
function getCombinedRiskFromTiles(
  hazardPngs: (any | undefined)[],
  basePng: any | undefined,
  px: number,
  py: number,
  hazardConfig: HazardConfig | undefined,
  mergeStrategy: 'max' | 'average' | 'weighted' | 'priority' = 'max',
  weights: number[] = [],
  priorities: number[] = []
) {
  // Get base tile water detection
  const [br, bg, bb] = getPixelFromPNG(basePng, px, py);
  const isWater = isWaterColor(br, bg, bb, hazardConfig);

  if (isWater) {
    return { riskLevel: 0, isWater: true };
  }

  // Collect risk levels from all hazard tiles
  const riskLevels: { level: number; color?: string; name?: string }[] = [];

  for (let i = 0; i < hazardPngs.length; i++) {
    const hazardPng = hazardPngs[i];
    if (hazardPng) {
      const [r, g, b] = getPixelFromPNG(hazardPng, px, py);
      const riskLevel = classifyRiskFromRGB(r, g, b, hazardConfig);
      riskLevels.push({
        level: riskLevel,
        color: `rgb(${r},${g},${b})`,
        name: `${hazardConfig?.name}`
      });
    }
  }

  // Merge risk levels using the specified strategy
  const mergedRisk = mergeRiskLevels(riskLevels, mergeStrategy, weights, priorities);

  return { riskLevel: mergedRisk.level, isWater: false };
}

// Calculate statistics and optionally nearestPoints
async function calculateStatsAndOptionallyNearestPoints(
  grid: GridPoint[],
  hazardTileProviders: ((z: number, x: number, y: number) => Promise<Buffer>)[],
  baseTileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
  hazardConfig: HazardConfig | undefined,
  currentLocation: { lat: number; lon: number } | undefined, // can be undefined
  mergeStrategy: 'max' | 'average' | 'weighted' | 'priority' = 'max',
  weights: number[] = [],
  priorities: number[] = []
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
      const { tile: exactTile, pixel: exactPixel } = latLngToTile(
        currentLocation.lat,
        currentLocation.lon,
        zoom
      );

      // Check if this tile is within our analyzed area
      const tileKey = `${exactTile.z}/${exactTile.x}/${exactTile.y}`;
      const isTileAnalyzed = tilePointMap.has(tileKey);

      if (isTileAnalyzed) {
        samplePoint = {
          lat: currentLocation.lat,
          lon: currentLocation.lon,
          tile: exactTile,
          pixel: exactPixel,
          isWater: false,
        };
      }
    }
    if (samplePoint) {
      console.log('samplePoint', samplePoint);
      const { z, x, y } = samplePoint.tile;
      let hazardPngs: (any | undefined)[] = [],
        basePng: any | undefined;

      // Load all hazard tiles
      for (const hazardTileProvider of hazardTileProviders) {
        try {
          const hazardPng = readPNGFromBuffer(
            await hazardTileProvider(z, x, y)
          );
          hazardPngs.push(hazardPng);
        } catch {
          hazardPngs.push(undefined);
        }
      }

      try {
        basePng = readPNGFromBuffer(await baseTileProvider(z, x, y));
      } catch {}

      const { riskLevel, isWater } = getCombinedRiskFromTiles(
        hazardPngs,
        basePng,
        samplePoint.pixel.x,
        samplePoint.pixel.y,
        hazardConfig,
        mergeStrategy,
        weights,
        priorities
      );
      currentLocationRisk = { riskLevel, isWater };
    }
  }

  await Promise.all(
    Array.from(tilePointMap.entries()).map(async ([key, points]) => {
      const { z, x, y } = points[0].tile;
      let hazardPngs: (any | undefined)[] = [],
        basePng: any | undefined;

      // Load all hazard tiles
      for (const hazardTileProvider of hazardTileProviders) {
        try {
          const hazardPng = readPNGFromBuffer(
            await hazardTileProvider(z, x, y)
          );
          hazardPngs.push(hazardPng);
        } catch {
          hazardPngs.push(undefined);
        }
      }

      try {
        basePng = readPNGFromBuffer(await baseTileProvider(z, x, y));
      } catch {}

        for (const p of points) {
          const { riskLevel, isWater } = getCombinedRiskFromTiles(
            hazardPngs,
            basePng,
            p.pixel.x,
            p.pixel.y,
            hazardConfig,
            mergeStrategy,
            weights,
            priorities
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
  const { hazardTiles, baseTileUrl, mergeStrategy = 'max' } = options;
  // console.log('analyzeRiskInPolygon', JSON.stringify(options, null, 2));

  // Create tile providers for all hazard tiles
  const hazardTileProviders = hazardTiles.map(hazardTile =>
    createTileProvider(hazardTile.url, cache)
  );
  const baseTileProvider = createTileProvider(baseTileUrl, cache);

  // Extract weights and priorities from hazard tile configurations
  const weights = hazardTiles.map(hazardTile => hazardTile.weight || 1);
  const priorities = hazardTiles.map(hazardTile => hazardTile.priority || 1);

  const grid = createGrid(options.polygon, options.gridSize, options.zoom);
  const tileCoordSet = new Set(
    grid.map(point => `${point.tile.z}/${point.tile.x}/${point.tile.y}`)
  );
  const tileCoords = Array.from(tileCoordSet).map(key => {
    const [z, x, y] = key.split('/').map(Number);
    return { z, x, y };
  });
  await preloadRiskTiles(tileCoords, hazardTileProviders, baseTileProvider);

  return await calculateStatsAndOptionallyNearestPoints(
    grid,
    hazardTileProviders,
    baseTileProvider,
    options.hazardConfig,
    options.currentLocation,
    mergeStrategy,
    weights,
    priorities
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
  HazardTileConfig,
  HazardTileType,
  MergeStrategy,
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
