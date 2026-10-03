// Paste a Google Maps Platform API key here to enable address autocomplete
// on the property form. Google Cloud console -> APIs & Services ->
// Credentials -> Create credentials -> API key, with the "Places API"
// enabled on the project and the key restricted to it (and, ideally, to
// your site's HTTP referrer) so a copied key can't rack up charges
// elsewhere. See the README for the full walkthrough.
//
// This key is NOT a secret in the usual sense — like the Firebase config,
// it's meant to be used from the browser and is visible in page source —
// but it should still be *restricted* (API + HTTP referrer) in the Google
// Cloud console, since an unrestricted key could be copied and used by
// someone else on Google's bill.
//
// Leaving this as the placeholder simply disables autocomplete: the
// property form falls back to a plain text address field, nothing breaks.

export const GOOGLE_MAPS_API_KEY = 'AIzaSyDNpERxwLAgelSzUl5pBxoVBYLSbtFh79Q';

export const isMapsConfigured = GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY';
