# Offline tactical map

The satellite image and tactical overlay are bundled with the app. GPS conversion also runs entirely offline; no map service or projection service is contacted.

## Run and test

Use Node.js 22.12+ and pnpm 10.13.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

For a GitHub Pages build, run `BASE_PATH=/offline-map/ pnpm build`. Pushing to `main` runs the tests and build before deploying Pages.

## Test GPS on a Mac

Open `http://127.0.0.1:5173/?gpsDebug=1` while the dev server is running. The GPS test panel replaces device location with the latitude, longitude, accuracy, and fix age you enter. Click **Apply GPS position**. It shows the projected UTM coordinates and Leaflet map coordinates. This panel is excluded from production builds.

Enable **Satellite image** in Settings to see the full image boundary. Test the corners and both interior points, rather than only the centre:

| Point | Latitude | Longitude | Expected Leaflet Y, X |
| --- | --- | --- | --- |
| Southwest | 44.795400213725024 | -78.61048311519978 | 0, 0 |
| Northwest | 44.80439461532957 | -78.61011162957553 | 5000, 0 |
| Northeast | 44.804129385644536 | -78.59747779177115 | 5000, 5000 |
| Southeast | 44.79513506674198 | -78.59785123661361 | 0, 5000 |
| Image centre | 44.799764996962956 | -78.60398094329003 | 2500, 2500 |
| Overlay centre | 44.799844499007385 | -78.60150671260216 | 2573.02, 3477.13 |
| North interior | 44.80246330430531 | -78.6038691958595 | 4000, 2500 |
| South interior | 44.79706668812056 | -78.60409267500539 | 1000, 2500 |

Moving from the south interior point to the north interior point must move the marker upward. With a fix age above 30 seconds, or **Simulate unavailable GPS**, the dot should disappear and the status should explain why. A latitude of `44.82` and longitude of `-78.60` should report **Outside this map**.

To test the browser's actual geolocation API instead, open the app without `gpsDebug`. In Chrome DevTools press Cmd+Shift+P, choose **Show Sensors**, select **Custom location**, enter the coordinates, allow location access, and reload. This also works against a production preview. [Chrome documentation](https://developer.chrome.com/docs/devtools/sensors#geolocation).

## Map coordinates

`public/map-packs/current/map-pack.json` stores the image dimensions, metres per pixel, and geographic reference:

- Source: `1km17689049630SCOOP2023.tif`, NAD83(CSRS) / UTM zone 17N.
- Southwest origin: easting 689000 m, northing 4963000 m.
- Raster: 5000 by 5000 pixels, 0.2 m per pixel, north up.
- `georeference.projection`: the local Proj4 definition used for GPS conversion.

`src/map/gps.ts` projects browser coordinates in `[longitude, latitude]` order, subtracts the southwest origin, and divides by metres per pixel. It returns Leaflet `[Y, X]`, where Y increases northward. Both the main map and alignment tool use this function. `gpsBounds` is the envelope of all four geographic corners, for reference only; it is not used to position GPS.

`public/alignment.json` controls the overlay's position, scale, and rotation. The GPS correction does not change that alignment or either image. There are no separately surveyed GPS records for named landmarks in the overlay.

The current projection uses GRS80/UTM geometry without a time-dependent NAD83(CSRS)-to-WGS84 datum transformation. The reference points above test the software mapping and are not surveyed ground truth. The original GeoTIFF is not included in this checkout. Before claiming survey-level accuracy, verify its CRS/datum/epoch and compare at least three independently located landmarks across the site. Phone accuracy is also a separate limit.

`pnpm prepare:map` writes the same geographic reference from the selected Ontario tile's filename and image dimensions. It requires the original source imagery. `pnpm bake:overlay` is only needed when changing the overlay itself.

## GPS status and offline verification

The app shows reported accuracy. Errors clear the marker; fixes older than 30 seconds expire. While the app is visible, a quiet location watch is refreshed after 15 seconds so a stationary user can still receive a fresh fix. Off-map fixes are reported, not clamped to a misleading position inside the map.

After deployment, open the app online to let its service worker install the new assets. Close and reopen the installed app if an older version is still displayed. For browser verification, load the production build once, wait for the service worker to control it, switch DevTools Network to **Offline**, and reload. The map and simulated browser GPS should still work. On-site iPhone validation should record coordinates, reported accuracy, and the matching landmark.
