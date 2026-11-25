import * as THREE from "three";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPixelCanvas(w, h, drawFn) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx, w, h);
  return canvas;
}

let DEFAULT_ANISOTROPY = 8;

function makePixelTexture(w, h, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = createPixelCanvas(w, h, drawFn);
  const tex = new THREE.CanvasTexture(canvas);
  // Crisp pixel-art magnification up close, smooth mipmapped minification + max hardware anisotropy at oblique angles
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = DEFAULT_ANISOTROPY;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export function createTextureLibrary(maxAnisotropy = 8) {
  DEFAULT_ANISOTROPY = Math.max(4, Math.min(16, maxAnisotropy));
  const lib = {};

  // 1. Soft snowy ground with subtle blue-cream pixel grain & drifts
  lib.snowGround = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(101);
    const palette = ["#e8f0f7", "#edf4fa", "#dfeaf4", "#f3f8fc", "#d4e2ef"];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = rnd();
        let c = palette[0];
        if (r < 0.25) c = palette[1];
        else if (r < 0.5) c = palette[2];
        else if (r < 0.62) c = palette[3];
        else if (r < 0.7) c = palette[4];
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Gentle snow pebble ripples
    ctx.fillStyle = "#c8d9e8";
    for (let i = 0; i < 14; i++) {
      const px = Math.floor(rnd() * (w - 3));
      const py = Math.floor(rnd() * h);
      ctx.fillRect(px, py, 3, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px, Math.max(0, py - 1), 2, 1);
      ctx.fillStyle = "#c8d9e8";
    }
  }, 18, 18);

  // Clean snow cap for trees, roofs, fences
  lib.snowCap = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(102);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = rnd();
        ctx.fillStyle = r < 0.3 ? "#f5faff" : r < 0.7 ? "#e9f2fa" : "#d7e5f2";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 2. Single-stone warm weathered cottage limestone/slate texture (applied to individual 3D beveled pavers!)
  lib.flagstonePaver = makePixelTexture(24, 24, (ctx, w, h) => {
    const rnd = mulberry32(215);
    ctx.fillStyle = "#d8d3cc";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (edge) {
          ctx.fillStyle = (x === 0 || y === 0) ? "#ece9e4" : "#b8b3ac";
        } else {
          const r = rnd();
          ctx.fillStyle = r < 0.22 ? "#ccc7c0" : r < 0.45 ? "#e2ded8" : r < 0.6 ? "#c4c0b9" : "#d9d4cd";
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Delicate natural stone micro-speckles & tiny snow frost corners
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = rnd() > 0.4 ? "#efeee9" : "#aba7a0";
      ctx.fillRect(2 + Math.floor(rnd() * (w - 4)), 2 + Math.floor(rnd() * (h - 4)), 1, 1);
    }
  });
  lib.cobblePath = lib.flagstonePaver;

  // 3. Untouched snowy garden plot (subtle frosty earth peeking through)
  lib.soilSnow = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(301);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (edge) {
          ctx.fillStyle = "#c9d7e4";
        } else {
          const r = rnd();
          ctx.fillStyle = r < 0.08 ? "#a69585" : r < 0.35 ? "#dde7f1" : r < 0.72 ? "#e9f1f8" : "#f4f8fc";
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 4. Dry tilled Stardew farmland soil (horizontal furrows)
  lib.soilDry = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(302);
    ctx.fillStyle = "#8a5a34";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const furrow = y % 4;
      for (let x = 0; x < w; x++) {
        let c = "#8c5b35";
        if (furrow === 0) c = "#5d391e";
        else if (furrow === 1) c = "#a36e42";
        else if (furrow === 2) c = "#885832";
        else c = "#704625";
        if (rnd() < 0.14) c = "#674022";
        if (rnd() < 0.08) c = "#b17d50";
        // border bevel
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c = "#533219";
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 5. Watered rich dark soil (unmistakably wet!)
  lib.soilWet = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(303);
    for (let y = 0; y < h; y++) {
      const furrow = y % 4;
      for (let x = 0; x < w; x++) {
        let c = "#4b2c17";
        if (furrow === 0) c = "#2c180b";
        else if (furrow === 1) c = "#5f391f";
        else if (furrow === 2) c = "#472915";
        else c = "#381f0f";
        if (rnd() < 0.12) c = "#6d482b";
        if (rnd() < 0.05) c = "#6d8aa3"; // faint moist glint
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c = "#281509";
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 6. Cottage horizontal log wall texture
  lib.logWall = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(401);
    const rows = 4;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      for (let dy = 0; dy < rh; dy++) {
        let base = "#985f37";
        if (dy === 0) base = "#4a2a15";
        else if (dy === 1) base = "#b87b4c";
        else if (dy === 2) base = "#aa6d40";
        else if (dy === rh - 1) base = "#663b1f";
        else if (dy === rh - 2) base = "#7d4a28";
        for (let x = 0; x < w; x++) {
          let c = base;
          if (dy > 0 && dy < rh - 1 && rnd() < 0.14) {
            c = rnd() > 0.5 ? "#87522e" : "#ad7042";
          }
          ctx.fillStyle = c;
          ctx.fillRect(x, y0 + dy, 1, 1);
        }
      }
      // Subtle log knot
      const kx = Math.floor(rnd() * 24) + 3;
      ctx.fillStyle = "#5c341a";
      ctx.fillRect(kx, y0 + 3, 3, 2);
      ctx.fillStyle = "#7a4927";
      ctx.fillRect(kx + 1, y0 + 3, 1, 1);
    }
  }, 2, 1.5);

  // 7. Cottage stone foundation & chimney brick
  lib.stoneWall = makePixelTexture(32, 16, (ctx, w, h) => {
    const rnd = mulberry32(402);
    ctx.fillStyle = "#525860";
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 2; row++) {
      const offset = row % 2 === 0 ? 0 : 4;
      for (let col = -1; col < 5; col++) {
        const bx = col * 8 + offset;
        const by = row * 8;
        const shades = ["#7e858c", "#8c939a", "#717880", "#959ca3"];
        ctx.fillStyle = shades[Math.floor(rnd() * shades.length)];
        ctx.fillRect(bx + 1, by + 1, 6, 6);
        ctx.fillStyle = "#a8b0b8";
        ctx.fillRect(bx + 1, by + 1, 5, 1);
        ctx.fillStyle = "#5d646c";
        ctx.fillRect(bx + 1, by + 6, 6, 1);
      }
    }
  }, 3, 1);

  lib.brickChimney = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(403);
    ctx.fillStyle = "#5a463d";
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) * 4;
      for (let col = -1; col < 3; col++) {
        const x = col * 8 + off;
        const y = row * 4;
        const tones = ["#9d4e3d", "#8d4334", "#ae5b47", "#7d3a2c"];
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(x + 1, y + 1, 6, 3);
      }
    }
  }, 1, 2);

  // 8. Warm terracotta cedar roof shingles with snowy edges
  lib.roofShingles = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(404);
    ctx.fillStyle = "#52231d";
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * 4;
      const y = row * 4;
      for (let col = -1; col < 5; col++) {
        const x = col * 8 + off;
        const tones = ["#8f4034", "#7f362c", "#9c493b", "#723026"];
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(x + 1, y, 7, 3);
        ctx.fillStyle = "#b05c4b";
        ctx.fillRect(x + 1, y, 6, 1);
        // occasional frost pixel
        if (rnd() < 0.22) {
          ctx.fillStyle = "#e7f1fa";
          ctx.fillRect(x + 2, y, 3, 1);
        }
      }
    }
  }, 3, 2);

  // 9. Warm wooden planks (porch, bridge, floor, door, shipping bin)
  lib.woodPlank = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(405);
    for (let p = 0; p < 4; p++) {
      const y0 = p * 8;
      const base = p % 2 === 0 ? "#a96e3f" : "#9c6338";
      ctx.fillStyle = base;
      ctx.fillRect(0, y0, w, 8);
      ctx.fillStyle = "#573218";
      ctx.fillRect(0, y0 + 7, w, 1);
      ctx.fillStyle = "#bc8250";
      ctx.fillRect(0, y0, w, 1);
      // vertical board join
      const jx = (p * 11 + 7) % w;
      ctx.fillStyle = "#573218";
      ctx.fillRect(jx, y0, 1, 8);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "#8b562f" : "#b57a49";
        ctx.fillRect(Math.floor(rnd() * w), y0 + 1 + Math.floor(rnd() * 5), 2, 1);
      }
    }
  }, 2, 2);

  lib.woodDoor = makePixelTexture(16, 24, (ctx, w, h) => {
    ctx.fillStyle = "#542e16";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#8a522a";
    ctx.fillRect(1, 1, w - 2, h - 2);
    // Vertical planks
    for (let x = 4; x < w - 2; x += 4) {
      ctx.fillStyle = "#5e3418";
      ctx.fillRect(x, 1, 1, h - 2);
      ctx.fillStyle = "#9d6237";
      ctx.fillRect(x + 1, 1, 1, h - 2);
    }
    // Iron cross braces
    ctx.fillStyle = "#3c3b40";
    ctx.fillRect(1, 5, w - 2, 2);
    ctx.fillRect(1, 17, w - 2, 2);
    // Warm mini peek window at top of door
    ctx.fillStyle = "#482610";
    ctx.fillRect(5, 7, 6, 6);
    ctx.fillStyle = "#ffd278";
    ctx.fillRect(6, 8, 4, 4);
    ctx.fillStyle = "#482610";
    ctx.fillRect(7, 8, 1, 4);
    ctx.fillRect(6, 10, 4, 1);
    // Brass handle
    ctx.fillStyle = "#f2c55a";
    ctx.fillRect(12, 13, 2, 2);
  });

  // 10. Glowing multi-pane cottage window
  lib.windowWarm = makePixelTexture(16, 16, (ctx, w, h) => {
    // Wood frame
    ctx.fillStyle = "#4c2b15";
    ctx.fillRect(0, 0, w, h);
    // Warm golden glass gradient
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const t = (y - 2) / (h - 4);
        ctx.fillStyle = t < 0.35 ? "#ffea9c" : t < 0.72 ? "#ffc75f" : "#f29d38";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Cozy curtain corners
    ctx.fillStyle = "#c95342";
    ctx.fillRect(2, 2, 2, 4);
    ctx.fillRect(12, 2, 2, 4);
    // Cross mullions
    ctx.fillStyle = "#573219";
    ctx.fillRect(7, 1, 2, h - 2);
    ctx.fillRect(1, 7, w - 2, 2);
    // Frost specular dots
    ctx.fillStyle = "#fff8dc";
    ctx.fillRect(3, 4, 1, 1);
    ctx.fillRect(10, 4, 1, 1);
  });

  // 11. Winter spruce pine foliage with snowy tufts
  lib.pineLeaves = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(501);
    const greens = ["#1e3f30", "#27503c", "#326349", "#173326"];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c = greens[Math.floor(rnd() * greens.length)];
        // Frost/snow tips near top of each tier
        if (y < 3 && rnd() < 0.78) c = rnd() > 0.4 ? "#eef5fc" : "#d9e7f4";
        else if (y === 3 && rnd() < 0.38) c = "#e3eef8";
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 12. Pine tree bark
  lib.bark = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(502);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const strip = x % 4 === 0 ? "#412718" : x % 4 === 2 ? "#68422b" : "#553420";
        ctx.fillStyle = rnd() < 0.2 ? "#3b2315" : strip;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // 13. Frozen crystalline creek ice
  lib.frozenIce = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(601);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = rnd();
        ctx.fillStyle = r < 0.35 ? "#8ec5e4" : r < 0.72 ? "#9ed0ec" : "#b8e0f5";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Crisp diagonal ice shine streaks
    ctx.fillStyle = "#e8f7ff";
    for (let i = 0; i < 6; i++) {
      const sx = Math.floor(rnd() * 22);
      const sy = Math.floor(rnd() * 22);
      for (let k = 0; k < 6; k++) {
        ctx.fillRect((sx + k) % w, (sy + k) % h, 1, 1);
      }
    }
  }, 1, 6);

  // 14. Interior warm cabin floor planks & cozy woven rug
  lib.interiorFloor = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(701);
    for (let p = 0; p < 4; p++) {
      const y0 = p * 8;
      ctx.fillStyle = p % 2 === 0 ? "#b87a46" : "#a96d3d";
      ctx.fillRect(0, y0, w, 8);
      ctx.fillStyle = "#6c3f1e";
      ctx.fillRect(0, y0 + 7, w, 1);
      ctx.fillStyle = "#ca8d56";
      ctx.fillRect(0, y0, w, 1);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "#9b6032" : "#c78b55";
        ctx.fillRect(Math.floor(rnd() * w), y0 + 1 + Math.floor(rnd() * 5), 3, 1);
      }
    }
  }, 3, 3);

  lib.cozyRug = makePixelTexture(24, 16, (ctx, w, h) => {
    ctx.fillStyle = "#9c352d";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e6ba6b";
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = "#a83b32";
    ctx.fillRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = "#3f6a54";
    ctx.fillRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = "#f2d699";
    ctx.fillRect(8, 7, w - 16, 2);
  });

  // 15. Soft radial bokeh snowflake (NO chunky pixel '+' sticker look — dreamy 3D volumetric snow!)
  const flakeCanvas = document.createElement("canvas");
  flakeCanvas.width = 32;
  flakeCanvas.height = 32;
  const flakeCtx = flakeCanvas.getContext("2d");
  const flakeGrad = flakeCtx.createRadialGradient(16, 16, 1.5, 16, 16, 15.5);
  flakeGrad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  flakeGrad.addColorStop(0.38, "rgba(248, 252, 255, 0.88)");
  flakeGrad.addColorStop(0.72, "rgba(225, 238, 255, 0.32)");
  flakeGrad.addColorStop(1.0, "rgba(220, 235, 255, 0.0)");
  flakeCtx.fillStyle = flakeGrad;
  flakeCtx.fillRect(0, 0, 32, 32);
  const flakeTex = new THREE.CanvasTexture(flakeCanvas);
  flakeTex.minFilter = THREE.LinearMipmapLinearFilter;
  flakeTex.magFilter = THREE.LinearFilter;
  flakeTex.needsUpdate = true;
  lib.snowflake = flakeTex;

  // 15b. Extended-repeat architectural variants (keeps crisp uniform texel density on elongated cabin!)
  const cloneTex = (tex, rx, ry) => {
    const c = tex.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  lib.logWallLong = cloneTex(lib.logWall, 4, 1.5);
  lib.stoneWallLong = cloneTex(lib.stoneWall, 5, 1);
  lib.stoneWallTall = cloneTex(lib.stoneWall, 1.5, 3);
  lib.roofShinglesLong = cloneTex(lib.roofShingles, 5, 2.2);
  lib.interiorFloorWide = cloneTex(lib.interiorFloor, 5, 3);

  // Soft feathered alpha gradient texture for volumetric window sun/moon shafts (zero harsh edges!)
  const shaftCanvas = document.createElement("canvas");
  shaftCanvas.width = 64;
  shaftCanvas.height = 64;
  const sCtx = shaftCanvas.getContext("2d");
  const img = sCtx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    const v = y / 63; // 0 = top near window, 1 = bottom toward floor
    const fadeY = Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.5) * Math.pow(1 - v, 1.35);
    for (let x = 0; x < 64; x++) {
      const u = (x / 63) * 2 - 1; // -1..1
      const fadeX = Math.pow(Math.max(0, 1 - u * u), 1.4);
      const a = Math.round(Math.min(1, fadeX * fadeY * 2.1) * 255);
      const idx = (y * 64 + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = a;
    }
  }
  sCtx.putImageData(img, 0, 0);
  const shaftTex = new THREE.CanvasTexture(shaftCanvas);
  shaftTex.needsUpdate = true;
  lib.lightShaftSoft = shaftTex;

  // Soft warm radial fire glow halo (for refined fireplace & campfire realism!)
  const fireCanvas = document.createElement("canvas");
  fireCanvas.width = 64;
  fireCanvas.height = 64;
  const fCtx = fireCanvas.getContext("2d");
  const grad = fCtx.createRadialGradient(32, 36, 2, 32, 34, 30);
  grad.addColorStop(0.0, "rgba(255, 245, 190, 0.95)");
  grad.addColorStop(0.32, "rgba(255, 162, 55, 0.65)");
  grad.addColorStop(0.68, "rgba(235, 78, 22, 0.24)");
  grad.addColorStop(1.0, "rgba(180, 40, 10, 0.0)");
  fCtx.fillStyle = grad;
  fCtx.fillRect(0, 0, 64, 64);
  const fireGlowTex = new THREE.CanvasTexture(fireCanvas);
  fireGlowTex.needsUpdate = true;
  lib.fireGlowSoft = fireGlowTex;

  // Soft billowy smoke puff (clustered radial blobs, feathered edge) for chimney smoke
  const smokeCanvas = document.createElement("canvas");
  smokeCanvas.width = 64;
  smokeCanvas.height = 64;
  const smCtx = smokeCanvas.getContext("2d");
  const smRnd = mulberry32(909);
  for (let i = 0; i < 9; i++) {
    const cx = 32 + (smRnd() - 0.5) * 22;
    const cy = 32 + (smRnd() - 0.5) * 18;
    const r = 11 + smRnd() * 11;
    const g = smCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.6, "rgba(255,255,255,0.2)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    smCtx.fillStyle = g;
    smCtx.fillRect(0, 0, 64, 64);
  }
  const smokeTex = new THREE.CanvasTexture(smokeCanvas);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  lib.smokePuff = smokeTex;

  // Festive gift-wrap polka & stripe pattern texture
  lib.giftWrapPolka = makePixelTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? "#f2ece0" : "#e3d6c0";
      ctx.fillRect(0, y, w, 2);
    }
    ctx.fillStyle = "#fff9ec";
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(11, 11, 2, 2);
    ctx.fillRect(11, 3, 2, 2);
    ctx.fillRect(3, 11, 2, 2);
  });

  // 15c. Cozy red painted barn vertical siding
  lib.barnWood = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(801);
    for (let x = 0; x < w; x += 4) {
      const shade = (x / 4) % 2 === 0 ? "#a4382c" : "#963126";
      ctx.fillStyle = shade;
      ctx.fillRect(x, 0, 4, h);
      ctx.fillStyle = "#5c1b15";
      ctx.fillRect(x + 3, 0, 1, h);
      ctx.fillStyle = "#be4a3b";
      ctx.fillRect(x, 0, 1, h);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = rnd() > 0.5 ? "#872920" : "#b34436";
        ctx.fillRect(x + 1 + Math.floor(rnd() * 2), Math.floor(rnd() * h), 1, 2);
      }
    }
  }, 2, 1.5);

  // 15d. Golden woven hay bale texture
  lib.hayBale = makePixelTexture(16, 16, (ctx, w, h) => {
    const rnd = mulberry32(802);
    ctx.fillStyle = "#d9a944";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = rnd();
        if (r < 0.25) ctx.fillStyle = "#e8be58";
        else if (r < 0.5) ctx.fillStyle = "#c49232";
        else if (r < 0.65) ctx.fillStyle = "#f2d277";
        else continue;
        ctx.fillRect(x, y, 2, 1);
      }
    }
    // Twine binding straps
    ctx.fillStyle = "#7a5324";
    ctx.fillRect(4, 0, 1, h);
    ctx.fillRect(11, 0, 1, h);
  });

  // 15e. Paddock trampled snow & golden straw bedding ground
  lib.paddockGround = makePixelTexture(32, 32, (ctx, w, h) => {
    const rnd = mulberry32(803);
    ctx.fillStyle = "#d8e3ec";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = rnd();
        if (r < 0.22) ctx.fillStyle = "#c8cfd6";
        else if (r < 0.36) ctx.fillStyle = "#9e8569";
        else if (r < 0.48) ctx.fillStyle = "#e8f0f6";
        else if (r < 0.58) ctx.fillStyle = "#d4b05c";
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Scattered straw wisps
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "#dfba59" : "#b8903c";
      ctx.fillRect(Math.floor(rnd() * (w - 3)), Math.floor(rnd() * h), 3, 1);
    }
  }, 4, 4);

  // 15f. Interior cozy patchwork quilt
  lib.quiltPatch = makePixelTexture(24, 24, (ctx, w, h) => {
    const colors = ["#b83c35", "#e2b259", "#3e6e54", "#d96c45", "#4c6c8c", "#f0d7a8"];
    const cell = 6;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = colors[(r * 3 + c * 2) % colors.length];
        ctx.fillRect(c * cell, r * cell, cell, cell);
        ctx.fillStyle = "rgba(255,248,230,0.35)";
        ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, 1);
        ctx.fillStyle = "rgba(60,28,12,0.32)";
        ctx.fillRect(c * cell, r * cell + cell - 1, cell, 1);
        ctx.fillRect(c * cell + cell - 1, r * cell, 1, cell);
      }
    }
  });

  // 15g. Red & cream gingham checkered table runner / curtain trim
  lib.tableRunner = makePixelTexture(16, 16, (ctx, w, h) => {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const evenX = (x / 4) % 2 === 0;
        const evenY = (y / 4) % 2 === 0;
        ctx.fillStyle = evenX && evenY ? "#c23b32" : evenX || evenY ? "#e38c7b" : "#faf0dc";
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }, 2, 2);

  // 15h. Framed winter Winterfoot painting (pixel art landscape!)
  lib.paintingSnow = makePixelTexture(24, 16, (ctx, w, h) => {
    // Twilight winter sky
    ctx.fillStyle = "#365080";
    ctx.fillRect(0, 0, w, 5);
    ctx.fillStyle = "#887696";
    ctx.fillRect(0, 5, w, 3);
    ctx.fillStyle = "#ebaa71";
    ctx.fillRect(0, 8, w, 3);
    // Sun disc
    ctx.fillStyle = "#ffe69e";
    ctx.fillRect(16, 6, 3, 3);
    // Snowy peaks
    ctx.fillStyle = "#5c6f91";
    ctx.fillRect(2, 7, 7, 4);
    ctx.fillRect(4, 5, 4, 2);
    ctx.fillRect(11, 6, 8, 5);
    ctx.fillRect(13, 4, 4, 2);
    ctx.fillStyle = "#eef6fc";
    ctx.fillRect(4, 5, 3, 2);
    ctx.fillRect(13, 4, 3, 2);
    // Snow field
    ctx.fillStyle = "#dce8f2";
    ctx.fillRect(0, 11, w, 5);
    // Tiny pines & glowing cabin
    ctx.fillStyle = "#224634";
    ctx.fillRect(3, 9, 2, 4);
    ctx.fillRect(20, 8, 2, 5);
    ctx.fillStyle = "#804926";
    ctx.fillRect(9, 10, 4, 3);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(10, 11, 2, 1);
  });

  // 15i. Bookshelf colorful spines texture
  lib.bookShelf = makePixelTexture(24, 24, (ctx, w, h) => {
    const rnd = mulberry32(809);
    ctx.fillStyle = "#4d2a14";
    ctx.fillRect(0, 0, w, h);
    const spines = ["#b83a32", "#3a6e4c", "#3b5d8a", "#d49b3d", "#7d456b", "#c96838", "#e8d5b0"];
    for (let shelf = 0; shelf < 3; shelf++) {
      const y0 = shelf * 8 + 1;
      ctx.fillStyle = "#2b160a";
      ctx.fillRect(1, y0, w - 2, 6);
      let x = 2;
      while (x < w - 3) {
        const bw = rnd() > 0.5 ? 2 : 3;
        const bh = 4 + (rnd() > 0.35 ? 2 : 1);
        ctx.fillStyle = spines[Math.floor(rnd() * spines.length)];
        ctx.fillRect(x, y0 + (6 - bh), Math.min(bw, w - 2 - x), bh);
        ctx.fillStyle = "rgba(255,245,215,0.45)";
        ctx.fillRect(x, y0 + (6 - bh) + 1, Math.min(bw, w - 2 - x), 1);
        x += bw + (rnd() > 0.8 ? 1 : 0);
      }
      ctx.fillStyle = "#6e3e1e";
      ctx.fillRect(0, y0 + 6, w, 1);
    }
  });

  // 15j. Cozy stone hearth & kitchen ceramic backsplash tile
  lib.kitchenTile = makePixelTexture(16, 16, (ctx, w, h) => {
    ctx.fillStyle = "#b8a894";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x += 4) {
        const alt = ((x + y) / 4) % 2 === 0;
        ctx.fillStyle = alt ? "#efe6d4" : "#d9cbb4";
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }, 3, 2);

  // 16. Pixel-art Hotbar Icon Data URLs (16x16 upscaled cleanly via CSS pixelated)
  const iconDataURL = (drawFn) => createPixelCanvas(16, 16, drawFn).toDataURL();

  lib.icons = {
    hoe: iconDataURL((c) => {
      // Wooden handle
      c.fillStyle = "#6b3c1b";
      for (let i = 0; i < 10; i++) c.fillRect(3 + i, 12 - i, 2, 2);
      c.fillStyle = "#a86c3d";
      for (let i = 0; i < 9; i++) c.fillRect(3 + i, 12 - i, 1, 1);
      // Steel blade
      c.fillStyle = "#5a6773";
      c.fillRect(8, 2, 6, 3);
      c.fillRect(12, 4, 3, 4);
      c.fillStyle = "#b7c7d6";
      c.fillRect(9, 2, 4, 2);
      c.fillRect(13, 4, 1, 3);
    }),
    watering_can: iconDataURL((c) => {
      c.fillStyle = "#3a6fa3";
      c.fillRect(5, 6, 7, 7);
      c.fillStyle = "#64a4de";
      c.fillRect(6, 7, 5, 5);
      c.fillStyle = "#9fd0fa";
      c.fillRect(6, 7, 2, 4);
      // Handle
      c.fillStyle = "#2b527a";
      c.fillRect(6, 3, 5, 1);
      c.fillRect(5, 4, 1, 2);
      c.fillRect(11, 4, 2, 5);
      // Spout
      c.fillStyle = "#4c86bf";
      c.fillRect(2, 6, 3, 2);
      c.fillRect(1, 5, 2, 2);
      c.fillStyle = "#bce5ff";
      c.fillRect(1, 8, 1, 2);
      c.fillRect(2, 10, 1, 2);
    }),
    seed_carrot: iconDataURL((c) => {
      // Seed packet
      c.fillStyle = "#6e4624";
      c.fillRect(3, 2, 10, 12);
      c.fillStyle = "#e6c38d";
      c.fillRect(4, 3, 8, 10);
      // Tiny carrot emblem
      c.fillStyle = "#3a8c3f";
      c.fillRect(7, 4, 2, 2);
      c.fillStyle = "#f27824";
      c.fillRect(6, 6, 4, 3);
      c.fillRect(7, 9, 2, 3);
    }),
    seed_radish: iconDataURL((c) => {
      c.fillStyle = "#6e4624";
      c.fillRect(3, 2, 10, 12);
      c.fillStyle = "#e6c38d";
      c.fillRect(4, 3, 8, 10);
      c.fillStyle = "#3b9144";
      c.fillRect(6, 4, 4, 2);
      c.fillStyle = "#d94f8a";
      c.fillRect(6, 6, 4, 2);
      c.fillStyle = "#faf5f2";
      c.fillRect(6, 8, 4, 3);
      c.fillRect(7, 11, 2, 1);
    }),
    seed_cabbage: iconDataURL((c) => {
      c.fillStyle = "#6e4624";
      c.fillRect(3, 2, 10, 12);
      c.fillStyle = "#e6c38d";
      c.fillRect(4, 3, 8, 10);
      c.fillStyle = "#5aa870";
      c.fillRect(5, 5, 6, 6);
      c.fillStyle = "#a5e0b4";
      c.fillRect(6, 6, 4, 4);
      c.fillStyle = "#e3f7e8";
      c.fillRect(7, 7, 2, 2);
    }),
    seed_pumpkin: iconDataURL((c) => {
      c.fillStyle = "#6e4624";
      c.fillRect(3, 2, 10, 12);
      c.fillStyle = "#e6c38d";
      c.fillRect(4, 3, 8, 10);
      c.fillStyle = "#3e7d34";
      c.fillRect(7, 4, 2, 2);
      c.fillStyle = "#e67c22";
      c.fillRect(5, 6, 6, 5);
      c.fillStyle = "#f7a440";
      c.fillRect(6, 7, 4, 3);
    }),
    carrot_item: iconDataURL((c) => {
      c.fillStyle = "#2f7d32";
      c.fillRect(9, 2, 3, 3);
      c.fillRect(11, 4, 3, 2);
      c.fillStyle = "#52b355";
      c.fillRect(10, 2, 2, 2);
      c.fillStyle = "#d65d15";
      for (let i = 0; i < 8; i++) {
        const size = Math.max(2, 5 - Math.floor(i / 2));
        c.fillRect(9 - i, 4 + i, size, size);
      }
      c.fillStyle = "#ff9636";
      for (let i = 0; i < 6; i++) {
        c.fillRect(9 - i, 5 + i, 2, 2);
      }
    }),
    firewood: iconDataURL((c) => {
      c.fillStyle = "#4d2b16";
      c.fillRect(2, 8, 11, 5);
      c.fillStyle = "#8f552d";
      c.fillRect(3, 9, 9, 3);
      c.fillStyle = "#d9a973";
      c.fillRect(11, 9, 2, 3);
      c.fillStyle = "#4d2b16";
      c.fillRect(4, 4, 10, 5);
      c.fillStyle = "#a36538";
      c.fillRect(5, 5, 8, 3);
      c.fillStyle = "#e5bd8a";
      c.fillRect(12, 5, 2, 3);
    }),
  };

  return lib;
}
