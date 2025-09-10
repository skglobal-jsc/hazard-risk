import { analyzeRiskInPolygon } from './src/index';
import { TileCache } from './src/cache';
import { HazardConfig } from './src/types';
import { point } from '@turf/helpers';
import circle from '@turf/circle';

const HOUSE_COLLAPSE_URLS = [
  'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_kaokutoukai_hanran_data/{z}/{x}/{y}.png',
  'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_kaokutoukai_kagan_data/{z}/{x}/{y}.png',
];

const WATER_TILE_URL =
  'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';

const getSizeAndZoom = (radius: number) => {
  if (radius < 100) return { size: 2, zoom: 16 };
  if (radius >= 100 && radius < 300) return { size: 5, zoom: 15 };
  if (radius >= 300 && radius < 500) return { size: 7, zoom: 14 };
  if (radius >= 500 && radius < 1000) return { size: 10, zoom: 14 };
  if (radius >= 1000 && radius < 3000) return { size: 20, zoom: 13 };
  return { size: 80, zoom: 12 }; // Default for radius >= 3000
};

async function main() {
  console.log('🚀 Bắt đầu phân tích rủi ro...\n');

  // Tạo polygon hình tròn bán kính 100m quanh vị trí mới
  const center = point([138.38045440614223, 35.00987961803894]);
  const radius = 1000;
  const polygon = circle(center, radius, { units: 'meters' });

  // Tạo cache với preload
  const tileCache = new TileCache(200 * 1024 * 1024, 10 * 60 * 1000); // 200MB, 10 phút

  // Hazard config theo bảng màu GSI Japan
  const hazardConfig: HazardConfig = {
    name: 'House collapse',
    levels: {
      0: {
        name: 'level0',
        color: '#FFFFFF',
        description: '0m',
      },
      1: {
        name: 'level1',
        color: '#FF0000',
        description: 'Risk of flooding',
      },
    },
    waterColors: ['#bed2ff'],
  };

  console.log('📍 Vị trí phân tích:');
  console.log(`   Lat: ${center.geometry.coordinates[1]}`);
  console.log(`   Lon: ${center.geometry.coordinates[0]}`);
  console.log(`   Bán kính: ${radius * 1000}m\n`);
  const { size, zoom } = getSizeAndZoom(radius);
  console.log(`   Size: ${size}`);
  console.log(`   Zoom: ${zoom}`);

  console.log('🗺️  Hazard Config:');
  console.log(`   Tên: ${hazardConfig.name}`);
  console.log('   Risk Levels:');
  for (const [level, config] of Object.entries(hazardConfig.levels)) {
    const colorType = config.color.startsWith('#') ? 'HEX' : 'RGB';
    console.log(
      `     Level ${level}: ${config.name} - ${config.description} (${config.color} - ${colorType})`
    );
  }
  console.log(`   Màu nước: ${hazardConfig.waterColors?.join(', ')}\n`);

  console.log('💾 Cache Config:');
  console.log(`   Max size: ${tileCache.getStats().maxSize / (1024 * 1024)}MB`);
  console.log(`   TTL: 10 phút\n`);

  try {
    // Đo thời gian bắt đầu
    const start = Date.now();
    // Phân tích rủi ro với cache
    const result = await analyzeRiskInPolygon(
      {
        polygon: polygon.geometry,
        hazardTiles: HOUSE_COLLAPSE_URLS.map((url, index) => ({
          url,
          type: 'raster',
          name: `${hazardConfig.name} ${index}`,
        })),
        baseTileUrl: WATER_TILE_URL,
        gridSize: size,
        zoom: zoom,
        hazardConfig: hazardConfig,
        currentLocation: {
          lat: center.geometry.coordinates[1],
          lon: center.geometry.coordinates[0],
        },

        mergeStrategy: 'max',
      },
      tileCache
    );

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
      console.log(
        `   Level ${level} (${levelConfig?.name || ''}): ${result.stats[level]} điểm`
      );
      if (levelConfig) {
        console.log(`     Mô tả: ${levelConfig.description}`);
        console.log(`     Màu: ${levelConfig.color} (${colorType})`);
      }
      // In nearest point nếu có
      if (result.nearestPoints && result.nearestPoints[level]) {
        const np = result.nearestPoints[level];
        console.log(
          `     Gần nhất: (${np.latitude}, ${np.longitude}), cách tâm ${np.distance} độ`
        );
      }
    }

    console.log('\n✅ Phân tích hoàn thành!');

    console.log('\n' + '='.repeat(50));
  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

main();
