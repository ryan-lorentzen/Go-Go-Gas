import L from "leaflet";
import userLocationIcon from "./user-location-marker";
import { createControlComponent } from "@react-leaflet/core";
import "leaflet-routing-machine";

interface RoutingMachineProps extends L.ControlOptions {
  waypoints: L.LatLng[];
}

const createRoutineMachineLayer = (props: RoutingMachineProps) => {
  const instance = L.Routing.control({
    collapsible: true,
    collapseBtn: (itinerary: L.Routing.Itinerary) => {
      const container = itinerary.getContainer();
      if (!container) return;
      const button = L.DomUtil.create('button', 'leaflet-routing-collapse-btn');
      button.type = 'button';
      button.setAttribute('aria-label', 'Toggle route instructions');
      button.setAttribute('aria-expanded', 'true');
      L.DomEvent.on(button, 'click', () => {
        const isCollapsed = container.classList.contains('leaflet-routing-container-hide');
        if (isCollapsed) itinerary.show();
        else itinerary.hide();
        button.setAttribute('aria-expanded', String(isCollapsed));
      });
      container.prepend(button);
    },
    plan: L.Routing.plan(props.waypoints, {
      addWaypoints: false,
      draggableWaypoints: true,
      createMarker: function (i: number, waypoint: L.Routing.Waypoint) {
        if (i === 0) {
          return L.marker(waypoint.latLng, {
            icon: userLocationIcon
          });
        }
        return false;
      }
    }),
    lineOptions: {
      styles: [{ color: "#6FA1EC", weight: 4 }],
      extendToWaypoints: true,
      missingRouteTolerance: 100
    },
    routeWhileDragging: true,
    show: true,
    fitSelectedRoutes: false,
    showAlternatives: false,
    formatter: new L.Routing.Formatter({
      units: "imperial",
      distanceTemplate: '{value} {unit}'
    }),
    summaryTemplate: '<h2>{name}</h2><h3>{distance}, {time}</h3>'
  } as L.Routing.RoutingControlOptions & { collapsed: boolean });

  instance.on('routesfound', (event: L.Routing.RoutingResultEvent) => {
    const routeCoordinates = event.routes[0]?.coordinates;

    if (!routeCoordinates || routeCoordinates.length === 0) {
      return;
    }

    const map = (instance as L.Routing.Control & { _map?: L.Map })._map;

    if (!map) {
      return;
    }

    const routeBounds = L.latLngBounds(routeCoordinates);
    const padding = L.point(32, 32);
    const zoomToFitRoute = map.getBoundsZoom(routeBounds, false, padding);

    if (zoomToFitRoute === undefined) {
      return;
    }

    map.setView(routeBounds.getCenter(), Math.min(map.getZoom(), zoomToFitRoute), { animate: true });
  });

  return instance;
};

const RoutingMachine = createControlComponent<L.Routing.Control, RoutingMachineProps>(
  createRoutineMachineLayer
);

export default RoutingMachine;
