# Monster Truck 🛻

A big, bouncy monster truck game made for a 4-year-old. You can't lose: there's no timer and no crashing, just jumps, flips and crushed cars.

## How to play
- **Hold the left side** of the screen to turn left, **the right side** to turn right. Hold **both** to go straight.
- The truck drives by itself and launches off huge ramps.
- **In the air:**
  - Hold left or right to spin. Hold both to do a front flip.
  - Swipe up for a backflip, down for a front flip, left or right for a barrel roll. Swipe like crazy for crazy stunts.
  - The truck always lands on its wheels.
- **On the ground:** swipe up to hop.
- Collect ⭐ by flying through stars, crushing cars, and landing stunts. Every 25 stars sets off fireworks.
- 📣 honks the horn.
- 🏠 (top-right) goes back to the truck picker. You have to **hold it for 1 second**, so little fingers don't hit it by accident.

Keyboard (for testing on a computer): arrows or A/D steer, W/S flip, Q/E barrel roll, Space honks.

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
It's plain HTML and JavaScript with no build step:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files
- `src/main.js`: game loop, camera, scoring, celebrations
- `src/truck.js`: truck model, driving, air stunts, auto-landing
- `src/world.js`: endless track, ramps, cars, stars, scenery
- `src/input.js`: touch zones, swipes, keyboard
- `src/effects.js`: confetti, dust, the big "WOW!" text
- `src/audio.js`: sound effects, all generated in code
- `sw.js` and `manifest.webmanifest`: home-screen app and offline support
- `vendor/three.module.min.js`: [three.js](https://threejs.org) r169
