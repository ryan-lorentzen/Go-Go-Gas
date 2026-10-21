'use client';

import { getLiveGasStations } from '@/GasPrices/client';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { ChevronDown, MapPinned, Navigation, Route, Search, Settings } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CommutePanel } from '@/features/commute/components/CommutePanel';
import { FuelGradeControl } from '@/components/FuelGradeControl';
import { StatusMessage } from '@/components/StatusMessage';
import { ThemeSetting } from '@/components/ThemeSetting';
import { USER_LOCATION_ICON_URL } from '@/features/map/user-location-icon';
import { getWebDirectionsUrl, openPreferredDirections } from '@/lib/mapLinks';
import { buildTripPlan } from '@/features/map/components/routing-engine';
import { COMMUTE_ARRIVAL_RADIUS_METERS, getNextCommuteStop } from '@/lib/commute';
import { getRouteMetrics, haversineDistance } from '@/lib/routingUtils';
import { useCommuteStore } from '@/store/useCommuteStore';
import { useLocationStore } from '@/store/useLocationStore';
import { FuelGrade, FuelPriceOption, GasStation, RouteDirections, RouteLegEstimate, TripEstimateSummary } from '@/types';

const PriceMap = dynamic(() => import('@/features/map/components/PriceMap').then(mod => mod.PriceMap), { ssr: false });

interface GasStationWithDistance extends GasStation {
  distanceMiles: number | null;
  gasScore: number | null;
}

type GasSortMode = 'best' | 'price' | 'distance';
type AppTab = 'home' | 'map' | 'commute' | 'settings';

const FUEL_GRADE_OPTIONS: { value: FuelGrade; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'midgrade', label: 'Midgrade' },
  { value: 'premium', label: 'Premium' },
  { value: 'diesel', label: 'Diesel' },
];

const METERS_PER_MILE = 1_609.34;
const MIN_SEARCH_RADIUS_MILES = 2;
const MAX_SEARCH_RADIUS_MILES = 15;
const DEFAULT_SEARCH_RADIUS_MILES = 4;
const SECONDS_PER_MINUTE = 60;
const GAS_CACHE_LOCATION_PRECISION = 3;
const DIRECT_DISTANCE_WEIGHT = 0.1;
const LOCATION_FETCH_TIMEOUT_MS = 15_000;

interface CachedGasStationsEntry {
  fetchedRadiusMeters: number;
  stations: GasStation[];
}

const formatMiles = (distanceMeters: number) => `${(distanceMeters / METERS_PER_MILE).toFixed(1)} mi`;
const buildGasCacheKey = (latitude: number, longitude: number) =>
  `${latitude.toFixed(GAS_CACHE_LOCATION_PRECISION)}:${longitude.toFixed(GAS_CACHE_LOCATION_PRECISION)}`;

const formatFuelGradeLabel = (fuelGrade: FuelGrade) =>
  FUEL_GRADE_OPTIONS.find((option) => option.value === fuelGrade)?.label ?? fuelGrade;

const formatUpdatedTime = (timestamp?: string) => {
  if (!timestamp) {
    return null;
  }

  const parsedDate = new Date(timestamp);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
};

const formatDuration = (durationSeconds: number) => {
  const roundedMinutes = Math.max(1, Math.round(durationSeconds / SECONDS_PER_MINUTE));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) {
    return `${roundedMinutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
};

interface SearchControlsProps {
  idPrefix: string;
  selectedFuelGrade: FuelGrade;
  searchRadiusMiles: number;
  hasSearchedGas: boolean;
  gasStationsToDisplayCount: number;
  gasStationsInRadiusCount: number;
  isGasStationsLoading: boolean;
  gasStationsErrorMessage: string | null;
  onFuelGradeChange: (fuelGrade: FuelGrade) => void;
  onSearchRadiusChange: (radiusMiles: number) => void;
}

const SearchControls = ({
  idPrefix,
  selectedFuelGrade,
  searchRadiusMiles,
  hasSearchedGas,
  gasStationsToDisplayCount,
  gasStationsInRadiusCount,
  isGasStationsLoading,
  gasStationsErrorMessage,
  onFuelGradeChange,
  onSearchRadiusChange,
}: SearchControlsProps) => (
  <div className="space-y-3">
    <FuelGradeControl value={selectedFuelGrade} onChange={onFuelGradeChange} />
    <div className="flex items-center gap-3">
      <label htmlFor={`${idPrefix}-radius`} className="field-label shrink-0">Radius</label>
      <input id={`${idPrefix}-radius`} type="range" min={MIN_SEARCH_RADIUS_MILES}
        max={MAX_SEARCH_RADIUS_MILES} step={1} value={searchRadiusMiles}
        onChange={(event) => onSearchRadiusChange(Number(event.target.value))}
        className="min-h-11 min-w-0 flex-1 accent-primary" />
      <output htmlFor={`${idPrefix}-radius`} className="w-12 text-right text-sm font-semibold tabular-nums">{searchRadiusMiles} mi</output>
    </div>
    <div aria-live="polite" className="text-xs text-muted-foreground">
      {isGasStationsLoading ? <p role="status">Finding live prices…</p> : hasSearchedGas && (
        <p>{gasStationsToDisplayCount} stations with {formatFuelGradeLabel(selectedFuelGrade).toLowerCase()} prices within {searchRadiusMiles} mi.</p>
      )}
      {gasStationsErrorMessage && <StatusMessage message={gasStationsErrorMessage} className="mt-2" />}
      {hasSearchedGas && !isGasStationsLoading && gasStationsInRadiusCount > 0 && gasStationsToDisplayCount === 0 && (
        <p className="mt-2">No {formatFuelGradeLabel(selectedFuelGrade).toLowerCase()} prices available here. Try another fuel grade.</p>
      )}
    </div>
  </div>
);

export default function Home() {
  const { latitude, longitude, accuracyMeters, setLocation } = useLocationStore();
  const { plan: commutePlan, hasHydrated: hasCommuteHydrated, markCurrentStopReached, completePlan } = useCommuteStore();

  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [isLocationFetching, setIsLocationFetching] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [hasSearchedGas, setHasSearchedGas] = useState(false);
  const [selectedGasStationId, setSelectedGasStationId] = useState<string | null>(null);
  const [directions, setDirections] = useState<RouteDirections | null>(null);
  const [selectedFuelGrade, setSelectedFuelGrade] = useState<FuelGrade>('regular');
  const [searchRadiusMiles, setSearchRadiusMiles] = useState(DEFAULT_SEARCH_RADIUS_MILES);
  const [isBestGasExpanded, setIsBestGasExpanded] = useState(true);
  const [gasSortMode, setGasSortMode] = useState<GasSortMode>('best');
  const [tripEstimateSummary, setTripEstimateSummary] = useState<TripEstimateSummary | null>(null);
  const [isTripEstimateLoading, setIsTripEstimateLoading] = useState(false);
  const [gasStationsInRadius, setGasStationsInRadius] = useState<GasStation[]>([]);
  const [gasStationsErrorMessage, setGasStationsErrorMessage] = useState<string | null>(null);
  const [isGasStationsLoading, setIsGasStationsLoading] = useState(false);
  const [localGasSearchOrigin, setLocalGasSearchOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const gasStationsCacheRef = useRef<Map<string, CachedGasStationsEntry>>(new Map());

  const searchRadiusMeters = useMemo(
    () => searchRadiusMiles * METERS_PER_MILE,
    [searchRadiusMiles]
  );
  const userLocation = useMemo(
    () => (latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null),
    [latitude, longitude]
  );
  const isLocalGasContext = activeTab === 'home'
    || (activeTab === 'map' && (!commutePlan || selectedGasStationId !== null));
  const localGasLocation = commutePlan && localGasSearchOrigin ? localGasSearchOrigin : userLocation;

  const gasStationsForSelectedFuel = useMemo(() => {
    return gasStationsInRadius.flatMap((station) => {
      const selectedFuelPrice: FuelPriceOption | null =
        station.fuelPrices?.[selectedFuelGrade]
        ?? (
          selectedFuelGrade === 'regular'
            ? {
                fuelType: station.fuelType ?? 'REGULAR_UNLEADED',
                pricePerGallon: station.pricePerGallon,
                priceUpdatedAt: station.priceUpdatedAt,
              }
            : null
        );

      if (!selectedFuelPrice) {
        return [];
      }

      return [{
        ...station,
        fuelType: selectedFuelPrice.fuelType,
        pricePerGallon: selectedFuelPrice.pricePerGallon,
        priceUpdatedAt: selectedFuelPrice.priceUpdatedAt,
      }];
    });
  }, [gasStationsInRadius, selectedFuelGrade]);

  const gasStationsWithDistance: GasStationWithDistance[] = useMemo(() => {
    return gasStationsForSelectedFuel.map((station) => {
      const distanceMiles = localGasLocation
        ? haversineDistance(
            localGasLocation.lat,
            localGasLocation.lng,
            station.coordinates.lat,
            station.coordinates.lng
          ) / METERS_PER_MILE
        : null;

      return {
        ...station,
        distanceMiles,
        gasScore: distanceMiles === null
          ? null
          : distanceMiles * DIRECT_DISTANCE_WEIGHT + station.pricePerGallon,
      };
    });
  }, [gasStationsForSelectedFuel, localGasLocation]);

  const gasStationsToDisplay = useMemo(() => {
    const comparableStations = gasStationsWithDistance.filter(
      (station): station is GasStationWithDistance & { distanceMiles: number; gasScore: number } =>
        station.distanceMiles !== null && station.gasScore !== null
    );

    if (comparableStations.length === 0) {
      return gasStationsWithDistance;
    }

    if (gasSortMode === 'price') {
      return [...comparableStations].sort((a, b) => {
        if (a.pricePerGallon !== b.pricePerGallon) {
          return a.pricePerGallon - b.pricePerGallon;
        }

        return a.distanceMiles - b.distanceMiles;
      });
    }

    if (gasSortMode === 'distance') {
      return [...comparableStations].sort((a, b) => {
        if (a.distanceMiles !== b.distanceMiles) {
          return a.distanceMiles - b.distanceMiles;
        }

        return a.pricePerGallon - b.pricePerGallon;
      });
    }

    return [...comparableStations].sort((a, b) => {
      if (a.gasScore !== b.gasScore) {
        return a.gasScore - b.gasScore;
      }

      return a.pricePerGallon - b.pricePerGallon;
    });
  }, [gasSortMode, gasStationsWithDistance]);

  const activeSelectedGasStationId = useMemo(
    () => (
      selectedGasStationId && gasStationsToDisplay.some((station) => station.id === selectedGasStationId)
        ? selectedGasStationId
        : null
    ),
    [selectedGasStationId, gasStationsToDisplay]
  );

  const selectedGasStation = useMemo(
    () => gasStationsToDisplay.find(station => station.id === activeSelectedGasStationId) ?? null,
    [activeSelectedGasStationId, gasStationsToDisplay]
  );

  const tripPlan = useMemo(
    () => buildTripPlan({
      userLocation: localGasLocation,
      gasStations: selectedGasStation ? [selectedGasStation] : [],
    }),
    [localGasLocation, selectedGasStation]
  );

  const dynamicWaypoints = useMemo(
    () => {
      if (tripPlan?.orderedStops.length) {
        return tripPlan.orderedStops.map(stop => stop.coordinates);
      }

      return [];
    },
    [tripPlan]
  );
  const directionsRouteKey = dynamicWaypoints.map(point => `${point.lat}-${point.lng}`).join('_');
  const currentDirections = directions?.routeKey === directionsRouteKey ? directions : null;

  useEffect(() => {
    const searchLatitude = localGasLocation?.lat ?? null;
    const searchLongitude = localGasLocation?.lng ?? null;
    if (!hasSearchedGas || searchLatitude === null || searchLongitude === null) {
      setGasStationsInRadius([]);
      setGasStationsErrorMessage(null);
      setIsGasStationsLoading(false);
      return;
    }

    if (!isLocalGasContext) {
      setIsGasStationsLoading(false);
      return;
    }

    let isActive = true;
    const abortController = new AbortController();
    const gasCacheKey = buildGasCacheKey(searchLatitude, searchLongitude);
    const cachedGasStations = gasStationsCacheRef.current.get(gasCacheKey);

    if (cachedGasStations) {
      const locallyFilteredStations = cachedGasStations.stations.filter((station) => {
        const distanceFromUserMeters = haversineDistance(
          searchLatitude,
          searchLongitude,
          station.coordinates.lat,
          station.coordinates.lng
        );

        return distanceFromUserMeters <= searchRadiusMeters;
      });

      setGasStationsInRadius(locallyFilteredStations);

      if (cachedGasStations.fetchedRadiusMeters >= searchRadiusMeters) {
        setGasStationsErrorMessage(null);
        setIsGasStationsLoading(false);
        return;
      }
    }

    const loadGasStations = async () => {
      setGasStationsErrorMessage(null);
      setIsGasStationsLoading(true);

      try {
        const stations = await getLiveGasStations({
          latitude: searchLatitude,
          longitude: searchLongitude,
          radiusMeters: searchRadiusMeters,
          signal: abortController.signal,
        });

        if (!isActive) {
          return;
        }

        gasStationsCacheRef.current.set(gasCacheKey, {
          fetchedRadiusMeters: searchRadiusMeters,
          stations,
        });
        setGasStationsInRadius(stations);
      } catch (error) {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        setGasStationsErrorMessage(
          error instanceof Error ? error.message : 'Unable to load live gas station prices.'
        );
      } finally {
        if (isActive) {
          setIsGasStationsLoading(false);
        }
      }
    };

    void loadGasStations();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [hasSearchedGas, isLocalGasContext, localGasLocation, searchRadiusMeters]);

  useEffect(() => {
    if (!tripPlan || tripPlan.orderedStops.length < 2) {
      setTripEstimateSummary(null);
      setIsTripEstimateLoading(false);
      return;
    }

    let isActive = true;

    const buildEstimateSummary = async () => {
      setTripEstimateSummary(null);
      setIsTripEstimateLoading(true);

      try {
        const legSummaries = await Promise.all(
          tripPlan.orderedStops.slice(1).map(async (stop, index) => {
            const previousStop = tripPlan.orderedStops[index];
            const metrics = await getRouteMetrics([
              previousStop.coordinates,
              stop.coordinates,
            ]);

            const leg: RouteLegEstimate = {
              fromStopId: previousStop.id,
              toStopId: stop.id,
              distanceMeters: metrics.distanceMeters,
              durationSeconds: metrics.durationSeconds,
            };

            return leg;
          })
        );

        const finalStop = tripPlan.orderedStops[tripPlan.orderedStops.length - 1];
        const startStop = tripPlan.orderedStops[0];
        const returnMetrics = await getRouteMetrics([
          finalStop.coordinates,
          startStop.coordinates,
        ]);

        if (!isActive) {
          return;
        }

        setTripEstimateSummary({
          legs: legSummaries,
          returnToStart: {
            fromStopId: finalStop.id,
            toStopId: startStop.id,
            distanceMeters: returnMetrics.distanceMeters,
            durationSeconds: returnMetrics.durationSeconds,
          },
        });
      } finally {
        if (isActive) {
          setIsTripEstimateLoading(false);
        }
      }
    };

    void buildEstimateSummary();

    return () => {
      isActive = false;
    };
  }, [tripPlan]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationErrorMessage('Location services are unavailable in this browser.');
      setIsLocationFetching(false);
      return;
    }

    let isActive = true;
    setIsLocationFetching(true);

    navigator.geolocation.getCurrentPosition(
      position => {
        if (!isActive) {
          return;
        }

        setLocationErrorMessage(null);
        setLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
        setIsLocationFetching(false);
      },
      error => {
        if (!isActive) {
          return;
        }

        const fallbackMessage =
          error.code === error.PERMISSION_DENIED
            ? 'Location access was denied. Enable it in your browser to search nearby gas stations.'
            : 'We could not determine your location. Check your browser settings and try again.';

        setLocationErrorMessage(fallbackMessage);
        setIsLocationFetching(false);
      },
      {
        enableHighAccuracy: false,
        timeout: LOCATION_FETCH_TIMEOUT_MS,
        maximumAge: 60_000,
      }
    );

    return () => {
      isActive = false;
    };
  }, [setLocation]);

  useEffect(() => {
    if (!hasCommuteHydrated || !commutePlan || commutePlan.status === 'completed' || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
        setLocationErrorMessage(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationErrorMessage('Location access was denied. Enable it to track progress on your commute.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: LOCATION_FETCH_TIMEOUT_MS,
        maximumAge: 30_000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [commutePlan, hasCommuteHydrated, setLocation]);

  useEffect(() => {
    if (
      !commutePlan
      || commutePlan.status !== 'active'
      || latitude === null
      || longitude === null
    ) {
      return;
    }

    const nextStop = getNextCommuteStop(commutePlan);
    if (!nextStop) {
      return;
    }

    const distanceToNextStop = haversineDistance(
      latitude,
      longitude,
      nextStop.coordinates.lat,
      nextStop.coordinates.lng
    );
    const arrivalThresholdMeters = Math.max(
      50,
      COMMUTE_ARRIVAL_RADIUS_METERS - Math.min(accuracyMeters ?? 0, COMMUTE_ARRIVAL_RADIUS_METERS - 50)
    );
    if (distanceToNextStop > arrivalThresholdMeters) {
      return;
    }

    if (nextStop.type === 'destination') {
      completePlan();
    } else {
      markCurrentStopReached();
      setActiveTab('commute');
    }
  }, [accuracyMeters, commutePlan, completePlan, latitude, longitude, markCurrentStopReached]);

  const handleFindGasClick = () => {
    if (latitude !== null && longitude !== null) {
      setLocalGasSearchOrigin({ lat: latitude, lng: longitude });
    }
    setSelectedGasStationId(null);
    setHasSearchedGas(true);
  };

  const handleGasStationMapClick = (id: string) => {
    setSelectedGasStationId(id);
  };

  const handleGasStationListClick = (id: string) => {
    setSelectedGasStationId(id);
    setActiveTab('map');
  };

  const handleMapTabClick = () => {
    if (commutePlan && commutePlan.status !== 'completed') {
      setSelectedGasStationId(null);
    }
    setActiveTab('map');
  };

  const commuteMapPlan = commutePlan && commutePlan.status !== 'completed' && !selectedGasStation
    ? commutePlan
    : null;

  return (
    <main className="app-shell">
      <div className="app-body">
        <header className="app-header">
        <h1 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <Image src="/AppIcon.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
          <span className="brand-title">Go Go Gas!</span>
        </h1>
        </header>

        <div className={activeTab === 'map' ? 'map-content' : 'page-content'}>
          <section
            aria-labelledby="find-gas-heading"
            aria-hidden={activeTab !== 'home'}
            className={activeTab === 'home' ? 'flex w-full flex-col items-center' : 'hidden'}
          >
            <div className="page-heading"><h2 id="find-gas-heading">Local Gas</h2><p>Compare prices nearby.</p></div>
            <div className="surface w-full p-4">
              <SearchControls
                idPrefix="home"
                selectedFuelGrade={selectedFuelGrade}
                searchRadiusMiles={searchRadiusMiles}
                hasSearchedGas={hasSearchedGas}
                gasStationsToDisplayCount={gasStationsToDisplay.length}
                gasStationsInRadiusCount={gasStationsInRadius.length}
                isGasStationsLoading={isGasStationsLoading}
                gasStationsErrorMessage={gasStationsErrorMessage}
                onFuelGradeChange={setSelectedFuelGrade}
                onSearchRadiusChange={setSearchRadiusMiles}
              />
            <button
              type="button"
              onClick={handleFindGasClick}
              disabled={latitude === null || longitude === null || isGasStationsLoading}
              className="action-primary mt-3 w-full"
            >
              <Search size={18} aria-hidden="true" />{isGasStationsLoading ? 'Finding gas…' : 'Find local gas'}
            </button>
            </div>
            {isLocationFetching && (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                Finding your location…
              </p>
            )}
            {locationErrorMessage && <p className="status-message status-error mt-3 w-full" role="alert">{locationErrorMessage}</p>}
            {!hasSearchedGas && !isLocationFetching && !locationErrorMessage && (
              <div className="empty-state"><MapPinned size={24} aria-hidden="true" /><p>Ready to find nearby fuel</p><span>Choose your fuel grade and radius, then find local gas.</span></div>
            )}

            {hasSearchedGas && gasStationsToDisplay.length > 0 && (
              <div className="surface mt-4 w-full overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 pt-3">
                  <div>
                    <h3 className="text-base font-semibold">Nearby stations</h3>
                    <p className="text-xs text-muted-foreground">
                      {gasStationsToDisplay.length} station{gasStationsToDisplay.length === 1 ? '' : 's'} found
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBestGasExpanded((currentValue) => !currentValue)}
                    className="action-quiet"
                    aria-expanded={isBestGasExpanded}
                    aria-controls="station-results"
                  >
                    {isBestGasExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                <div className="flex items-center gap-3 border-b px-4 py-2">
                  <label htmlFor="gas-sort" className="field-label">Sort by</label>
                  <select id="gas-sort" className="form-input ml-auto max-w-44" value={gasSortMode}
                    onChange={(event) => setGasSortMode(event.target.value as GasSortMode)}>
                    <option value="best">Best choice</option><option value="price">Lowest price</option><option value="distance">Nearest</option>
                  </select>
                </div>

                {isBestGasExpanded && (
                  <ul id="station-results" className="divide-y divide-border">
                    {gasStationsToDisplay.map(station => (
                      <li key={station.id} className="station-row">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold break-words">{station.name}</h4>
                          <p className="mt-1 text-xs text-muted-foreground break-words">{station.address}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {station.distanceMiles !== null && <span>{station.distanceMiles.toFixed(1)} mi away</span>}
                            <span>{formatFuelGradeLabel(selectedFuelGrade)}</span>
                            {station.priceUpdatedAt && <span>Updated {formatUpdatedTime(station.priceUpdatedAt)}</span>}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="price-value">${station.pricePerGallon.toFixed(2)}<span className="block text-right text-xs font-normal text-muted-foreground">/gal</span></span>
                          <button
                            type="button"
                            onClick={() => handleGasStationListClick(station.id)}
                            className="action-quiet text-primary"
                            aria-label={`View ${station.name} on map`}
                          >
                            View map
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {hasSearchedGas && !isGasStationsLoading && gasStationsToDisplay.length === 0 && !gasStationsErrorMessage && (
              <div className="empty-state">
                <Search size={24} aria-hidden="true" /><p>No live prices found</p><span>Try a wider radius or another fuel grade.</span>
              </div>
            )}
          </section>

          <section
            aria-labelledby="commute-heading"
            aria-hidden={activeTab !== 'commute'}
            className={activeTab === 'commute' ? 'flex w-full flex-col items-center' : 'hidden'}
          >
            <div className="page-heading"><h2 id="commute-heading">Commuter Gas</h2><p>Plan your drive around fuel stops.</p></div>
            <CommutePanel
              origin={userLocation}
              locationErrorMessage={locationErrorMessage}
              onPlanReady={() => {
                setSelectedGasStationId(null);
                setActiveTab('commute');
              }}
              onViewMap={handleMapTabClick}
            />
          </section>

          <section
            aria-labelledby="map-heading"
            aria-hidden={activeTab !== 'map'}
            className={activeTab === 'map' ? 'flex w-full flex-col items-center' : 'hidden'}
          >
            <h2 id="map-heading" className="sr-only">Map</h2>
            <div className="map-workspace" data-selected={!!selectedGasStation}>
            <div className="map-column">
            <div className="map-canvas">
              <PriceMap
                onGasStationClick={handleGasStationMapClick}
                selectedGasStationId={activeSelectedGasStationId}
                waypoints={dynamicWaypoints}
                onDirectionsChange={setDirections}
                gasStations={!commuteMapPlan && hasSearchedGas ? gasStationsToDisplay : []}
                locationErrorMessage={locationErrorMessage}
                isVisible={activeTab === 'map'}
                initialSearchRadiusMiles={DEFAULT_SEARCH_RADIUS_MILES}
                commutePlan={commuteMapPlan}
              />
            </div>
            <div className="map-legend"><span><Image src={USER_LOCATION_ICON_URL} alt="" width={15} height={25} unoptimized />Your location</span><span><i className="station-dot" />Gas station</span></div>
            {!commuteMapPlan && selectedGasStation && dynamicWaypoints.length >= 2 && (
              <details className="map-directions" key={directionsRouteKey}>
                <summary>Directions<ChevronDown size={18} aria-hidden="true" /></summary>
                <div className="px-4 pb-4">
                  <p className="mb-3 text-sm font-semibold break-words">To {selectedGasStation.name}</p>
                  <div aria-live="polite">
                    {(!currentDirections || currentDirections.status === 'loading') && (
                      <p className="text-sm text-muted-foreground" role="status">Finding directions…</p>
                    )}
                    {currentDirections?.status === 'unavailable' && (
                      <p className="text-sm text-muted-foreground">Directions are unavailable. Open this station in Maps for navigation.</p>
                    )}
                    {currentDirections?.status === 'ready' && (
                      <p className="text-sm text-muted-foreground">{currentDirections.distance}, {currentDirections.duration}</p>
                    )}
                  </div>
                  {currentDirections?.status === 'ready' && (
                    <ol className="directions-steps mt-3" aria-label="Turn-by-turn directions">
                      {currentDirections.instructions.map((instruction, index) => (
                        <li key={index}>
                          <span>{instruction.text}</span>
                          {instruction.distance && <span className="directions-distance">{instruction.distance}</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                  <a className="action-secondary mt-3" href={getWebDirectionsUrl(selectedGasStation)} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openPreferredDirections(selectedGasStation); }}><Navigation size={16} aria-hidden="true" />Open in Maps</a>
                </div>
              </details>
            )}
            </div>

            {(commuteMapPlan || selectedGasStation || tripPlan || isTripEstimateLoading) && <aside className="map-panel" aria-label="Map details">
            {commuteMapPlan && (
              <div className="space-y-3 p-4">
                <p className="text-xs text-muted-foreground">Saved commute route</p>
                <h3 className="text-base font-semibold break-words">{commuteMapPlan.destination.name}</h3>
                <p className="text-sm text-muted-foreground">{formatMiles(commuteMapPlan.totalDistanceMeters)} · {formatDuration(commuteMapPlan.totalDurationSeconds)}</p>
                <button type="button" onClick={() => setActiveTab('commute')} className="action-primary w-full">View commute details</button>
                <p className="text-xs text-muted-foreground">Gas price and station data provided by Google Places.</p>
              </div>
            )}

            {!commuteMapPlan && selectedGasStation && <details className="station-details" open key={selectedGasStation.id}>
              <summary>Selected station<ChevronDown size={16} aria-hidden="true" /></summary>
              <div className="space-y-3 px-4 pb-4">
                <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 text-base font-semibold break-words">{selectedGasStation.name}</h3><span className="price-value shrink-0">${selectedGasStation.pricePerGallon.toFixed(2)}<span className="block text-right text-xs font-normal text-muted-foreground">/gal</span></span></div>
                <p className="text-sm text-muted-foreground break-words">{selectedGasStation.address}</p>
                <p className="text-xs text-muted-foreground">{formatFuelGradeLabel(selectedFuelGrade)}{selectedGasStation.distanceMiles !== null && ` · ${selectedGasStation.distanceMiles.toFixed(1)} mi away`}</p>
                {selectedGasStation.priceUpdatedAt && <p className="text-xs text-muted-foreground">Updated {formatUpdatedTime(selectedGasStation.priceUpdatedAt)}</p>}
                <a className="action-primary w-full" href={getWebDirectionsUrl(selectedGasStation)} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openPreferredDirections(selectedGasStation); }}><Navigation size={18} aria-hidden="true" />Open in Maps</a>
                {commutePlan && <button type="button" onClick={() => setSelectedGasStationId(null)} className="action-secondary w-full">Return to commute route</button>}
              </div>
            </details>}

            {!commuteMapPlan && (tripPlan || isTripEstimateLoading) && (
              <div className="border-t p-4">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold">Trip estimates</h3>
                    </div>
                    {isTripEstimateLoading && (
                      <span className="text-xs text-muted-foreground" role="status">
                        Calculating…
                      </span>
                    )}
                  </div>

                  {tripPlan && tripEstimateSummary && (
                    <div className="mt-3 divide-y divide-border">
                      {tripEstimateSummary.legs.map((leg, index) => {
                        const destinationStop = tripPlan.orderedStops[index + 1];

                        return (
                          <div key={`${leg.fromStopId}-${leg.toStopId}`} className="flex items-center justify-between gap-3 py-3">
                            <div>
                              <p className="text-sm font-medium">Drive to station</p>
                              <p className="text-xs text-muted-foreground break-words">{destinationStop.name}</p>
                            </div>
                            <div className="shrink-0 text-right tabular-nums">
                              <p className="text-sm font-semibold">{formatMiles(leg.distanceMeters)}</p>
                              <p className="text-xs text-muted-foreground">{formatDuration(leg.durationSeconds)}</p>
                            </div>
                          </div>
                        );
                      })}

                      {tripEstimateSummary.returnToStart && (
                        <div className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <p className="text-sm font-medium">Return to start</p>
                            <p className="text-xs text-muted-foreground">Estimate only; not on map</p>
                          </div>
                          <div className="shrink-0 text-right tabular-nums">
                            <p className="text-sm font-semibold">
                              {formatMiles(tripEstimateSummary.returnToStart.distanceMeters)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(tripEstimateSummary.returnToStart.durationSeconds)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            </aside>}
            </div>
          </section>

          <section
            aria-labelledby="settings-heading"
            aria-hidden={activeTab !== 'settings'}
            className={activeTab === 'settings' ? 'w-full' : 'hidden'}
          >
            <div className="page-heading"><h2 id="settings-heading">Settings</h2></div>
            <ThemeSetting />
          </section>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="primary-nav">
        <div className="nav-items">
          <button
            type="button"
            onClick={handleMapTabClick}
            aria-current={activeTab === 'map' ? 'page' : undefined}
            className="nav-item"
          >
            <MapPinned aria-hidden="true" size={19} />
            Map
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            aria-current={activeTab === 'home' ? 'page' : undefined}
            className="nav-item"
          >
            <Search aria-hidden="true" size={19} />
            Local Gas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commute')}
            aria-current={activeTab === 'commute' ? 'page' : undefined}
            className="nav-item"
          >
            <Route aria-hidden="true" size={19} />
            Commuter Gas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className="nav-item"
          >
            <Settings aria-hidden="true" size={19} />
            Settings
          </button>
        </div>
      </nav>
    </main>
  );
}
