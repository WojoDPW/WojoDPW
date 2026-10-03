import { GOOGLE_MAPS_API_KEY, isMapsConfigured } from './maps-config.js';

export { isMapsConfigured };

let loadPromise = null;

function loadGoogleMaps() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps?.places?.PlaceAutocompleteElement) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps loaded, but the Places Autocomplete widget is missing — is the Places API enabled on this key\'s project?'));
      }
    };
    script.onerror = () => {
      loadPromise = null; // allow a retry on the next form open
      reject(new Error('Could not load Google Maps (check the API key and your connection).'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * Mounts a Google Places Autocomplete widget into `container`. Calls
 * onSelect(formattedAddress) whenever the user picks a suggestion.
 * Throws if Maps/Places fails to load for any reason — callers should
 * catch that and fall back to a plain text input, since this always runs
 * against a key and billing setup the end user controls, not something
 * this app can guarantee is correctly configured.
 */
export async function mountAddressAutocomplete(container, { onSelect }) {
  const maps = await loadGoogleMaps();
  const el = new maps.places.PlaceAutocompleteElement();
  container.appendChild(el);
  el.addEventListener('gmp-select', async (event) => {
    try {
      const place = event.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      onSelect(place.formattedAddress || '');
    } catch (err) {
      console.error('Failed to resolve the selected address:', err);
    }
  });
  return el;
}
