# Malcolm's Revenge

An endless browser space arcade game. This is the verified Pass 20 baseline previously filmed as Starline Run. The title changed; the game replay did not. Later upgrade prototypes are not included.

Download `index.html` and open it in a desktop browser with WebGL2. It runs offline.

- **Space** or click the planet to leave orbit.
- **WASD / arrows** to steer; **X** to fire; **E** to spend collected fuel on boost.
- **M** mutes sound; **Escape** returns to orbit.
- Follow the gas chain, dodge marked attack lanes, and bank points at stars. The third star leads to procedural sectors, not an end screen.

## Rebuild

With Node.js 22+ and Git:

```sh
npm ci
npm run prepare:engine
npm run build
npm run verify
cmp index.html dist/index.html
```

The build uses Three.js r180 and fetches the exact NexusEngine revision `48f8f9a6dce74255546045f98a30d86ff7202cc1`. The HTML embeds the runtime and authored scenes; play does not fetch the Engine. Third-party notices are in `vendor/`.

The single `deploy.yml` workflow rebuilds the game, checks the deterministic gameplay proof and same-byte HTML, uploads the playable artifact, and publishes it to GitHub Pages from `main`.
