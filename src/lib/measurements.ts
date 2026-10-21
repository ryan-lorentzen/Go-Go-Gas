export type UnitSystem = 'us' | 'metric';

export const UNITS_STORAGE_KEY = 'go-go-gas-units';
export const FUEL_UNITS_STORAGE_KEY = 'go-go-gas-fuel-units';
export const METERS_PER_MILE = 1609.344;
export const LITERS_PER_US_GALLON = 3.785411784;

export const fromMiles = (miles: number, units: UnitSystem) =>
  units === 'metric' ? miles * METERS_PER_MILE / 1000 : miles;
export const toMiles = (value: number, units: UnitSystem) =>
  units === 'metric' ? value * 1000 / METERS_PER_MILE : value;
export const distanceUnit = (units: UnitSystem) => units === 'metric' ? 'km' : 'mi';
export const volumeUnit = (units: UnitSystem) => units === 'metric' ? 'L' : 'gal';
export const formatDistance = (meters: number, units: UnitSystem) =>
  `${(units === 'metric' ? meters / 1000 : meters / METERS_PER_MILE).toFixed(1)} ${distanceUnit(units)}`;
export const formatRange = (miles: number, units: UnitSystem) =>
  `${Number(fromMiles(miles, units).toFixed(1))} ${distanceUnit(units)}`;
export const formatInputRange = (miles: number, units: UnitSystem) =>
  String(Number(fromMiles(miles, units).toFixed(6)));
export const formatFuelPrice = (pricePerGallon: number, units: UnitSystem) =>
  `$${(units === 'metric' ? pricePerGallon / LITERS_PER_US_GALLON : pricePerGallon).toFixed(2)}`;

export const formatInstructionDistance = (meters: number, units: UnitSystem) => {
  if (units === 'metric') return meters < 1000 ? `${Math.round(meters)} m` : formatDistance(meters, units);
  return meters < METERS_PER_MILE ? `${Math.round(meters / 0.9144)} yd` : formatDistance(meters, units);
};

// API errors use canonical US units. Convert their numeric measurements at render time.
export const formatMeasurementMessage = (message: string, units: UnitSystem) =>
  units === 'us' ? message : message.replace(/(\d[\d,]*(?:\.\d+)?)\s+(?:miles|mi)\b/g,
    (_, value: string) => `${Number(fromMiles(Number(value.replaceAll(',', '')), units).toFixed(5))} km`);
