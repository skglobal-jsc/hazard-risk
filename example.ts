import { analyzeRiskInPolygon } from './src/index';
import { createHazardConfig, classifyRiskFromRGB, DEFAULT_TSUNAMI_CONFIG } from './src/risk';
import { TileCache } from './src/cache';
import * as turf from '@turf/turf';
import { HazardConfig } from './src/types';


const RADIUS = 3000;
const GRID_SIZE = 80;
const ZOOM = 12;

const TILE_URL = 'https://disaportaldata.gsi.go.jp/raster/01_flood_l1_shinsuishin_newlegend_data/{z}/{x}/{y}.png';
const BASE_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';

async function main() {
  console.log('🚀 Bắt đầu phân tích rủi ro...\n');

  // Tạo polygon hình tròn bán kính 100m quanh vị trí mới
  const center = turf.point([141.3543113869357, 43.06194898993809]);
  const radius = RADIUS;
  const polygon = turf.circle(center, radius, { units: 'meters' });

  // Tạo cache với preload
  const tileCache = new TileCache(200 * 1024 * 1024, 10 * 60 * 1000); // 200MB, 10 phút

  // Hazard config theo bảng màu GSI Japan
  const hazardConfig: HazardConfig = {
    name: 'Tsunami Depth (GSI Japan)',
    levels: {
      0: {
        name: 'level0',
        color: '#FFFFFF',
        description: '0m'
      },
      1: {
        name: 'level1',
        color: '#FFFFB3',
        description: '<0.3m'
      },
      2: {
        name: 'level2',
        color: '#F7F5A9',
        description: '<0.5m'
      },
      3: {
        name: 'level3',
        color: '#F8E1A6',
        description: '0.5~1m'
      },
      4: {
        name: 'level4',
        color: '#FFD8C0',
        description: '0.5~3m'
      },
      5: {
        name: 'level5',
        color: '#FFB7B7',
        description: '3~5m'
      },
      6: {
        name: 'level6',
        color: '#FF9191',
        description: '5~10m'
      },
      7: {
        name: 'level7',
        color: '#F285C9',
        description: '10~20m'
      },
      8: {
        name: 'level8',
        color: '#DC7ADC',
        description: '>20m'
      }
    },
    waterColors: ['#bed2ff', '#f7f5a9', '#8bb8ff', '#6aa8ff'],
  };

  console.log('📍 Vị trí phân tích:');
  console.log(`   Lat: ${center.geometry.coordinates[1]}`);
  console.log(`   Lon: ${center.geometry.coordinates[0]}`);
  console.log(`   Bán kính: ${radius * 1000}m\n`);

  console.log('🗺️  Hazard Config:');
  console.log(`   Tên: ${hazardConfig.name}`);
  console.log('   Risk Levels:');
  for (const [level, config] of Object.entries(hazardConfig.levels)) {
    const colorType = config.color.startsWith('#') ? 'HEX' : 'RGB';
    console.log(`     Level ${level}: ${config.name} - ${config.description} (${config.color} - ${colorType})`);
  }
  console.log(`   Màu nước: ${hazardConfig.waterColors?.join(', ')}\n`);

  console.log('💾 Cache Config:');
  console.log(`   Max size: ${tileCache.getStats().maxSize / (1024 * 1024)}MB`);
  console.log(`   TTL: 10 phút\n`);

  try {
    // Đo thời gian bắt đầu
    const start = Date.now();
    // Phân tích rủi ro với cache
    const result = await analyzeRiskInPolygon({
      polygon: polygon.geometry,
      hazardTileUrl: TILE_URL, // Hazard tile (GSI Japan)
      baseTileUrl: BASE_TILE_URL, // Base tile (GSI Japan)
      gridSize: GRID_SIZE, // 5 mét
      zoom: ZOOM,
      hazardConfig: hazardConfig,

      currentLocation: {
        lat: center.geometry.coordinates[1],
        lon: center.geometry.coordinates[0]
      }
    }, tileCache);
    // Đo thời gian kết thúc
    const end = Date.now();
    console.log(`⏱️  Thời gian thực thi: ${(end - start) / 1000}s\n`);

    console.log('📊 Kết quả phân tích:', result);
    console.log(`   Tổng điểm: ${result.stats.total}`);
    // Tính tổng điểm risk (level > 0)
    const totalRisk = Object.keys(result.stats)
      .filter(k => k !== 'total' && Number(k) > 0)
      .reduce((sum, k) => sum + result.stats[k], 0);
    console.log(`   Điểm rủi ro: ${totalRisk}\n`);

    console.log('📈 Thống kê chi tiết:');
    for (const level of Object.keys(result.stats)) {
      if (level === 'total') continue;
      const levelConfig = result.hazardConfig.levels[level];
      const colorType = levelConfig?.color?.startsWith('#') ? 'HEX' : 'RGB';
      console.log(`   Level ${level} (${levelConfig?.name || ''}): ${result.stats[level]} điểm`);
      if (levelConfig) {
        console.log(`     Mô tả: ${levelConfig.description}`);
        console.log(`     Màu: ${levelConfig.color} (${colorType})`);
      }
      // In nearest point nếu có
      if (result.nearestPoints && result.nearestPoints[level]) {
        const np = result.nearestPoints[level];
        console.log(`     Gần nhất: (${np.latitude}, ${np.longitude}), cách tâm ${np.distance} độ`);
      }
    }

    console.log('\n✅ Phân tích hoàn thành!');

    console.log('\n' + '='.repeat(50));

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

main();
