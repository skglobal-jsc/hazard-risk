import { getElevationFromDEM, DEFAULT_DEM_CONFIGS } from './src/index';

// Example usage for Node.js
async function exampleNodeJS() {
  try {
    // Get elevation for Tokyo (35.6762, 139.6503)
    const result = await getElevationFromDEM({
      lat: 36.682158333460485,
      lng: 137.29295833375718,
      zoom: 17
    });
    console.log(" DEM result: ", result);
    if (result.elevation !== null) {
      console.log(`Elevation: ${result.elevation.toFixed(result.fixed)}m`);
      console.log(`Source: ${result.source}`);
      console.log(`Position: ${result.position.lat}, ${result.position.lng}`);
    } else {
      console.log('No elevation data found for this location');
    }
  } catch (error) {
    console.error('Error getting elevation:', error);
  }
}


// Example with custom DEM configuration
async function exampleCustomDEM() {
  const customDEMConfigs = [
    {
      title: "Custom DEM",
      url: "https://your-dem-service.com/{z}/{x}/{y}.png",
      minzoom: 15,
      maxzoom: 15,
      fixed: 1
    }
  ];

  try {
    const result = await getElevationFromDEM({
      lat: 35.6762,
      lng: 139.6503,
      zoom: 15,
      demConfigs: customDEMConfigs
    });

    if (result.elevation !== null) {
      console.log(`Elevation: ${result.elevation.toFixed(result.fixed)}m`);
      console.log(`Source: ${result.source}`);
    } else {
      console.log('No elevation data found');
    }
  } catch (error) {
    console.error('Error getting elevation:', error);
  }
}

// Example with cache
async function exampleWithCache() {
  const { TileCache } = await import('./src/index');
  const cache = new TileCache();

  try {
    const result = await getElevationFromDEM({
      lat: 35.6762,
      lng: 139.6503,
      zoom: 17,
      cache
    });

    if (result.elevation !== null) {
      console.log(`Elevation: ${result.elevation.toFixed(result.fixed)}m`);
      console.log(`Source: ${result.source}`);
    } else {
      console.log('No elevation data found');
    }
  } catch (error) {
    console.error('Error getting elevation:', error);
  }
}

// Run examples for Node.js environment
console.log('Running Node.js examples...');
exampleNodeJS();
// exampleCustomDEM();
// exampleWithCache();
