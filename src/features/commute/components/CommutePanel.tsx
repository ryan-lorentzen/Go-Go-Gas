'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Fuel, LoaderCircle, MapPin, Navigation, Trash2 } from 'lucide-react';
import { FuelGradeControl } from '@/components/FuelGradeControl';
import { StatusMessage } from '@/components/StatusMessage';

import {
  createCommutePlan,
  DestinationSuggestion,
  resolveDestinationSuggestion,
  searchDestinationSuggestions,
} from '@/Commute/client';
import {
  getLegAfterCurrentStop,
  getNextCommuteStop,
  getSafeRangeMiles,
  METERS_PER_MILE,
} from '@/lib/commute';
import { getWebDirectionsUrl, openPreferredDirections } from '@/lib/mapLinks';
import { useCommuteStore } from '@/store/useCommuteStore';
import { FuelGrade, GeocodedDestination, RouteWaypoint } from '@/types';

const formatMiles = (distanceMeters: number) => `${(distanceMeters / METERS_PER_MILE).toFixed(1)} mi`;
const createSessionToken = () => crypto.randomUUID();

const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours === 0 ? `${minutes} min` : `${hours} hr${remainingMinutes ? ` ${remainingMinutes} min` : ''}`;
};

interface CommutePanelProps {
  origin: RouteWaypoint | null;
  locationErrorMessage: string | null;
  onPlanReady: () => void;
  onViewMap: () => void;
}

export const CommutePanel = ({
  origin,
  locationErrorMessage,
  onPlanReady,
  onViewMap,
}: CommutePanelProps) => {
  const { plan, hasHydrated, setPlan, clearPlan, acceptRangeAndAdvance } = useCommuteStore();
  const [address, setAddress] = useState('');
  const [currentRange, setCurrentRange] = useState('');
  const [fullTankRange, setFullTankRange] = useState('');
  const [fuelGrade, setFuelGrade] = useState<FuelGrade>('regular');
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSuggestion[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<GeocodedDestination | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [arrivalRange, setArrivalRange] = useState('');
  const autocompleteControllerRef = useRef<AbortController | null>(null);
  const resolveControllerRef = useRef<AbortController | null>(null);
  const planningControllerRef = useRef<AbortController | null>(null);
  const nextStop = plan ? getNextCommuteStop(plan) : null;
  const gasStopCount = plan?.stops.filter((stop) => stop.type === 'gas').length ?? 0;
  const safeCurrentRange = useMemo(() => {
    const range = Number(currentRange);
    return Number.isFinite(range) && range > 0 ? getSafeRangeMiles(range) : null;
  }, [currentRange]);

  useEffect(() => {
    const trimmedAddress = address.trim();
    if (selectedDestination || isResolvingAddress || trimmedAddress.length < 3) {
      autocompleteControllerRef.current?.abort();
      setDestinationSuggestions([]);
      setActiveSuggestionIndex(-1);
      setIsSearchingAddress(false);
      return;
    }

    const controller = new AbortController();
    autocompleteControllerRef.current?.abort();
    autocompleteControllerRef.current = controller;
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        const suggestions = await searchDestinationSuggestions(
          trimmedAddress,
          sessionToken,
          origin,
          controller.signal
        );
        setDestinationSuggestions(suggestions);
        setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDestinationSuggestions([]);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load address suggestions.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingAddress(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [address, isResolvingAddress, origin, selectedDestination, sessionToken]);

  const selectSuggestion = async (suggestion: DestinationSuggestion) => {
    autocompleteControllerRef.current?.abort();
    resolveControllerRef.current?.abort();
    const controller = new AbortController();
    resolveControllerRef.current = controller;
    setAddress(suggestion.text);
    setDestinationSuggestions([]);
    setActiveSuggestionIndex(-1);
    setErrorMessage(null);
    setIsResolvingAddress(true);

    try {
      const destination = await resolveDestinationSuggestion(
        suggestion.placeId,
        suggestion.mainText,
        sessionToken,
        controller.signal
      );
      setAddress(destination.address);
      setSelectedDestination(destination);
    } catch (error) {
      if (!controller.signal.aborted) {
        setSelectedDestination(null);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to resolve that address.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsResolvingAddress(false);
      }
    }
  };

  const handleAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (destinationSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % destinationSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (
        current <= 0 ? destinationSuggestions.length - 1 : current - 1
      ));
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(destinationSuggestions[activeSuggestionIndex]);
    } else if (event.key === 'Escape') {
      setDestinationSuggestions([]);
      setActiveSuggestionIndex(-1);
    }
  };

  const planToDestination = async (destination: GeocodedDestination) => {
    if (!origin) {
      setErrorMessage(locationErrorMessage ?? 'Your current location is required to plan a route.');
      return;
    }

    const currentRangeMiles = Number(currentRange);
    const fullTankRangeMiles = Number(fullTankRange);
    if (
      !Number.isFinite(currentRangeMiles)
      || !Number.isFinite(fullTankRangeMiles)
      || currentRangeMiles <= 5
      || fullTankRangeMiles <= 5
    ) {
      setErrorMessage('Enter current and full-tank ranges greater than 5 miles.');
      return;
    }

    planningControllerRef.current?.abort();
    const controller = new AbortController();
    planningControllerRef.current = controller;
    setErrorMessage(null);
    setIsPlanning(true);

    try {
      const nextPlan = await createCommutePlan({
        origin,
        destination,
        currentRangeMiles,
        fullTankRangeMiles,
        fuelGrade,
      }, controller.signal);
      setPlan(nextPlan);
      onPlanReady();
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to plan a safe route.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsPlanning(false);
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDestination) {
      setErrorMessage('Choose a destination from the address suggestions first.');
      return;
    }

    void planToDestination(selectedDestination);
  };

  const handleArrivalRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!plan) {
      return;
    }

    const rangeMiles = Number(arrivalRange);
    const nextLeg = getLegAfterCurrentStop(plan);
    if (!Number.isFinite(rangeMiles) || rangeMiles <= 5) {
      setErrorMessage('Enter an estimated range greater than 5 miles.');
      return;
    }

    if (nextLeg && getSafeRangeMiles(rangeMiles) * METERS_PER_MILE < nextLeg.distanceMeters) {
      setErrorMessage(
        `That range is not enough to safely cover the next ${formatMiles(nextLeg.distanceMeters)} leg. Add fuel and enter the updated range.`
      );
      return;
    }

    setErrorMessage(null);
    setArrivalRange('');
    acceptRangeAndAdvance(rangeMiles);
    const followingStop = plan.stops[Math.min(plan.currentStopIndex + 1, plan.stops.length - 1)];
    if (followingStop) {
      openPreferredDirections(followingStop);
    }
  };

  if (!hasHydrated) {
    return (
      <div className="surface w-full p-4" role="status">
        <p className="text-sm text-muted-foreground">Loading your saved commute…</p>
      </div>
    );
  }

  const planningForm = (
      <details className="planner-section surface" open={!plan}>
        <summary>{plan ? 'Plan another route' : 'Plan your route'}<ChevronDown className="ml-auto" size={16} aria-hidden="true" /></summary>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div>
            <label htmlFor="commute-address" className="field-label">Destination</label>
            <div className="relative mt-2">
              <MapPin aria-hidden="true" size={18} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                id="commute-address"
                value={address}
                onChange={(event) => {
                  if (selectedDestination) {
                    setSessionToken(createSessionToken());
                  }
                  setAddress(event.target.value);
                  setSelectedDestination(null);
                  setErrorMessage(null);
                }}
                onKeyDown={handleAddressKeyDown}
                placeholder="Search an address or place"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={destinationSuggestions.length > 0}
                aria-controls="commute-address-suggestions"
                aria-activedescendant={activeSuggestionIndex >= 0 ? `commute-address-suggestion-${activeSuggestionIndex}` : undefined}
                className="form-input pl-10 pr-11"
                maxLength={160}
                required
              />
              <span className="absolute right-3 top-3.5 text-slate-400" aria-hidden="true">
                {isSearchingAddress || isResolvingAddress
                  ? <LoaderCircle size={18} className="animate-spin" />
                  : selectedDestination ? <Check size={18} className="text-emerald-600" /> : null}
              </span>

              {destinationSuggestions.length > 0 && (
                <div
                  id="commute-address-suggestions"
                  role="listbox"
                  className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 max-h-64 overflow-y-auto rounded-lg border bg-white shadow-md"
                >
                  {destinationSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.placeId}
                      id={`commute-address-suggestion-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeSuggestionIndex === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => void selectSuggestion(suggestion)}
                      className={`block min-h-11 w-full border-b px-3 py-3 text-left last:border-b-0 ${activeSuggestionIndex === index ? 'bg-secondary' : 'bg-white hover:bg-secondary'}`}
                    >
                      <span className="block text-sm font-semibold">{suggestion.mainText}</span>
                      {suggestion.secondaryText && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.secondaryText}</span>
                      )}
                    </button>
                  ))}
                  <div className="bg-secondary px-3 py-2 text-right text-[11px] text-muted-foreground">
                    Powered by Google
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedDestination ? 'Destination confirmed.' : 'Type three or more characters and choose a suggestion.'}
            </p>
          </div>

          <div className="range-fields">
            <div>
              <label htmlFor="current-range" className="field-label">Current range (mi)</label>
              <input
                id="current-range"
                type="number"
                inputMode="decimal"
                min="6"
                max="1000"
                step="1"
                value={currentRange}
                onChange={(event) => setCurrentRange(event.target.value)}
                placeholder="400"
                className="form-input mt-2"
                required
              />
              {safeCurrentRange !== null && (
                <p className="mt-2 text-xs text-muted-foreground">First stop within {safeCurrentRange.toFixed(0)} safe miles.</p>
              )}
            </div>
            <div>
              <label htmlFor="full-tank-range" className="field-label">Full-tank range (mi)</label>
              <input
                id="full-tank-range"
                type="number"
                inputMode="decimal"
                min="6"
                max="1000"
                step="1"
                value={fullTankRange}
                onChange={(event) => setFullTankRange(event.target.value)}
                placeholder="420"
                className="form-input mt-2"
                required
              />
            </div>
          </div>

          <FuelGradeControl value={fuelGrade} onChange={setFuelGrade} />

          <button
            type="submit"
            disabled={!origin || !selectedDestination || isSearchingAddress || isResolvingAddress || isPlanning}
            className="action-primary w-full"
          >
            {isPlanning ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin" /> : <Navigation aria-hidden="true" size={18} />}
            {isPlanning ? 'Planning safe stops…' : 'Plan route'}
          </button>

          {!origin && (
            <p className="status-message status-error" role="status">{locationErrorMessage ?? 'Waiting for your current location.'}</p>
          )}
        </form>
      </details>
  );

  return (
    <div className="commute-panel flex w-full flex-col gap-4">
      {errorMessage && <StatusMessage message={errorMessage} />}
      {plan && (
        <section className="saved-plan surface p-4" aria-labelledby="active-route-heading">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Saved in this browser for up to 7 days</p>
              <h3 id="active-route-heading" className="mt-1 text-lg font-semibold break-words">{plan.destination.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                planningControllerRef.current?.abort();
                clearPlan();
                setErrorMessage(null);
              }}
              className="action-quiet shrink-0"
              aria-label="Clear saved commute plan"
            >
              <Trash2 aria-hidden="true" size={16} /> Clear
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-y py-3 text-sm tabular-nums">
            <div><dt className="text-xs text-muted-foreground">Distance</dt><dd className="mt-1 font-semibold">{formatMiles(plan.totalDistanceMeters)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Drive time</dt><dd className="mt-1 font-semibold">{formatDuration(plan.totalDurationSeconds)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fuel stops</dt><dd className="mt-1 font-semibold">{gasStopCount}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Last entered range: <span className="font-semibold tabular-nums">{plan.currentRangeMiles} mi</span></p>

          {plan.status === 'completed' ? (
            <div className="mt-4 rounded-lg bg-green-50 p-3 text-green-900" role="status">
              <p className="font-semibold">Destination reached</p>
              <p className="mt-1 text-sm">This completed route remains saved until you clear or replace it.</p>
            </div>
          ) : plan.status === 'awaiting_range' ? (
            <form onSubmit={handleArrivalRange} className="status-message status-warning mt-4">
              <div className="flex items-start gap-2">
                <Fuel aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold break-words">You are near {nextStop?.name}</h4>
                  <p className="mt-1 text-sm">Enter your updated range before continuing.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="arrival-range" className="sr-only">Updated estimated range in miles</label>
                    <input
                      id="arrival-range"
                      type="number"
                      inputMode="decimal"
                      min="6"
                      max="1000"
                      step="1"
                      value={arrivalRange}
                      onChange={(event) => setArrivalRange(event.target.value)}
                      placeholder="Updated miles"
                      className="form-input flex-1"
                      required
                    />
                    <button type="submit" className="action-primary">Continue</button>
                  </div>
                </div>
              </div>
            </form>
          ) : nextStop && (
            <div className="next-stop mt-4">
              <p className="text-xs font-semibold text-primary">Next {nextStop.type === 'gas' ? `stop ${plan.currentStopIndex + 1}` : 'destination'}</p>
              <p className="mt-1 font-semibold break-words">{nextStop.name}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words">{nextStop.address}</p>
              {nextStop.pricePerGallon !== undefined && (
                <p className="mt-2 text-sm font-bold text-green-800 tabular-nums">${nextStop.pricePerGallon.toFixed(2)}/gal</p>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <a
                  href={getWebDirectionsUrl(nextStop)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    openPreferredDirections(nextStop);
                  }}
                  className="action-primary flex-1"
                >
                  <Navigation aria-hidden="true" size={18} /> Open next stop in Maps
                </a>
                <button type="button" onClick={onViewMap} className="action-secondary">View route</button>
              </div>
            </div>
          )}

          <h4 className="mt-5 text-sm font-semibold">Your stops</h4>
          <ol className="mt-1">
            {plan.stops.map((stop, index) => (
              <li key={stop.id} className="stop-row" data-state={plan.status === 'completed' || index < plan.currentStopIndex ? 'completed' : index === plan.currentStopIndex ? 'current' : 'upcoming'} aria-current={plan.status !== 'completed' && index === plan.currentStopIndex ? 'step' : undefined}>
                <span className="stop-number" aria-hidden="true">
                  {plan.status === 'completed' || index < plan.currentStopIndex ? <Check size={15} /> : stop.type === 'gas' ? index + 1 : <MapPin size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold break-words">{stop.name}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.status === 'completed' || index < plan.currentStopIndex ? 'Completed' : index === plan.currentStopIndex ? plan.status === 'awaiting_range' ? 'Update range to continue' : 'Current stop' : 'Upcoming'}</p>
                  <p className="mt-1 text-xs text-muted-foreground break-words">{stop.address}</p>
                  {plan.legs[index] && <p className="mt-1 text-xs text-muted-foreground">{formatMiles(plan.legs[index].distanceMeters)} from previous point</p>}
                </div>
                {stop.pricePerGallon !== undefined && <span className="text-sm font-bold text-green-800 tabular-nums">${stop.pricePerGallon.toFixed(2)}<span className="block text-right text-xs font-normal text-muted-foreground">/gal</span></span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {planningForm}
    </div>
  );
};
