# Monster Truck 🛻

A big, bouncy monster truck game made for a 4-year-old. You can't lose: there's no timer and no crashing, just jumps, flips and crushed cars.

## How to play
- **Hold the left side** of the screen to turn left, **the right side** to turn right. Hold **both** to go straight.
- The truck drives by itself. The track never ends and keeps changing: kickers, big dirt ramps, tabletops, whoops, lane ramps (pick a side!), gap jumps, bus jumps, crush zones, steel **mega ramps** and the giant **sky ramp**, with slow motion at the top of the big ones.
- The scenery changes every few sections: a packed stadium, the countryside and a desert canyon.
- **In the air:**
  - Hold left or right to spin (and drift a little that way). Hold both to do a front flip.
  - Swipe up for a backflip, down for a front flip, left or right for a barrel roll. Swipe like crazy for crazy stunts. Swiping or holding the other way reverses the spin right away.
  - The truck always lands on its wheels.
- **On the ground:** swipe up to hop.
- Crush cars, vans, pickups, limos, RVs, school buses, car stacks, port-a-potties, crates and hay bales.
- Grab glowing power-ups (they start on their own, and a ring next to the ⭐ shows how long is left):
  - 🔥 **Nitro**: flames, more speed, and higher jumps.
  - 🌙 **Moon gravity**: super floaty jumps.
  - 💪 **Giant truck**: grows huge and squashes a wider path.
  - 🧲 **Star magnet**: stars fly to you, and points are doubled.
- Collect ⭐ by flying through stars, crushing things, and landing stunts. Every 25 stars sets off fireworks.
- 🏆 points rack up as you play:
  - Crushing: 100 for a car, up to 300 for a bus or RV and 400 for a stack. Crush several in a row for a combo (×2, ×3, ...).
  - Fly through a star: 50.
  - Big air: about 100 points per second in the air.
  - Tricks: each kind of trick is worth more with every extra turn: a backflip is 1,000, a double 3,000, a triple 6,000 (base × n(n+1)/2). Front flips score like backflips, barrel rolls start at 800 and spins at 600.
  - Mixing tricks multiplies everything by how many different tricks you did (×2, ×3, ...). Mega and sky ramps add ×1.5, and the star magnet ×2.
  - The name on landing is always exact, however many times you go round: "TRIPLE BACKFLIP + 360 SPIN COMBO!", "DECUPLE BACKFLIP", "QUATTUORDECUPLE FRONT FLIP", "5040 SPIN". Back and front flips in the same jump both count.
- 📣 honks the horn.
- 🏠 (top-right) goes back to the truck picker. You have to **hold it for 1 second**, so little fingers don't hit it by accident.

Keyboard (for testing on a computer): left/right arrows (or A/D) steer and spin, up/down arrows (or W/S) flip, Q/E barrel roll, Space honks. Hold keys to keep flipping; up on the ground hops.

Stars and points are saved in the browser. To reset them, run `localStorage.clear()` in the browser console.

## Put it on GitHub Pages
1. Push this repo to GitHub.
2. On GitHub, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
3. After a minute it's live at `https://<your-username>.github.io/monster-truck/`.

## Make it feel like an app (iPad / iPhone)
1. Open the link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Launch it from the new icon. It opens full screen and works offline after the first launch.

Tips:
- Turn on **Guided Access** (Settings → Accessibility → Guided Access) to lock the iPad to the game. Triple-click the side/home button to start it.
- No sound on iPhone? Flip the ring/silent switch off. Newer iOS versions play game sound anyway.
- After you push an update, the game picks it up the second time it's opened.

## Run it locally
It's plain HTML and JavaScript with no build step and no dependencies to install. Just run:

```sh
npm start
```

Then open http://localhost:3000 in your browser. It also prints a `http://192.168.x.x:3000` address you can open on an iPad/iPhone on the same Wi-Fi. Use `PORT=8080 npm start` for a different port.

Caching is turned off, so a refresh always shows your latest changes. Offline mode only turns on for the published HTTPS site, not for local testing.

### Testing
- `npm test` checks trick names and scoring.
- Add these to the URL to try things out (they can be combined, e.g. `?seg=sky&power=moon&stats`):
  - `?seg=mega,bus,tabletop` plays those track sections over and over. Sections: `kickers`, `ramp`, `tabletop`, `whoops`, `rollers`, `laneKickers`, `gap`, `bus`, `crushZone`, `mega`, `sky`.
  - `?power=nitro` (or `moon`, `giant`, `magnet`) makes every power-up that kind, and puts one at the start of every other section.
  - `?biome=desert` (or `stadium`, `country`) keeps the scenery fixed.
  - `?stats` shows frames per second and draw calls.
  - `?quality=low` (no shadows), `medium` or `high` fixes the graphics quality. Otherwise it starts high and steps down by itself if the device struggles.
  - `?substeps=4` runs the game faster than real time, which helps on slow test machines.

## Files
- `src/main.js`: game loop, camera, lighting and shadows, scoring, celebrations, power-up HUD
- `src/tricks.js`: trick names and scoring (no 3D code, so it can be tested with Node)
- `src/truck.js`: truck model, driving, air stunts, auto-landing, power-ups
- `src/world.js`: the endless track: segments, ground height, stars, crushing, pickups
- `src/track.js`: the kinds of track sections and the sequencer that picks the next one
- `src/crushables.js`: things to crush and how they squash
- `src/cars.js`: vehicle models (sedan, hatchback, SUV, pickup, van, junker, limo, bus, RV)
- `src/powerups.js`: power-up kinds and their glowing pickups
- `src/scenery.js`: the stadium, countryside and desert around the track
- `src/sky.js`: sky gradient, far-off hills or skyline, time-of-day colors, reflections
- `src/textures.js`: all textures, drawn in code (dirt, wood, banners, crowd, clouds, ...)
- `src/parts.js`: merges many small shapes into one mesh (one draw call) with per-part paint, chrome, rubber, glass and lights
- `src/consts.js`: shared numbers (track width, gravity, speed)
- `src/input.js`: touch zones, swipes, keyboard
- `src/effects.js`: confetti, dust, smoke, flames, sparks, flying debris, the big "WOW!" text
- `src/audio.js`: sound effects, all generated in code
- `sw.js` and `manifest.webmanifest`: home-screen app and offline support
- `vendor/`: [three.js](https://threejs.org) r169 and its BufferGeometryUtils helper
