import type { TileCoord, PixelCoord, HazardConfig } from './types';

export interface RasterReader {
  getPixelRiskInfo(
    tile: TileCoord,
    pixel: PixelCoord,
    hazardConfig: HazardConfig
  ): Promise<{ riskLevel: number; isWater: boolean }>;
}
