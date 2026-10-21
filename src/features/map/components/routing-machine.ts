import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import 'leaflet-routing-machine';
import type { RouteDirections, RouteWaypoint } from '@/types';
import userLocationIcon from './user-location-marker';

interface RoutingMachineProps {
  waypoints: RouteWaypoint[];
  routeKey: string;
  onDirectionsChange: (directions: RouteDirections) => void;
}

export default function RoutingMachine({ waypoints, routeKey, onDirectionsChange }: RoutingMachineProps) {
  const map = useMap();

  useEffect(() => {
    const formatter = new L.Routing.Formatter({
      units: 'imperial',
      distanceTemplate: '{value} {unit}',
    });
    // Routing Machine mixes in Leaflet events, but its types omit Evented.off.
    const control = L.Routing.control({
      // React renders the itinerary below the map; Leaflet only draws the route.
      show: false,
      collapsible: false,
      plan: L.Routing.plan(waypoints.map(point => L.latLng(point.lat, point.lng)), {
        addWaypoints: false,
        draggableWaypoints: true,
        createMarker: (index: number, waypoint: L.Routing.Waypoint) =>
          index === 0 ? L.marker(waypoint.latLng, { icon: userLocationIcon }) : false,
      }),
      lineOptions: {
        styles: [{ color: '#6FA1EC', weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 100,
      },
      routeWhileDragging: true,
      fitSelectedRoutes: false,
      showAlternatives: false,
      formatter,
    }) as L.Routing.Control & L.Evented;

    const onLoading = () => onDirectionsChange({ routeKey, status: 'loading' });
    const onUnavailable = () => onDirectionsChange({ routeKey, status: 'unavailable' });
    const onRoutesFound = (event: L.Routing.RoutingResultEvent) => {
      const route = event.routes[0];
      if (!route?.summary || !route.instructions?.length || !route.coordinates?.length) {
        onUnavailable();
        return;
      }

      onDirectionsChange({
        routeKey,
        status: 'ready',
        distanceMeters: route.summary.totalDistance,
        duration: formatter.formatTime(route.summary.totalTime),
        instructions: route.instructions.map(instruction => ({
          text: formatter.formatInstruction(instruction),
          distanceMeters: instruction.distance,
        })),
      });

      const bounds = L.latLngBounds(route.coordinates);
      const zoom = map.getBoundsZoom(bounds, false, L.point(32, 32));
      if (zoom !== undefined) {
        map.setView(bounds.getCenter(), Math.min(map.getZoom(), zoom), { animate: true });
      }
    };

    control.on('routingstart', onLoading);
    control.on('routingerror', onUnavailable);
    control.on('routesfound', onRoutesFound);
    control.addTo(map);
    const container = control.getContainer();
    if (container) container.style.display = 'none';

    return () => {
      // Ignore responses from a route that has been replaced or unmounted.
      control.off();
      map.removeControl(control);
    };
  }, [map, waypoints, routeKey, onDirectionsChange]);

  return null;
}
