'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getMapTheme, getServerTheme, getTheme, setMapTheme, setTheme, subscribeToTheme } from '@/lib/theme';
import { setFuelUnits, setUnits, useFuelUnits, useMeasurements } from '@/lib/useMeasurements';

export function ThemeSetting() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
  const isDark = theme === 'dark';
  const mapTheme = useSyncExternalStore(subscribeToTheme, getMapTheme, getServerTheme);
  const isMapDark = mapTheme === 'dark';
  const units = useMeasurements();
  const fuelUnits = useFuelUnits();

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#171717' : '#ffffff';
  }, [isDark]);

  return (
    <div className="surface divide-y divide-border">
      <div className="flex items-center justify-between gap-4 p-4">
        <p id="dark-mode-label" className="text-sm font-semibold">Dark mode</p>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-labelledby="dark-mode-label"
          className="theme-switch"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          <span className="theme-switch__track" aria-hidden="true"><span className="theme-switch__thumb" /></span>
        </button>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <p id="dark-map-label" className="text-sm font-semibold">Dark map</p>
        <button
          type="button"
          role="switch"
          aria-checked={isMapDark}
          aria-labelledby="dark-map-label"
          className="theme-switch"
          onClick={() => setMapTheme(isMapDark ? 'light' : 'dark')}
        >
          <span className="theme-switch__track" aria-hidden="true"><span className="theme-switch__thumb" /></span>
        </button>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <p id="metric-units-label" className="text-sm font-semibold">Metric distance units</p>
        <button
          type="button"
          role="switch"
          aria-checked={units === 'metric'}
          aria-labelledby="metric-units-label"
          className="theme-switch"
          onClick={() => setUnits(units === 'metric' ? 'us' : 'metric')}
        >
          <span className="theme-switch__track" aria-hidden="true"><span className="theme-switch__thumb" /></span>
        </button>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <p id="metric-fuel-units-label" className="text-sm font-semibold">Metric fuel units</p>
        <button
          type="button"
          role="switch"
          aria-checked={fuelUnits === 'metric'}
          aria-labelledby="metric-fuel-units-label"
          className="theme-switch"
          onClick={() => setFuelUnits(fuelUnits === 'metric' ? 'us' : 'metric')}
        >
          <span className="theme-switch__track" aria-hidden="true"><span className="theme-switch__thumb" /></span>
        </button>
      </div>
    </div>
  );
}
