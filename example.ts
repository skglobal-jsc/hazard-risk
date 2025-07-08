import { analyzeRiskInPolygon } from './src/index';
import { createHazardConfig, classifyRiskFromRGB, DEFAULT_TSUNAMI_CONFIG } from './src/risk';
import { TileCache } from './src/cache';
import * as turf from '@turf/turf';

async function main() {
  console.log('🚀 Bắt đầu phân tích rủi ro...\n');

  // Tạo polygon hình tròn bán kính 500m quanh vị trí
  const center = turf.point([139.659200906754, 35.191539000170]);
  const radius = 0.1; // 500m
  const polygon = turf.circle(center, radius, { units: 'kilometers' });

  // Tạo cache với preload
  const tileCache = new TileCache(200 * 1024 * 1024, 10 * 60 * 1000); // 200MB, 10 phút

  // Hazard config với hỗ trợ cả RGB và hex color
  const hazardConfig = {
    name: 'Tsunami Risk',
    levels: {
      0: {
        name: 'level0',
        color: '#000000', // Hex format
        description: 'Không rủi ro'
      },
      1: {
        name: 'level1',
        color: '255,255,0', // RGB format
        description: 'Chú ý'
      },
      2: {
        name: 'level2',
        color: '#ffa500', // Hex format
        description: 'Cảnh báo'
      },
      3: {
        name: 'level3',
        color: '255,0,0', // RGB format
        description: 'Rất nguy hiểm'
      }
    },
    // Array các màu nước đã xác định sẵn (hex format)
    waterColors: ['#bed2ff', '#a8c8ff', '#8bb8ff', '#6aa8ff']
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
    // Phân tích rủi ro với cache
    const result = await analyzeRiskInPolygon({
      polygon: polygon.geometry,
      hazardTileUrl: 'https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png', // Hazard tile (GSI Japan)
      baseTileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', // Base tile (GSI Japan)
      gridSize: 5, // 50 mét (giảm từ 100m)
      zoom: 16,
      hazardConfig: hazardConfig
    }, tileCache);

    console.log('📊 Kết quả phân tích:');
    console.log(`   Tổng điểm: ${result.total}`);
    console.log(`   Điểm rủi ro: ${result.stats.filter(s => s.level !== 'water').reduce((sum, s) => sum + s.count, 0)}\n`);

    console.log('📈 Thống kê chi tiết:');
    for (const stat of result.stats) {
      if (stat.level === 'water') {
        console.log(`   💧 Nước: ${stat.count} điểm (${stat.ratio.toFixed(1)}%)`);
      } else {
        const levelConfig = hazardConfig.levels[stat.level as number];
        const colorType = levelConfig.color.startsWith('#') ? 'HEX' : 'RGB';
        console.log(`   Level ${stat.level} (${levelConfig.name}): ${stat.count} điểm (${stat.ratio.toFixed(1)}%)`);
        console.log(`     Mô tả: ${levelConfig.description}`);
        console.log(`     Màu: ${levelConfig.color} (${colorType})`);
      }
    }

    console.log('\n✅ Phân tích hoàn thành!');

    // Test với level 0 màu trắng
    console.log('\n🧪 Test với level 0 màu trắng:');
    const whiteLevel0Config = createHazardConfig('Test White Level 0', {
      0: {
        name: 'level0',
        color: '#ffffff', // Màu trắng thay vì đen
        description: 'Không rủi ro (trắng)'
      },
      1: {
        name: 'level1',
        color: '255,255,0',
        description: 'Chú ý'
      },
      2: {
        name: 'level2',
        color: '#ffa500',
        description: 'Cảnh báo'
      },
      3: {
        name: 'level3',
        color: '255,0,0',
        description: 'Rất nguy hiểm'
      }
    }, ['#bed2ff', '#a8c8ff', '#8bb8ff', '#6aa8ff']);

    // Test phân loại màu đen với config màu trắng
    const blackPixelResult = classifyRiskFromRGB(0, 0, 0, whiteLevel0Config);
    console.log(`   Màu đen (0,0,0) với level 0 trắng: Level ${blackPixelResult}`);

    // Test phân loại màu trắng với config màu trắng
    const whitePixelResult = classifyRiskFromRGB(255, 255, 255, whiteLevel0Config);
    console.log(`   Màu trắng (255,255,255) với level 0 trắng: Level ${whitePixelResult}`);

    // Test với config mặc định (level 0 đen)
    const blackPixelDefaultResult = classifyRiskFromRGB(0, 0, 0, DEFAULT_TSUNAMI_CONFIG);
    console.log(`   Màu đen (0,0,0) với level 0 đen: Level ${blackPixelDefaultResult}`);

    console.log('\n' + '='.repeat(50));

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

main();
