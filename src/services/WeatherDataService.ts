import axios from 'axios';
import { resolveCredential } from '../shared/config/userCredentialStore';
import { getProxiedUrl } from '../utils/ProxyUtils';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'WeatherDataService' });

interface WeatherData {
  location: string;
  temperature: number;
  description: string;
  windSpeed: number;
  humidity: number;
}

interface WeatherForecastData {
  dateTime: string;
  temperature: number;
  description: string;
  windSpeed: number;
  humidity: number;
}

export const fetchWeatherData = async (lat: number, lng: number): Promise<WeatherData> => {
  try {
    // User-supplied key first, so someone who brings their own gets their own
    // quota rather than sharing an operator's.
    const apiKey = resolveCredential('openweathermap').value ?? '';
    const response = await axios.get(
      getProxiedUrl(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`)
    );

    const data = response.data;
    return {
      location: data.name,
      temperature: data.main.temp,
      description: data.weather[0].description,
      windSpeed: data.wind.speed,
      humidity: data.main.humidity,
    };
  } catch (error) {
    if(axios.isAxiosError(error)) {
      log.error('Error fetching weather data:', error.response ? error.response.data : error.message);
    } else{
      log.error('Error fetching weather data:', error);
    }
    throw new Error('Failed to fetch weather data. Please try again later.');
  }
};

export const fetchWeatherForecast = async (lat: number, lng: number): Promise<WeatherForecastData[]> => {
  try {
    // Same resolution as fetchWeatherData above. This read env directly, so a
    // user who brought their own key got it honoured for current conditions and
    // silently ignored for the forecast — and with no operator fallback set, it
    // sent an empty key and failed for everyone. BYOK applied per-function
    // rather than per-service is BYOK that does not work.
    const apiKey = resolveCredential('openweathermap').value ?? '';
    const response = await axios.get(
      getProxiedUrl(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`)
    );

    return response.data.list.map((entry: WeatherForecastEntry) => ({
      dateTime: entry.dt_txt,
      temperature: entry.main.temp,
      description: entry.weather[0].description,
      windSpeed: entry.wind.speed,
      humidity: entry.main.humidity,
    }));
  } catch (error) {
    if(axios.isAxiosError(error)) {
      log.error('Error fetching weather forecast:', error.response ? error.response.data : error.message);
    } else{
      log.error('Error fetching weather forecast:', error);
    }
    throw new Error('Failed to fetch weather forecast. Please try again later.');
  }
};

interface WeatherForecastEntry {
  dt_txt: string;
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{ description: string }>;
  wind: { speed: number };
}
