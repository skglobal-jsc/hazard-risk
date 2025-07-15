import { getBoundingBox } from './polygon';
import type { GeoJSONPolygon, GridPoint } from './types';
import pointGrid from '@turf/point-grid';
import { feature } from '@turf/helpers';

// Create point grid covering bounding box
export function createGrid(
  polygon: GeoJSONPolygon,
  gridSize: number, // meters
  zoom: number
): GridPoint[] {
  if (
    !polygon ||
    polygon.type !== 'Polygon' ||
    !Array.isArray(polygon.coordinates)
  ) {
    throw new Error('Invalid GeoJSON Polygon');
  }
  const bbox = getBoundingBox(polygon);

  const pointGrids = pointGrid(bbox, gridSize, {
    units: 'meters',
    mask: feature(polygon),
  });

  // Convert turf points to GridPoint[]
  const grid: GridPoint[] = [];
  for (const feature of pointGrids.features) {
    const [lon, lat] = feature.geometry.coordinates;
    const tile = latLonToTile(lat, lon, zoom);
    const pixel = latLonToPixel(lat, lon, zoom);

    grid.push({
      lat,
      lon,
      tile,
      pixel,
      isWater: false, // Default initialization
    });
  }

  return grid;
}

// Convert lat/lon to XYZ tile
function latLonToTile(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor(((lon + 180) / 360) * n);
  const ytile = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      n
  );

  return { z: zoom, x: xtile, y: ytile };
}

// Convert lat/lon to pixel in tile
function latLonToPixel(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n * 256;
  const y =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    n *
    256;

  return {
    x: Math.floor(x % 256),
    y: Math.floor(y % 256),
  };
}
