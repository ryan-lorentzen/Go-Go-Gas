import L from 'leaflet';
import { USER_LOCATION_ICON_URL } from '@/features/map/user-location-icon';

const userLocationIcon = new L.Icon({
    iconUrl: USER_LOCATION_ICON_URL,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

export default userLocationIcon;
