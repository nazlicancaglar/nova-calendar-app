const WMO_MAPPING = {
  0: { condition: 'Sunny & clear', summary: 'Perfect conditions to film outside — great light all morning and afternoon.' },
  1: { condition: 'Mainly clear', summary: 'Very good conditions for filming. Great natural light.' },
  2: { condition: 'Partly cloudy', summary: 'Good conditions for filming. Dynamic lighting with passing clouds.' },
  3: { condition: 'Overcast', summary: 'Overcast sky. Soft, diffused lighting — great for outdoor filming without harsh shadows.' },
  45: { condition: 'Foggy & misty', summary: 'Foggy conditions. High humidity, low visibility. Indoor filming recommended.' },
  48: { condition: 'Foggy & misty', summary: 'Foggy conditions. High humidity, low visibility. Indoor filming recommended.' },
  51: { condition: 'Light drizzle', summary: 'Light drizzle. Protect equipment if filming outdoors.' },
  53: { condition: 'Moderate drizzle', summary: 'Moderate drizzle. Protect equipment if filming outdoors.' },
  55: { condition: 'Dense drizzle', summary: 'Dense drizzle. Better to keep filming indoors.' },
  56: { condition: 'Freezing drizzle', summary: 'Freezing drizzle. Indoor filming highly recommended.' },
  57: { condition: 'Freezing drizzle', summary: 'Freezing drizzle. Indoor filming highly recommended.' },
  61: { condition: 'Light rain', summary: 'Light rain. Outdoor filming not recommended unless under cover.' },
  63: { condition: 'Moderate rain', summary: 'Rainy weather. Avoid filming outdoors to protect your gear.' },
  65: { condition: 'Heavy rain', summary: 'Heavy rain. Avoid filming outdoors to protect your gear.' },
  66: { condition: 'Freezing rain', summary: 'Freezing rain. Keep filming indoors today.' },
  67: { condition: 'Freezing rain', summary: 'Freezing rain. Keep filming indoors today.' },
  71: { condition: 'Light snow', summary: 'Light snow. Beautiful winter backdrop, but keep gear warm and dry.' },
  73: { condition: 'Moderate snow', summary: 'Snowing. Cold temperatures. Protect gear and consider filming inside.' },
  75: { condition: 'Heavy snow', summary: 'Heavy snow. Avoid outdoor filming today.' },
  77: { condition: 'Snow grains', summary: 'Snow grains. Indoor filming recommended.' },
  80: { condition: 'Light rain showers', summary: 'Light rain showers. Intermittent rain. Stay flexible or film indoors.' },
  81: { condition: 'Moderate rain showers', summary: 'Rain showers. Intermittent rain. Stay flexible or film indoors.' },
  82: { condition: 'Violent rain showers', summary: 'Violent rain showers. Stay safe and film indoors.' },
  85: { condition: 'Light snow showers', summary: 'Light snow showers. Winter conditions. Be careful if shooting outside.' },
  86: { condition: 'Heavy snow showers', summary: 'Heavy snow showers. Winter conditions. Be careful if shooting outside.' },
  95: { condition: 'Thunderstorm', summary: 'Thunderstorm warning. High risk. Stay safe and film indoors.' },
  96: { condition: 'Thunderstorm with hail', summary: 'Thunderstorm with hail. High risk. Stay safe and film indoors.' },
  99: { condition: 'Thunderstorm with hail', summary: 'Thunderstorm with hail. High risk. Stay safe and film indoors.' },
};

async function getVancouverWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=49.2827&longitude=-123.1207&current=temperature_2m,weather_code&timezone=America/Vancouver';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (data && data.current) {
      const code = data.current.weather_code;
      const temp = data.current.temperature_2m;
      const info = WMO_MAPPING[code] || { condition: 'Clear', summary: 'Clear conditions. Good for filming.' };
      return {
        temp: `${Math.round(temp)}°C`,
        condition: info.condition,
        summary: info.summary
      };
    }
  } catch (error) {
    console.error('Failed to fetch Vancouver weather from Open-Meteo:', error.message);
  }
  
  // Default fallback if API fails
  return {
    temp: '17°C',
    condition: 'Sunny & clear',
    summary: 'Perfect conditions to film outside — great light all morning and afternoon.'
  };
}

module.exports = { getVancouverWeather };
