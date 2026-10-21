'use client';

import { useState, useSyncExternalStore } from 'react';
import { formatInputRange, toMiles, FUEL_UNITS_STORAGE_KEY, UNITS_STORAGE_KEY, UnitSystem } from '@/lib/measurements';

const UNITS_EVENT = 'go-go-gas-units-change';
const getUnits = (): UnitSystem => document.documentElement.dataset.units === 'metric' ? 'metric' : 'us';
const getFuelUnits = (): UnitSystem => document.documentElement.dataset.fuelUnits === 'metric' ? 'metric' : 'us';
const getServerUnits = (): UnitSystem => 'us';
const subscribe = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UNITS_STORAGE_KEY && event.key !== FUEL_UNITS_STORAGE_KEY && event.key !== null) return;
    const units = event.newValue === 'metric' ? 'metric' : 'us';
    if (event.key === UNITS_STORAGE_KEY || event.key === null) document.documentElement.dataset.units = units;
    if (event.key === FUEL_UNITS_STORAGE_KEY || event.key === null) document.documentElement.dataset.fuelUnits = units;
    onChange();
  };
  window.addEventListener(UNITS_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(UNITS_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

export const setUnits = (units: UnitSystem) => {
  document.documentElement.dataset.units = units;
  try { localStorage.setItem(UNITS_STORAGE_KEY, units); } catch {
    // Keep the preference usable for this session if persistence is unavailable.
  }
  window.dispatchEvent(new Event(UNITS_EVENT));
};

export const useMeasurements = () => useSyncExternalStore(subscribe, getUnits, getServerUnits);
export const useFuelUnits = () => useSyncExternalStore(subscribe, getFuelUnits, getServerUnits);

export const setFuelUnits = (units: UnitSystem) => {
  document.documentElement.dataset.fuelUnits = units;
  try { localStorage.setItem(FUEL_UNITS_STORAGE_KEY, units); } catch {
    // Fuel units remain independent when browser storage is blocked.
  }
  window.dispatchEvent(new Event(UNITS_EVENT));
};

// Store the exact physical range separately from the editable text. Merely switching
// units never rounds/re-saves the underlying value or reinterprets an existing draft.
export const useRangeInput = (units: UnitSystem) => {
  const [draft, setDraft] = useState<{ text: string; units: UnitSystem; miles: number | null }>({ text: '', units, miles: null });
  const value = draft.units === units || draft.miles === null
    ? draft.text : formatInputRange(draft.miles, units);
  const onChange = (text: string) => setDraft({
    text, units,
    miles: text.trim() === '' || !Number.isFinite(Number(text)) ? null : toMiles(Number(text), units),
  });
  return { value, miles: draft.miles, onChange };
};
