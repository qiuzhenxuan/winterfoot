import * as THREE from "three";
import { createTextureLibrary } from "./textures.js";
import { AtmosphereSystem } from "./atmosphere.js";
import { OutdoorWorld } from "./world.js";
import { AlpineLandscape } from "./landscape.js";
import { FarmSystem, CROP_DEFS } from "./farm.js";
import { PlayerCharacter, WildlifeSystem } from "./entities.js";
import { CottageInterior } from "./interior.js";
import { SoundEngine } from "./audio.js";
import { GameUI } from "./ui.js";
import { GIFT_GALLERY_ITEMS, LETTER_CONTENT, BIRTHDAY, MAILBOX_LETTERS, ANIMAL_BLESSINGS, fillBirthdayText } from "./giftConfig.js";
import { WorldFireworks } from "./worldFireworks.js";
import { EmoteSystem } from "./emotes.js";

const BDAY_STORAGE_KEY = "winterfootBirthday.v1";
const SAVE_KEY = "winterfootSave.v1";

// One-time migration from the old "Snow Valley" save keys so existing progress survives the rename.
try {
  for (const [oldKey, newKey] of [
    ["snowValleyBirthday.v1", BDAY_STORAGE_KEY],
    ["snowValleySave.v1", SAVE_KEY],
  ]) {
    const v = localStorage.getItem(oldKey);
    if (v !== null) {
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, v);
      localStorage.removeItem(oldKey);
    }
  }
} catch {}

function loadGameSave() {
  try {
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return raw && raw.v === 1 ? raw : null;
  } catch {
    return null;
  }
}

function loadBirthdayProgress() {
  try {
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      localStorage.removeItem(BDAY_STORAGE_KEY);
    }
    const raw = JSON.parse(localStorage.getItem(BDAY_STORAGE_KEY) || "null");
    if (raw && typeof raw === "object") {
      return {
        introSeen: !!raw.introSeen,
        enter: !!raw.enter,
        cake: !!raw.cake,
        gifts: Array.isArray(raw.gifts) ? raw.gifts : [],
        letter: !!raw.letter,
        finaleSeen: !!raw.finaleSeen,
      };
    }
  } catch {
    // localStorage unavailable (private mode / file://) — just start fresh
  }
  return { introSeen: false, enter: false, cake: false, gifts: [], letter: false, finaleSeen: false };
}

const ANIMAL_PRICES = {
  egg: 45,
  milk: 65,
  wool: 80,
};

class WinterfootGame {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    this.isMobileDevice = isCoarse || "ontouchstart" in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 820;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.isMobileDevice || (window.devicePixelRatio || 1) < 2 });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobileDevice ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this._setupEnvironmentReflection();

    // Classic Stardew 3/4 oblique perspective camera (near=0.5 boosts depth-buffer precision; widens FOV gently on portrait phones!)
    this.camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.5, 320);
    this._syncCameraViewport();
    this.camDist = 22.6;
    this.camTargetDist = 22.6;
    this.camYaw = 0;
    this.camTargetYaw = 0;
    this.camPitch = 0.44;
    this.camTargetPitch = 0.44;
    this.camFocus = new THREE.Vector3(-0.2, 0.95, -1.8);
    this.photoMode = false;
    this.photoPreset = null;

    const maxAniso = this.renderer.capabilities ? this.renderer.capabilities.getMaxAnisotropy() : 8;
    this.textures = createTextureLibrary(maxAniso);
    this.sound = new SoundEngine();
    this.atmosphere = new AtmosphereSystem(this.scene, this.textures, { isMobilePerf: this.isMobileDevice });
    this.world = new OutdoorWorld(this.scene, this.textures);
    // 360° procedural alpine ranges (visible through cabin windows too) + rolling valley hills & distant pine belt
    this.landscape = new AlpineLandscape(this.world.group, this.scene, this.textures, { isMobile: this.isMobileDevice });
    this.farm = new FarmSystem(this.scene, this.textures, this.world);
    this.player = new PlayerCharacter(this.scene);
    this.wildlife = new WildlifeSystem(this.scene, this.world);
    // Stardew-style pixel emote bubbles + the little arrow marking the current interact target
    this.emotes = new EmoteSystem(this.scene);
    this.wildlife.emotes = this.emotes;
    // Real 3D fireworks over the valley (the "world answers your wish" moment)
    this.worldFireworks = new WorldFireworks(this.scene, this.sound, { isMobile: this.isMobileDevice });
    this.worldFireworks.onBurst = (b) => this._onWorldFireworkBurst(b);
    // Rough skyline of what stands around the valley (hills + pine belt + ranges), used so
    // shells always burst in front of whatever would hide them
    this.worldFireworks.occluderHeight = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 24) return 2.5;
      let h = this.landscape.valleyHeight(x, z);
      if (r > 28) h += 9; // pine forest belt
      if (r > 58) h = Math.max(h, 8 + (r - 58) * 0.7);
      return h;
    };
    this.skyShow = null;
    this.interior = new CottageInterior(this.scene, this.textures, {
      isMobilePerf: this.isMobileDevice,
      cakeCandles: BIRTHDAY.candles,
    });

    // Birthday journey progress (persisted so a page refresh doesn't lose anything)
    this.bday = loadBirthdayProgress();
    this.bdayFinaleBusy = false;
    this.bdayHoldUntil = 0;
    this.letterReachedEnd = false;

    // Game State
    this.day = 1;
    this.gold = 150;
    this.waterMax = 16;
    this.water = 16;
    this.isIndoor = false;
    this.inTransition = false;
    this.savedOutdoorPos = new THREE.Vector3(-0.8, 0, -2.55);

    this.inventory = {
      seed_carrot: 12,
      seed_radish: 10,
      seed_cabbage: 8,
      seed_pumpkin: 6,
      carrot: 2,
      radish: 0,
      cabbage: 0,
      pumpkin: 0,
      firewood: 3,
      egg: 0,
      milk: 0,
      wool: 0,
    };

    this.selectedSlot = 0;
    this.mailRead = [];

    // Restore the farm from the last visit (crops, gold, animals, day, weather...)
    this.savedGame = loadGameSave();
    if (this.savedGame) this._applySave(this.savedGame);
    this.keys = new Set();
    this.mouseNDC = new THREE.Vector2(-99, -99);
    this.raycaster = new THREE.Raycaster();
    this.isRightDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.activeInteract = null;

    // Multi-touch Mobile State: Left Analog Joystick Wheel + Right Minecraft-Style Tap/Drag/Pinch!
    this.joyState = {
      active: false,
      pointerId: null,
      x: 0,
      z: 0,
      mag: 0,
      sprinting: false,
      centerX: 0,
      centerY: 0,
      maxR: 42,
    };
    this.canvasPointers = new Map();
    this.touchCam = {
      mode: "none",
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      moved: false,
      startTime: 0,
      pinchStartDist: 0,
      pinchStartCamDist: 23.2,
    };

    this.ui = new GameUI(this.textures.icons, {
      onSetTime: (h) => {
        this.sound.unlock();
        this.atmosphere.setTime(h);
      },
      onToggleTimeFlow: () => {
        this.sound.unlock();
        this.atmosphere.timeFlow = !this.atmosphere.timeFlow;
        return this.atmosphere.timeFlow;
      },
      onSetSnow: (lvl) => {
        this.sound.unlock();
        this.atmosphere.setSnowLevel(lvl);
        this.sound.setWeather(lvl);
      },
      onNextDay: () => {
        this.sound.unlock();
        this.triggerNewDay("漫雪散去，新的一天到来...");
      },
      onToggleIndoor: () => {
        this.sound.unlock();
        if (this.isIndoor) this.leaveCottage();
        else this.enterCottage();
      },
      onToggleAudio: () => {
        this.sound.unlock();
        this.sound.setMuted(!this.sound.muted);
        return this.sound.muted;
      },
      onSelectSlot: (idx) => {
        this.sound.unlock();
        this.selectSlot(idx);
      },
      onInteract: () => {
        this.sound.unlock();
        this._handleContextInteract();
      },
      onFarmAction: () => {
        this.sound.unlock();
        this._handleFarmAction(null);
      },
      onResetCamera: () => {
        this.sound.unlock();
        this.camTargetYaw = 0;
        this.camTargetPitch = this.isIndoor ? 0.44 : 0.44;
        this.camTargetDist = this.isIndoor ? 16.4 : 22.6;
      },
      onDialogueBlip: () => this.sound.dialogueBlip(),
      onGiftUnwrapped: (item, count, total) => {
        this.sound.wrapTear();
        this.bday.gifts = Array.from(new Set([...this.bday.gifts, item.id]));
        this._saveBirthday();
        if (count >= total) this._completeBirthdayQuest("gifts");
        else this._renderBirthdayQuests();
      },
      onGiftGalleryClosed: () => this._maybeStartFinale(),
      onLetterSealBroken: () => {
        this.sound.sealCrack();
        if (LETTER_CONTENT.pages && LETTER_CONTENT.pages.length <= 1) this.letterReachedEnd = true;
      },
      onLetterPageTurn: () => {
        this.sound.paperRustle();
        if (this.ui.letterPage >= this.ui.letterPages.length - 1) this.letterReachedEnd = true;
      },
      onLetterClosed: (opened) => {
        if (opened && (this.letterReachedEnd || this.ui.letterPages.length <= 1)) {
          this._completeBirthdayQuest("letter");
        }
        this._maybeStartFinale();
      },
      onReplayBirthday: () => this._replayBirthday(),
      onMailClosed: () => {
        this.sound.paperRustle();
        if (this._getNextMail()) this.ui.showToast("信箱里还有一封没看的信");
        else if (this._hasFutureMail()) this.ui.showToast("把信收好了。明天早上信箱里还会有新的信");
      },
      onReplayFireworks: () => this._startWishFireworks(),
    });

    this.ui.dayBadge = "";
    if (this.savedGame) this.ui.syncWeatherButtons(this.atmosphere.snowLevel);
    this.sound.setWeather(this.atmosphere.snowLevel);
    this.ui.buildHotbar(this._getHotbarSlots(), this.selectedSlot);
    this.ui.initGiftGallery(GIFT_GALLERY_ITEMS, this.bday.gifts);
    this.ui.initLetter(LETTER_CONTENT);
    this.ui.setLetterEnvelopeOpened(this.bday.letter);
    this.ui.setDialogueSpeaker(BIRTHDAY.senderName, BIRTHDAY.portrait, BIRTHDAY.portraitEmoji);
    if (this.bday.cake) this.interior.blowOutCake(true);
    this.ui.setFireworksReplayVisible(!!(this.bday.cake || this.bday.finaleSeen));
    this._bindEvents();

    // Read-only / inspection helper
    window.__WINTERFOOT__ = {
      getState: () => ({
        day: this.day,
        gold: this.gold,
        timeHours: Number(this.atmosphere.timeHours.toFixed(2)),
        snowLevel: this.atmosphere.snowLevel,
        isIndoor: this.isIndoor,
        coopEggs: this.wildlife.coopEggs,
        farmAnimalsCount: this.wildlife.farmAnimals.length,
        playerPos: { x: +this.player.position.x.toFixed(2), z: +this.player.position.z.toFixed(2) },
        inventory: { ...this.inventory },
        perf: this._perf ? { fps: Math.round(this._perf.fps), qualityLevel: this._perf.level, pixelRatio: this.renderer.getPixelRatio() } : null,
      }),
      getWildlife: () => ({
        playerSpeed: +this.wildlife.playerSpeed.toFixed(2),
        rabbits: this.wildlife.rabbits.map((r) => ({
          name: r.name,
          x: +r.mesh.position.x.toFixed(2),
          z: +r.mesh.position.z.toFixed(2),
          alert: +(r.alertTimer || 0).toFixed(2),
          flee: +(r.fleeTimer || 0).toFixed(2),
        })),
      }),
      getSnow: () => {
        const a = this.atmosphere;
        const arr = a.snowPoints.geometry.attributes.position.array;
        let inAir = 0;
        let inView = 0;
        const v = new THREE.Vector3();
        this.camera.updateMatrixWorld();
        for (let i = 0; i < arr.length; i += 3) {
          if (arr[i + 1] <= 0.05) continue;
          inAir++;
          v.set(arr[i], arr[i + 1], arr[i + 2]);
          const dist = v.distanceTo(this.camera.position);
          v.project(this.camera);
          if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1 && dist > 2 && dist < 40) inView++;
        }
        return {
          level: a.snowLevel,
          visible: a.snowPoints.visible,
          density: +a.snowBlend.density.toFixed(3),
          heavy: +a.snowBlend.heavy.toFixed(3),
          live: a.snowLive,
          inAir,
          inView,
          cam: [+this.camera.position.x.toFixed(1), +this.camera.position.y.toFixed(1), +this.camera.position.z.toFixed(1)],
          drawCount: a.snowPoints.geometry.drawRange.count,
          accumulation: +(this.world.snowAccum || 0).toFixed(3),
        };
      },
      setTime: (h) => this.atmosphere.setTime(h),
      playWishFireworks: () => this._startWishFireworks(),
      shootingStar: () => this.worldFireworks.shootingStar(),
      testShell: (kind) => this.worldFireworks._launchShell({ kind, scale: 1.3 }),
      setAurora: (on) => { this.atmosphere.forceAurora = on; },
      fireworksTimeScale: (k) => { this.worldFireworks.timeScale = k; },
      getFireworks: () => ({
        alive: this.worldFireworks.alive.length,
        showOn: this.worldFireworks.showOn,
        shells: this.worldFireworks.shellCount,
        flash: +this.worldFireworks.flash.toFixed(2),
        cam: +this._skyCamWeight().toFixed(2),
        pitch: +this.camPitch.toFixed(2),
        stats: this.worldFireworks.stats,
        camPos: this.camera.position.toArray().map((v) => +v.toFixed(1)),
      }),
      setSnow: (s) => {
        this.atmosphere.setSnowLevel(s);
        this.sound.setWeather(s);
      },
      setCamera: (yaw, dist, pitch) => {
        if (typeof pitch === "number") {
          this.photoPreset = null;
          this.camTargetPitch = pitch;
          this.camPitch = pitch;
        }
        if (typeof yaw === "number") {
          this.camTargetYaw = yaw;
          this.camYaw = yaw;
        }
        if (typeof dist === "number") {
          this.camTargetDist = dist;
          this.camDist = dist;
        }
      },
      movePlayer: (x, z) => {
        this.player.position.set(x, 0, z);
      },
      enterCottage: () => this.enterCottage(),
      leaveCottage: () => this.leaveCottage(),
      nextDay: () => this.triggerNewDay("新的一天到来..."),
      setPhotoMode: (on) => this.setPhotoMode(on),
      applyShotPreset: (n) => this._applyShotPreset(n),
    };

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.elapsed = 0;
    this._refreshUI();
    this._initUrlPhotoMode();
    this._setupLandscapeGuard();
    if (!this.photoMode) {
      this._startBirthdayJourney();
    }
    this._loop();
    this._startAutoSave();
    // Hide the loading screen once the first frame is on screen
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (window.__finishLoading) window.__finishLoading();
    }));
  }

  // ================= Mailbox =================

  _mailId(letter) {
    return `day${letter.day}:${letter.title || ""}`;
  }

  _getNextMail() {
    let best = null;
    for (const l of MAILBOX_LETTERS) {
      if (l.day > this.day || this.mailRead.includes(this._mailId(l))) continue;
      if (!best || l.day < best.day) best = l;
    }
    return best;
  }

  _hasFutureMail() {
    return MAILBOX_LETTERS.some((l) => l.day > this.day);
  }

  _openMailbox() {
    const letter = this._getNextMail();
    const p = this.world.mailboxPos;
    if (!letter) {
      this.sound.paperRustle();
      this.ui.showToast(this._hasFutureMail() ? "信箱里空空的。睡一觉，明天早上再来看看吧" : "信箱里的信都读完啦");
      return;
    }
    if (this._resetJoystick) this._resetJoystick();
    this.mailRead.push(this._mailId(letter));
    this.sound.letterOpen();
    this._popupAt(p.x, 1.6, p.z, "收到一封信", "#fff0b3");
    this.ui.openMail(fillBirthdayText(letter.title), fillBirthdayText(letter.text), `—— ${BIRTHDAY.senderName}`);
    this._saveGame();
  }

  // ================= Save / load =================

  _applySave(sv) {
    if (typeof sv.day === "number") this.day = Math.max(1, sv.day | 0);
    if (typeof sv.gold === "number") this.gold = Math.max(0, sv.gold | 0);
    if (typeof sv.water === "number") this.water = Math.max(0, Math.min(this.waterMax, sv.water | 0));
    if (sv.inventory && typeof sv.inventory === "object") {
      for (const k of Object.keys(this.inventory)) {
        if (typeof sv.inventory[k] === "number") this.inventory[k] = Math.max(0, sv.inventory[k] | 0);
      }
    }
    if (typeof sv.time === "number") this.atmosphere.setTime(sv.time);
    if (typeof sv.snow === "number") this.atmosphere.setSnowLevel(Math.max(0, Math.min(2, sv.snow | 0)));
    if (sv.farm) this.farm.restoreState(sv.farm);
    if (sv.wildlife) this.wildlife.restoreState(sv.wildlife);
    if (typeof sv.trough === "boolean") this.world.setTroughFilled(sv.trough);
    if (Array.isArray(sv.mailRead)) this.mailRead = sv.mailRead.slice();
  }

  _saveGame() {
    if (this.photoMode || this._resetting) return;
    try {
      const data = {
        v: 1,
        savedAt: Date.now(),
        day: this.day,
        gold: this.gold,
        water: this.water,
        inventory: { ...this.inventory },
        time: +this.atmosphere.timeHours.toFixed(2),
        snow: this.atmosphere.snowLevel,
        farm: this.farm.getState(),
        wildlife: this.wildlife.getState(),
        trough: !!this.world.troughFilled,
        mailRead: this.mailRead,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // storage full / private mode: just keep playing
    }
  }

  _startAutoSave() {
    setInterval(() => this._saveGame(), 8000);
    window.addEventListener("pagehide", () => this._saveGame());
    // Switching apps / tabs: save, silence the music and stop the world; pick up where we left off
    document.addEventListener("visibilitychange", () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) {
        this._saveGame();
        this.keys.clear();
        if (this._resetJoystick) this._resetJoystick();
      }
      this.sound.setPageHidden(hidden);
    });
  }

  // ================= Birthday journey =================

  _saveBirthday() {
    try {
      localStorage.setItem(BDAY_STORAGE_KEY, JSON.stringify(this.bday));
    } catch {
      // ignore (private mode etc.)
    }
  }

  _getBirthdayQuests() {
    const total = GIFT_GALLERY_ITEMS.length;
    const opened = GIFT_GALLERY_ITEMS.filter((g) => this.bday.gifts.includes(g.id)).length;
    return [
      { id: "enter", text: "推开冬麓小屋的木门", done: this.bday.enter },
      { id: "cake", text: "对着餐桌上的蛋糕许个愿", done: this.bday.cake },
      { id: "gifts", text: `拆开窗下的礼物（${opened}/${total}）`, done: total > 0 && opened >= total },
      { id: "letter", text: "读完书桌上的火漆信", done: this.bday.letter },
    ];
  }

  _renderBirthdayQuests(justDoneId = null) {
    this.ui.renderQuestLog(this._getBirthdayQuests(), justDoneId);
  }

  _completeBirthdayQuest(id) {
    if (id === "gifts") {
      // derived from bday.gifts; just celebrate
    } else {
      if (this.bday[id]) return;
      this.bday[id] = true;
    }
    this._saveBirthday();
    this._renderBirthdayQuests(id);
    this.sound.questDone();
    this._maybeStartFinale();
  }

  _allBirthdayQuestsDone() {
    return this._getBirthdayQuests().every((q) => q.done);
  }

  // Phones are landscape-only: when held upright, cover the game with a "please rotate" card
  _setupLandscapeGuard() {
    const isTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isPhone = isTouch && Math.min(w, h) <= 600;
      const portrait = h > w;
      const block = isPhone && portrait;
      document.body.classList.toggle("force-rotate", block);
      if (block) {
        this.keys.clear();
        if (this._resetJoystick) this._resetJoystick();
      }
    };
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", () => setTimeout(check, 150));
    check();
  }

  // Best effort: fullscreen + lock landscape (works on Android Chrome; iOS ignores it silently)
  async _tryLandscapeFullscreen() {
    const isTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    if (!isTouch) return;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" });
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch {
      // Not supported here — the rotate card still guides the player
    }
  }

  _startBirthdayJourney() {
    const name = fillBirthdayText(BIRTHDAY.titleLine);
    const sub = fillBirthdayText(BIRTHDAY.titleSub);
    this.ui.showTitleScreen(name, sub, async () => {
      // The start button is the user gesture that lets the browser play audio
      this.sound.unlock();
      this._tryLandscapeFullscreen();
      await new Promise((r) => setTimeout(r, 900));
      if (!this.bday.introSeen) {
        await this.ui.playDialogue(BIRTHDAY.intro.map(fillBirthdayText));
        this.bday.introSeen = true;
        this._saveBirthday();
      }
      this._renderBirthdayQuests();
      if (this.bday.finaleSeen) {
        this.ui.showToast(`欢迎回到冬麓，${BIRTHDAY.recipientName}！清单都完成啦，随便逛逛吧`);
      } else {
        this.ui.showToast(
          this.ui.touchUIEnabled
            ? "左下轮盘移动 · 点选东西互动 · 单指滑动转视角"
            : "WASD 移动 · E 互动 · 鼠标点选 · 右键拖动转视角 · ? 帮助"
        );
      }
      this._maybeStartFinale();
    });
  }

  _replayBirthday() {
    // A clean slate for the next person: birthday progress, farm, gold, mail — then reload
    this._resetting = true;
    try {
      localStorage.removeItem(BDAY_STORAGE_KEY);
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    window.location.replace(window.location.pathname);
  }

  _maybeStartFinale() {
    if (this.bdayFinaleBusy || this.bday.finaleSeen || !this._allBirthdayQuestsDone()) return;
    this.bdayFinaleBusy = true;
    const tryRun = () => {
      // Wait for any open modal / the birthday song to finish first
      if (this.ui.isModalOpen() || this.inTransition || performance.now() < this.bdayHoldUntil) {
        setTimeout(tryRun, 400);
        return;
      }
      this._runFinale();
    };
    setTimeout(tryRun, 1100);
  }

  async _runFinale() {
    await this.ui.playDialogue(BIRTHDAY.finale.map(fillBirthdayText));
    this.bday.finaleSeen = true;
    this._saveBirthday();
    this.bdayFinaleBusy = false;
    this.ui.showBirthdayBanner(`生日快乐，${BIRTHDAY.recipientName}`, `—— ${BIRTHDAY.senderName}`, 9000);
    this.sound.playBirthdaySong();
  }

  _blowCandlesSequence() {
    if (!this.interior.cakeLit || this.ui.isWishOpen()) return;
    if (this._resetJoystick) this._resetJoystick();
    this.keys.clear();
    this.ui.runWish(fillBirthdayText(BIRTHDAY.wishPrompt), () => {
      this.interior.blowOutCake();
      this.sound.candleBlow();
      this._popupAt(this.interior.cakePos.x, 1.9, this.interior.cakePos.z, "呼——", "#fff6d8");
      const songLen = this.sound.playBirthdaySong() || 6;
      // Hold the finale until the song is done and the window-fireworks moment has played out
      this.bdayHoldUntil = performance.now() + Math.max(songLen + 0.8, 22.5) * 1000;
      this._startWishFireworks();
      this.ui.setFireworksReplayVisible(true);
      setTimeout(() => {
        this.ui.showBirthdayBanner("生日快乐！", fillBirthdayText(BIRTHDAY.wishDone), 5600);
      }, 500);
      this._completeBirthdayQuest("cake");
    });
  }

  // After the wish: night falls, the camera lifts toward the window and the whole valley
  // starts setting off fireworks. Movement is held only for the short cinematic part.
  _startWishFireworks() {
    const h = this.atmosphere.timeHours;
    const needNight = h >= 5.2 && h < 19.6;
    this.skyShow = {
      t: 0,
      lockUntil: 19.5,
      camUntil: 20,
      // first shell only once the camera has settled on the window view
      fireAt: 4.4,
      started: false,
      firstBurst: true,
      fromHour: h,
      toHour: needNight ? 20.4 : h,
      needNight,
      toasted: false,
    };
    if (this._resetJoystick) this._resetJoystick();
    this.keys.clear();
  }

  _updateSkyShow(dt) {
    const ss = this.skyShow;
    if (!ss) return;
    ss.t += dt * (this.worldFireworks.timeScale ?? 1); // debug slow-motion freezes the shot too
    // Dusk sweeps into night over ~2.6 s
    if (ss.needNight && ss.t > 0.7 && ss.t < 3.6) {
      const k = THREE.MathUtils.smoothstep(ss.t, 0.7, 3.4);
      this.atmosphere.setTime(THREE.MathUtils.lerp(ss.fromHour, ss.toHour, k));
    }
    if (!ss.started && ss.t >= ss.fireAt) {
      ss.started = true;
      this.worldFireworks.start(50, { quietStart: true });
    }
    // Hide the HUD while the camera frames the sky so no panel covers a burst
    const uiHidden = this.isIndoor && ss.t > 0.8 && ss.t < ss.camUntil - 1.2;
    if (uiHidden !== !!this._skyUiHidden) {
      this._skyUiHidden = uiHidden;
      document.body.classList.toggle("sky-show", uiHidden);
    }
    // One shooting star across the window view, in a lull between shells
    if (!ss.meteor && ss.t >= 10.8 && this._skyCamWeight() > 0.95) {
      ss.meteor = true;
      this.worldFireworks.shootingStar();
    }
    if (!ss.toasted && ss.t >= ss.lockUntil) {
      ss.toasted = true;
      if (this.isIndoor) this.ui.showToast("整个冬麓都在放烟花，推门出去看看吧");
    }
    if (ss.t > ss.camUntil + 2 && !this.worldFireworks.active) {
      this.skyShow = null;
      this._skyUiHidden = false;
      document.body.classList.remove("sky-show");
    }
  }

  _updateWorldFireworks(dt) {
    const wf = this.worldFireworks;
    const sky = this.atmosphere.skyUniforms;
    if (!wf.active && wf.flash <= 0) {
      if (this._fwWasOn) {
        sky.uFlash.value.setRGB(0, 0, 0);
        this.atmosphere.fireworkFlash = 0;
        this._fwWasOn = false;
      }
      return;
    }
    this._fwWasOn = true;
    // Indoors, test line of sight against the actual room + window vista
    wf.occlusionRoot = this.isIndoor ? this.interior.group : null;
    wf.update(dt, this.camera, this.isIndoor, this.renderer);
    const fl = Math.min(1, wf.flash);
    sky.uFlash.value.copy(wf.flashColor).multiplyScalar(fl * 0.2);
    if (wf.lightPos) {
      const d = this.atmosphere.skyDome.position;
      sky.uFlashDir.value.set(wf.lightPos.x - d.x, wf.lightPos.y, wf.lightPos.z - d.z).normalize();
    }
    this.atmosphere.fireworkFlash = wf.flash;
    this.atmosphere.fireworkColor = wf.flashColor;
  }

  // 0..1: how much the indoor camera is lifted toward the window during the wish show
  _skyCamWeight() {
    const ss = this.skyShow;
    if (!ss || !this.isIndoor) return 0;
    const up = THREE.MathUtils.smoothstep(ss.t, 1.0, 3.8);
    const down = 1 - THREE.MathUtils.smoothstep(ss.t, ss.camUntil - 1.5, ss.camUntil + 1.5);
    return up * down;
  }

  _onWorldFireworkBurst(b) {
    const ss = this.skyShow;
    const first = ss && ss.firstBurst;
    if (ss) ss.firstBurst = false;
    if (this.isIndoor) {
      if (first) {
        setTimeout(() => this.emotes.show(this.player.position, "exclaim", 2.35, 1.6), 250);
        if (this.interior.catPos) {
          const c = this.interior.catPos;
          setTimeout(() => this.emotes.show({ x: c.x, y: 0, z: c.z }, "exclaim", 1.7, 1.5), 600);
        }
      } else if (b.index === 6 && this.interior.catPos) {
        const c = this.interior.catPos;
        this.emotes.show({ x: c.x, y: 0, z: c.z }, "heart", 1.7, 1.8);
      } else if (b.index === 4) {
        this.emotes.show(this.player.position, "sparkle", 2.35, 1.8);
      }
      return;
    }
    this.wildlife.reactToFirework(b, this.player.position, first);
    if (first || Math.random() < 0.12) {
      this.emotes.show(this.player.position, first ? "exclaim" : "sparkle", 2.35, 1.6);
    }
  }

  _setupEnvironmentReflection() {
    // Lightweight procedural winter sky + warm hearth PMREM environment map for silky copper, iron, brass, glass & ice highlights!
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(20, 20, 14);
      const envMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPos;
          void main() {
            float y = vPos.y;
            vec3 sky = mix(vec3(0.75, 0.85, 0.98), vec3(0.26, 0.42, 0.72), clamp(y, 0.0, 1.0));
            vec3 warm = mix(vec3(0.92, 0.68, 0.45), vec3(0.32, 0.22, 0.16), clamp(-y, 0.0, 1.0));
            vec3 col = y >= 0.0 ? mix(vec3(0.95, 0.78, 0.64), sky, smoothstep(0.0, 0.35, y)) : warm;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      envScene.add(new THREE.Mesh(envGeo, envMat));
      const rt = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = rt.texture;
      if ("environmentIntensity" in this.scene) {
        this.scene.environmentIntensity = 0.42;
      }
      envGeo.dispose();
      envMat.dispose();
      pmrem.dispose();
    } catch {
      // Fallback gracefully if PMREM unsupported
    }
  }

  setPhotoMode(enabled) {
    this.photoMode = !!enabled;
    document.body.classList.toggle("photo-mode", this.photoMode);
    if (!this.photoMode) {
      this.photoPreset = null;
      this.ui.showToast("已退出纯净拍照模式（按 H 可随时隐藏 UI 拍照）");
    } else {
      this.farm.setHoveredTile(null);
      this.interior.setGiftHovered(false);
      this.interior.setLetterHovered(false);
    }
  }

  _initUrlPhotoMode() {
    const params = new URLSearchParams(window.location.search);
    const shotParam = params.get("shot");
    if (shotParam) {
      this._applyShotPreset(parseInt(shotParam, 10));
    } else if (params.get("photo") === "1") {
      this.setPhotoMode(true);
    }
  }

  _applyShotPreset(shotNum) {
    this.setPhotoMode(true);
    this.atmosphere.timeFlow = false;

    const setSceneMode = (indoor) => {
      this.isIndoor = indoor;
      this.world.group.visible = !indoor;
      this.farm.group.visible = !indoor;
      this.wildlife.group.visible = !indoor;
      this.interior.group.visible = indoor;
      this.atmosphere.setIndoorMode(indoor);
    };

    if (shotNum === 1) {
      // Shot 1: TRUE GOLDEN HOUR Homestead, Alpine Snow Peaks & Glowing Sunset Sky!
      setSceneMode(false);
      this.atmosphere.setTime(17.18);
      this.atmosphere.setSnowLevel(1);
      this.player.position.set(-0.45, 0, -2.15);
      this.player.facingAngle = 0.2;
      this.player.setHeldItem("");
      this.photoPreset = { focus: new THREE.Vector3(0.25, 3.1, -3.65), yaw: -0.07, dist: 21.4, elev: 0.17 };
    } else if (shotNum === 2) {
      // Shot 2: TRUE BLUE HOUR Arched Wooden Bridge & Claude Crab Roasting Marshmallow by Roaring Campfire (100% clear of trees!)
      setSceneMode(false);
      this.atmosphere.setTime(18.52);
      this.atmosphere.setSnowLevel(1);
      this.world.campfireBoost = 1.65;
      const by = this.world.getBridgeDeckY(12.25);
      this.player.position.set(12.25, by, 3.05);
      this.player.facingAngle = 1.32;
      this.player.setHeldItem("");
      this.photoPreset = { focus: new THREE.Vector3(15.45, 0.88, 2.65), yaw: -0.46, dist: 7.9, elev: 0.4 };
    } else if (shotNum === 3) {
      // Shot 3: Golden Sunset Cozy Cabin Interior — Fireplace, Tabby Cat, Zero-Flicker Bed, Panoramic Sunset Windows, Gifts & Desk Letter!
      setSceneMode(true);
      this.atmosphere.setTime(17.2);
      this.atmosphere.setSnowLevel(1);
      this.interior.fireBoost = 1.45;
      this.player.position.set(-0.15, 0, 2.02);
      this.player.facingAngle = -0.35;
      this.player.setHeldItem("");
      this.photoPreset = { focus: new THREE.Vector3(0.25, 1.18, -0.52), yaw: 0.03, dist: 16.0, elev: 0.42 };
    } else if (shotNum === 4) {
      // Shot 4: TRUE GOLDEN HOUR Farm Garden & Animal Paddock (long cobalt-blue shadows, warm beveled ashlar stones, ZERO foreground tree!)
      setSceneMode(false);
      this.atmosphere.setTime(17.15);
      this.atmosphere.setSnowLevel(1);
      this.player.position.set(0.35, 0, 2.85);
      this.player.facingAngle = -0.3;
      this.player.setHeldItem("carrot");
      this.photoPreset = { focus: new THREE.Vector3(0.55, 0.95, 1.45), yaw: 0.14, dist: 14.4, elev: 0.52 };
    }

    if (this.photoPreset) {
      this.camFocus.copy(this.photoPreset.focus);
      this.camYaw = this.photoPreset.yaw;
      this.camTargetYaw = this.photoPreset.yaw;
      this.camPitch = this.photoPreset.elev;
      this.camTargetPitch = this.photoPreset.elev;
      this.camDist = this.photoPreset.dist;
      this.camTargetDist = this.photoPreset.dist;
    }
    this._refreshUI();
  }

  _getHotbarSlots() {
    return [
      { id: "hoe", kind: "tool", name: "铁锄头", hint: "点击西侧雪地菜田翻土（成熟蔬菜可直接收获）", icon: "hoe", count: null },
      { id: "watering_can", kind: "water", name: "蓝铁水壶", hint: `给耕地浇水（剩余 ${this.water}/${this.waterMax}，水井可打水）`, icon: "watering_can", count: null },
      { id: "seed_carrot", kind: "seed", crop: "carrot", name: "胡萝卜种子", hint: "种在翻好的泥土里", icon: "seed_carrot", count: this.inventory.seed_carrot },
      { id: "seed_radish", kind: "seed", crop: "radish", name: "白萝卜种子", hint: "清甜脆嫩的冬日白萝卜", icon: "seed_radish", count: this.inventory.seed_radish },
      { id: "seed_cabbage", kind: "seed", crop: "cabbage", name: "雪球卷心菜种子", hint: "越下雪越脆甜", icon: "seed_cabbage", count: this.inventory.seed_cabbage },
      { id: "seed_pumpkin", kind: "seed", crop: "pumpkin", name: "冬日小南瓜种子", hint: "售价最高的暖心南瓜", icon: "seed_pumpkin", count: this.inventory.seed_pumpkin },
      { id: "carrot", kind: "item", name: "新鲜胡萝卜", hint: "靠近动物或小兔按 E 喂食，或投入出货箱出售", icon: "carrot_item", count: this.inventory.carrot },
      { id: "firewood", kind: "item", name: "松木柴火", hint: "摇晃松树可获取，用于添旺篝火或室内壁炉", icon: "firewood", count: this.inventory.firewood },
    ];
  }

  selectSlot(idx) {
    if (idx < 0 || idx >= 8) return;
    this.selectedSlot = idx;
    const slots = this._getHotbarSlots();
    this.player.setHeldItem(slots[idx].id);
    this.ui.updateHotbar(slots, this.selectedSlot, this.water / this.waterMax);
  }

  _refreshUI() {
    const phase = this.atmosphere.getPhaseInfo();
    this.ui.updateHUD({
      day: this.day,
      clockStr: this.atmosphere.getFormattedClock(),
      phaseIcon: phase.icon,
      locationName: this.isIndoor ? "小屋室内" : "冬麓院子",
      gold: this.gold,
      inventory: this.inventory,
      timeHours: this.atmosphere.timeHours,
    });
    this.ui.updateHotbar(this._getHotbarSlots(), this.selectedSlot, this.water / this.waterMax);
  }

  _projectToScreen(worldPos) {
    const v = worldPos.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // After the wish, every animal the player plays with passes on a birthday blessing
  _maybeBless(x, y, z) {
    if (!this.bday.cake || !ANIMAL_BLESSINGS.length) return;
    const now = performance.now();
    if (now - (this._lastBlessAt || 0) < 1800) return; // let the previous bubble breathe
    this._lastBlessAt = now;
    const text = fillBirthdayText(ANIMAL_BLESSINGS[(this._blessIdx || 0) % ANIMAL_BLESSINGS.length]);
    this._blessIdx = (this._blessIdx || 0) + 1;
    setTimeout(() => {
      const pt = this._projectToScreen(new THREE.Vector3(x, y, z));
      this.ui.spawnBlessing(pt.x, pt.y, text);
      this.sound.questDone?.();
    }, 420);
  }

  _popupAt(x, y, z, text, color = "#fffbe6") {
    const pt = this._projectToScreen(new THREE.Vector3(x, y, z));
    this.ui.spawnFloatingText(pt.x, pt.y, text, color);
  }

  _syncCameraViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    // Gently widen vertical FOV on portrait phones so the cottage, yard & rooms stay framed comfortably!
    this.camera.fov = aspect < 0.85
      ? THREE.MathUtils.clamp(36 / Math.pow(aspect / 0.85, 0.42), 36, 52)
      : 36;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _bindEvents() {
    window.addEventListener("resize", () => this._syncCameraViewport());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this._syncCameraViewport(), 120);
    });

    this._bindJoystickEvents();

    window.addEventListener("keydown", (e) => {
      this.sound.unlock();
      const isConfirm = e.code === "Space" || e.code === "KeyE" || e.code === "Enter" || e.code === "NumpadEnter";
      if (this.ui.isTitleOpen()) {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          document.getElementById("btn-title-start").click();
        }
        return;
      }
      if (this.ui.isDialogueOpen()) {
        if (isConfirm) {
          e.preventDefault();
          if (!e.repeat) this.ui.advanceDialogue();
        }
        return;
      }
      if (this.ui.isMailOpen()) {
        if ((isConfirm || e.code === "Escape") && !e.repeat) {
          e.preventDefault();
          this.ui._mailOpenedAt = 0;
          this.ui.closeMail();
        }
        return;
      }
      if (this.ui.isWishOpen()) {
        if (isConfirm) {
          e.preventDefault();
          if (!e.repeat) this.ui.tryBlowWish();
        }
        return;
      }
      if (e.code === "Escape") {
        document.getElementById("help-modal").classList.add("hidden");
        this.ui.closeGiftGallery();
        this.ui.closeLetterModal();
        return;
      }
      if (this.ui.isLetterOpen()) {
        if (e.repeat) return;
        if (!this.ui.letterEnvelopeOpened) {
          if (isConfirm) {
            e.preventDefault();
            this.ui._breakLetterSeal();
          }
        } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
          this.ui.stepLetterPage(-1);
        } else if (e.code === "ArrowRight" || e.code === "KeyD") {
          this.ui.stepLetterPage(1);
        } else if (e.code === "KeyE") {
          this.ui.closeLetterModal();
        }
        return;
      }
      if (this.ui.isGiftGalleryOpen()) {
        if (e.code === "ArrowLeft" || e.code === "KeyA") this.ui.stepGiftGallery(-1);
        else if (e.code === "ArrowRight" || e.code === "KeyD") this.ui.stepGiftGallery(1);
        else if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
          e.preventDefault();
          this.ui._unwrapCurrentGift();
        }
        return;
      }
      this.keys.add(e.code);

      if (e.code.startsWith("Digit")) {
        const num = parseInt(e.code.replace("Digit", ""), 10);
        if (num >= 1 && num <= 8) this.selectSlot(num - 1);
      } else if (e.code === "KeyE") {
        this._handleContextInteract();
      } else if (e.code === "Space") {
        e.preventDefault();
        this._handleFarmAction(null);
      } else if (e.code === "KeyR") {
        this.camTargetYaw = 0;
        this.camTargetPitch = this.isIndoor ? 0.44 : 0.44;
        this.camTargetDist = this.isIndoor ? 16.4 : 22.6;
      } else if (e.code === "KeyH") {
        this.setPhotoMode(!this.photoMode);
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      this.sound.unlock();

      // Desktop Mouse Controls (100% preserved; if Touch UI test mode is toggled on PC, also supports tap-select + ripple!)
      if (e.pointerType === "mouse") {
        if (e.button === 2) {
          this.isRightDragging = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        } else if (e.button === 0) {
          if (this.ui.touchUIEnabled) this.ui.spawnTapRipple(e.clientX, e.clientY);
          this._handleWorldTap(e, this.ui.touchUIEnabled);
        }
        return;
      }

      // Mobile / Touch Controls: Minecraft-style 1-finger tap-to-select, 1-finger drag-to-orbit, 2-finger pinch-zoom!
      e.preventDefault();
      if (this.canvas.setPointerCapture) {
        try { this.canvas.setPointerCapture(e.pointerId); } catch {}
      }
      this.canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.canvasPointers.size === 1) {
        this.touchCam.mode = "tap_or_drag";
        this.touchCam.pointerId = e.pointerId;
        this.touchCam.startX = e.clientX;
        this.touchCam.startY = e.clientY;
        this.touchCam.lastX = e.clientX;
        this.touchCam.lastY = e.clientY;
        this.touchCam.moved = false;
        this.touchCam.startTime = performance.now();
      } else if (this.canvasPointers.size === 2) {
        const pts = Array.from(this.canvasPointers.values());
        this.touchCam.mode = "pinch";
        this.touchCam.moved = true;
        this.touchCam.pinchStartDist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        this.touchCam.pinchStartCamDist = this.camTargetDist;
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      if (!this.canvasPointers.has(e.pointerId)) return;
      this.canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.touchCam.mode === "pinch" && this.canvasPointers.size >= 2) {
        const pts = Array.from(this.canvasPointers.values());
        const curDist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const ratio = this.touchCam.pinchStartDist / curDist;
        this.camTargetDist = THREE.MathUtils.clamp(this.touchCam.pinchStartCamDist * ratio, 10.5, 29.0);
      } else if (this.touchCam.mode === "tap_or_drag" && e.pointerId === this.touchCam.pointerId) {
        const totalDist = Math.hypot(e.clientX - this.touchCam.startX, e.clientY - this.touchCam.startY);
        if (totalDist > 11) {
          this.touchCam.moved = true;
        }
        if (this.touchCam.moved) {
          const dx = e.clientX - this.touchCam.lastX;
          const dy = e.clientY - this.touchCam.lastY;
          this._orbitCameraByDrag(dx, dy, 0.0062);
        }
        this.touchCam.lastX = e.clientX;
        this.touchCam.lastY = e.clientY;
      }
    });

    const handleCanvasTouchEnd = (e) => {
      if (e.pointerType === "mouse") return;
      const wasTracked = this.canvasPointers.has(e.pointerId);
      this.canvasPointers.delete(e.pointerId);
      if (!wasTracked) return;

      if (
        e.type === "pointerup" &&
        this.touchCam.mode === "tap_or_drag" &&
        e.pointerId === this.touchCam.pointerId &&
        !this.touchCam.moved &&
        performance.now() - this.touchCam.startTime < 420
      ) {
        this.ui.spawnTapRipple(e.clientX, e.clientY);
        this._handleWorldTap(e, true);
        // Reset NDC so reticle tracks the tile in front of player instead of sticking at last tap spot
        this.mouseNDC.set(-99, -99);
      }

      if (this.canvasPointers.size === 0) {
        this.touchCam.mode = "none";
        this.touchCam.pointerId = null;
      } else {
        // Remaining finger after releasing pinch shouldn't fire a stray tap or sudden jump
        this.touchCam.mode = "none";
        this.touchCam.moved = true;
      }
    };
    this.canvas.addEventListener("pointerup", handleCanvasTouchEnd);
    this.canvas.addEventListener("pointercancel", handleCanvasTouchEnd);

    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      this._updateMouseNDC(e);
      if (this.isRightDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this._orbitCameraByDrag(dx, dy, 0.0052);
      }
    });

    window.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") this.isRightDragging = false;
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.camTargetDist = THREE.MathUtils.clamp(this.camTargetDist + e.deltaY * 0.012, 10.5, 29.0);
    }, { passive: false });
  }

  _bindJoystickEvents() {
    const zone = document.getElementById("joystick-zone");
    const base = document.getElementById("joystick-base");
    const knob = document.getElementById("joystick-knob");
    if (!zone || !base || !knob) return;

    const updateStick = (clientX, clientY) => {
      const dx = clientX - this.joyState.centerX;
      const dy = clientY - this.joyState.centerY;
      const dist = Math.hypot(dx, dy);
      const maxR = this.joyState.maxR;
      const clamped = Math.min(dist, maxR);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * clamped;
      const ky = Math.sin(ang) * clamped;
      knob.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;

      if (dist < 6) {
        this.joyState.x = 0;
        this.joyState.z = 0;
        this.joyState.mag = 0;
        this.joyState.sprinting = false;
      } else {
        const mag = Math.min(1, dist / maxR);
        this.joyState.x = dx / dist;
        this.joyState.z = dy / dist;
        this.joyState.mag = mag;
        this.joyState.sprinting = mag >= 0.84;
      }
      zone.classList.toggle("sprinting", this.joyState.sprinting);
    };

    const resetStick = () => {
      this.joyState.active = false;
      this.joyState.pointerId = null;
      this.joyState.x = 0;
      this.joyState.z = 0;
      this.joyState.mag = 0;
      this.joyState.sprinting = false;
      knob.style.transform = "translate3d(0, 0, 0)";
      zone.classList.remove("active", "sprinting");
    };
    this._resetJoystick = resetStick;

    zone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound.unlock();
      if (this.joyState.active) return;
      const rect = base.getBoundingClientRect();
      this.joyState.active = true;
      this.joyState.pointerId = e.pointerId;
      this.joyState.centerX = rect.left + rect.width / 2;
      this.joyState.centerY = rect.top + rect.height / 2;
      this.joyState.maxR = Math.max(30, rect.width * 0.37);
      if (zone.setPointerCapture) {
        try { zone.setPointerCapture(e.pointerId); } catch {}
      }
      zone.classList.add("active");
      updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener("pointermove", (e) => {
      if (!this.joyState.active || e.pointerId !== this.joyState.pointerId) return;
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    });

    const onJoyUp = (e) => {
      if (!this.joyState.active || e.pointerId !== this.joyState.pointerId) return;
      resetStick();
    };
    zone.addEventListener("pointerup", onJoyUp);
    zone.addEventListener("pointercancel", onJoyUp);
    zone.addEventListener("lostpointercapture", () => {
      if (this.joyState.active) resetStick();
    });
  }

  _raycastGroundPoint(planeY = 0.45) {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  _pickTappedInteractable(tx, tz) {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const candidates = [];

    if (this.isIndoor) {
      candidates.push(
        { x: this.interior.bedPos.x, z: this.interior.bedPos.z, tapR: 1.45, reach: 2.15, act: { type: "sleep_bed" }, name: "木床" },
        { x: this.interior.catPos.x, z: this.interior.catPos.z, tapR: 1.0, reach: 1.85, act: { type: "pet_cat" }, name: "橘猫团子" },
        { x: this.interior.fireplacePos.x, z: this.interior.fireplacePos.z, tapR: 1.35, reach: 2.25, act: { type: "stoke_hearth" }, name: "石壁炉" },
        { x: this.interior.deskPos.x, z: this.interior.deskPos.z, tapR: 1.2, reach: 2.65, act: { type: "read_letter" }, name: "书桌火漆信" },
        { x: this.interior.cakePos.x, z: this.interior.cakePos.z, tapR: 1.15, reach: 2.2, act: { type: this.interior.cakeLit ? "blow_candles" : "eat_cake" }, name: "生日蛋糕" },
        { x: this.interior.teaTablePos.x, z: this.interior.teaTablePos.z, tapR: 1.1, reach: 1.9, act: { type: "drink_cocoa" }, name: "热可可茶几" },
        { x: this.interior.stovePos.x, z: this.interior.stovePos.z, tapR: 1.35, reach: 2.2, act: { type: this.inventory.milk > 0 ? "cook_milk" : "cook_soup" }, name: "铸铁灶台" },
        { x: this.interior.exitPos.x, z: this.interior.exitPos.z, tapR: 1.1, reach: 1.75, act: { type: "leave_cottage" }, name: "木门出口" }
      );
    } else {
      candidates.push(
        { x: this.world.mailboxPos.x, z: this.world.mailboxPos.z, tapR: 0.9, reach: 1.9, act: { type: "check_mail" }, name: "信箱" },
        { x: this.world.shippingBinPos.x, z: this.world.shippingBinPos.z, tapR: 1.25, reach: 2.25, act: { type: this._getHarvestSellValue() > 0 ? "shipping_sell" : "shipping_buy" }, name: "出货箱" },
        { x: this.world.coopNestPos.x, z: this.world.coopNestPos.z, tapR: 1.15, reach: 2.05, act: { type: this.wildlife.coopEggs > 0 ? "collect_eggs" : "check_coop" }, name: "鸡窝" },
        { x: this.world.hayTroughPos.x, z: this.world.hayTroughPos.z, tapR: 1.25, reach: 2.15, act: { type: "feed_trough" }, name: "干草食槽" },
        { x: this.world.wellPos.x, z: this.world.wellPos.z, tapR: 1.35, reach: 2.4, act: { type: "refill_water" }, name: "石水井" },
        { x: this.world.claudeCrabPos.x, z: this.world.claudeCrabPos.z, tapR: 1.05, reach: 2.35, act: { type: "greet_claude" }, name: "Claude 小螃蟹" },
        { x: this.world.campfirePos.x, z: this.world.campfirePos.z, tapR: 1.25, reach: 2.45, act: { type: "stoke_campfire" }, name: "林间篝火" }
      );
      for (const a of this.wildlife.farmAnimals) {
        candidates.push({ x: a.mesh.position.x, z: a.mesh.position.z, tapR: 1.05, reach: 2.1, act: { type: "farm_animal", target: a }, name: a.name });
      }
      for (const r of this.wildlife.rabbits) {
        candidates.push({ x: r.mesh.position.x, z: r.mesh.position.z, tapR: 0.95, reach: 2.1, act: { type: "rabbit", target: r }, name: r.name });
      }
      for (const item of this.world.droppedItems) {
        candidates.push({ x: item.x, z: item.z, tapR: 0.9, reach: 1.85, act: { type: "pickup_wood", target: item }, name: "松木柴火" });
      }
      for (const t of this.world.shakeTrees) {
        candidates.push({ x: t.x, z: t.z, tapR: 1.2, reach: 2.55, act: { type: "shake_tree", target: t }, name: "雪松树" });
      }
    }

    let best = null;
    let bestTapDist = Infinity;
    for (const c of candidates) {
      const td = Math.hypot(tx - c.x, tz - c.z);
      if (td <= c.tapR && td < bestTapDist) {
        bestTapDist = td;
        best = c;
      }
    }
    if (!best) return null;
    const playerDist = Math.hypot(px - best.x, pz - best.z);
    return { ...best, inReach: playerDist <= best.reach, playerDist };
  }

  _handleWorldTap(e, isTouchTap = false) {
    if (this.inTransition || this.ui.isModalOpen()) return;
    this._updateMouseNDC(e);

    if (!this.isIndoor) {
      const hitTile = this._raycastFarmTile();
      if (hitTile) {
        this._handleFarmAction(hitTile);
        return;
      }
      if (this._raycastCottageDoor()) {
        const dDoor = Math.hypot(
          this.player.position.x - this.world.cottageDoorPos.x,
          this.player.position.z - this.world.cottageDoorPos.z
        );
        if (dDoor < 2.25) {
          this.enterCottage();
        } else if (isTouchTap) {
          this.ui.showToast("走近木屋门口一点，再点木门进入小屋吧");
        }
        return;
      }
      if (isTouchTap) {
        const pt = this._raycastGroundPoint(0.5);
        if (pt) {
          const picked = this._pickTappedInteractable(pt.x, pt.z);
          if (picked) {
            if (picked.inReach) {
              this._handleContextInteract(picked.act);
            } else if (picked.playerDist < 7.5) {
              this.ui.showToast(`离${picked.name}有点远，推动左下角轮盘走近一点再点吧！`);
            }
            return;
          }
        }
      }
      if (this.activeInteract && this.activeInteract.allowClick && this.activeInteract.type !== "enter_cottage") {
        this._handleContextInteract();
      }
    } else {
      if (this._raycastLetter()) {
        const dDesk = Math.hypot(
          this.player.position.x - this.interior.deskPos.x,
          this.player.position.z - this.interior.deskPos.z
        );
        if (dDesk <= 2.65) {
          this._openDeskLetter();
        } else {
          this.ui.showToast("走近窗边书桌一点，再点击展开这封信吧");
        }
        return;
      }
      if (this._raycastCake()) {
        const dCake = Math.hypot(
          this.player.position.x - this.interior.cakePos.x,
          this.player.position.z - this.interior.cakePos.z
        );
        if (dCake <= 2.2) {
          this._handleContextInteract({ type: this.interior.cakeLit ? "blow_candles" : "eat_cake" });
        } else {
          this.ui.showToast("走到餐桌边，再对着蛋糕许愿吧");
        }
        return;
      }
      const giftHit = this._raycastGiftBox();
      if (giftHit) {
        this._openGiftBox(giftHit.giftIndex);
        return;
      }
      if (isTouchTap) {
        const pt = this._raycastGroundPoint(0.45);
        if (pt) {
          const picked = this._pickTappedInteractable(pt.x, pt.z);
          if (picked) {
            if (picked.inReach) {
              this._handleContextInteract(picked.act);
            } else if (picked.playerDist < 6.5) {
              this.ui.showToast(`离${picked.name}有点远，推动左下角轮盘走近一点再点吧！`);
            }
            return;
          }
        }
      }
      if (this.activeInteract && this.activeInteract.allowClick && this.activeInteract.type !== "leave_cottage") {
        this._handleContextInteract();
      }
    }
  }

  _updateMouseNDC(e) {
    this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _raycastFarmTile() {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.farm.tileMeshes, false);
    if (hits.length > 0) return hits[0].object.userData.farmTile;
    return null;
  }

  _raycastCottageDoor() {
    if (!this.world.doorLeaf) return false;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    return this.raycaster.intersectObject(this.world.doorLeaf, false).length > 0;
  }

  _raycastGiftBox() {
    if (!this.interior.giftHitMeshes || this.interior.giftHitMeshes.length === 0) return null;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.interior.giftHitMeshes, false);
    if (hits.length > 0) {
      return { giftIndex: hits[0].object.userData.giftIndex || 0 };
    }
    return null;
  }

  _raycastCake() {
    if (!this.interior.cakeHitMeshes || this.interior.cakeHitMeshes.length === 0) return false;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    return this.raycaster.intersectObjects(this.interior.cakeHitMeshes, false).length > 0;
  }

  _raycastLetter() {
    if (!this.interior.letterHitMeshes || this.interior.letterHitMeshes.length === 0) return false;
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    return this.raycaster.intersectObjects(this.interior.letterHitMeshes, false).length > 0;
  }

  _openDeskLetter() {
    if (this._resetJoystick) this._resetJoystick();
    this.sound.letterOpen();
    this._popupAt(this.interior.deskPos.x, 1.35, this.interior.deskPos.z - 0.35, "展开火漆信", "#fff0b3");
    this.ui.openLetterModal();
  }

  _openGiftBox(startIndex = 0) {
    if (this._resetJoystick) this._resetJoystick();
    this.interior.openGiftPile();
    this.sound.giftOpen();
    this._popupAt(this.interior.giftPilePos.x, 1.15, this.interior.giftPilePos.z, "打开冬日惊喜礼盒!", "#ffe875");
    this.ui.openGiftGallery(startIndex);
  }

  _handleFarmAction(explicitTile) {
    if (this.isIndoor || this.inTransition) return;

    let tile = explicitTile;
    if (!tile) {
      const front = this.player.getFrontPoint(0.95);
      tile = this.farm.getTileNearWorld(front.x, front.z, 1.05) || this.farm.getTileNearWorld(this.player.position.x, this.player.position.z, 0.95);
    }
    if (!tile) return;

    const dist = Math.hypot(tile.x - this.player.position.x, tile.z - this.player.position.z);
    if (dist > 2.65) {
      this.ui.showToast("离这块菜地有点远，走近一点再操作吧！");
      return;
    }

    this.player.facingAngle = Math.atan2(tile.x - this.player.position.x, tile.z - this.player.position.z);
    this.player.triggerSwing();

    if (tile.crop && tile.crop.stage >= 3) {
      const harvested = this.farm.harvestTile(tile);
      if (harvested) {
        this.inventory[harvested.id] += 1;
        this.sound.harvestPop();
        this._popupAt(tile.x, 0.9, tile.z, `+1 ${harvested.name}`, "#ffe875");
        this._refreshUI();
      }
      return;
    }

    const slot = this._getHotbarSlots()[this.selectedSlot];

    if (slot.id === "hoe") {
      const res = this.farm.tillTile(tile);
      if (res.ok) {
        this.sound.hoeTill();
        this._popupAt(tile.x, 0.65, tile.z, "翻土完成", "#f5d7a1");
      } else {
        this.ui.showToast(res.reason);
      }
    } else if (slot.id === "watering_can") {
      if (this.water <= 0) {
        this.ui.showToast("水壶空啦！去东侧牧场外的石水井按 E 打满水吧");
        return;
      }
      const res = this.farm.waterTile(tile);
      if (res.ok) {
        this.water = Math.max(0, this.water - 1);
        this.sound.waterSplash();
        this._popupAt(tile.x, 0.65, tile.z, "已浇水", "#9be2ff");
        this._refreshUI();
      } else {
        this.ui.showToast(res.reason);
      }
    } else if (slot.kind === "seed") {
      if (this.inventory[slot.id] <= 0) {
        this.ui.showToast(`${slot.name}用完啦，去门口出货箱可以补充种子！`);
        return;
      }
      const res = this.farm.plantTile(tile, slot.crop);
      if (res.ok) {
        this.inventory[slot.id] -= 1;
        this.sound.plantSeed();
        const def = CROP_DEFS[slot.crop];
        this._popupAt(tile.x, 0.65, tile.z, `种下${def.name}`, "#c9ffad");
        this._refreshUI();
      } else {
        this.ui.showToast(res.reason);
      }
    } else {
      this.ui.showToast("请先切换 1 锄头、2 水壶 或 3–6 蔬菜种子进行耕作");
    }
  }

  _findBestInteractable() {
    const px = this.player.position.x;
    const pz = this.player.position.z;

    if (this.isIndoor) {
      const distGift = Math.hypot(px - this.interior.giftPilePos.x, pz - this.interior.giftPilePos.z);
      if (distGift < 2.15) {
        return { type: "open_gift", label: "打开礼物盒", allowClick: true };
      }
      if (Math.hypot(px - this.interior.exitPos.x, pz - this.interior.exitPos.z) < 1.3) {
        return { type: "leave_cottage", label: "离开小屋", allowClick: false };
      }
      if (Math.hypot(px - this.interior.bedPos.x, pz - this.interior.bedPos.z) < 1.8) {
        return { type: "sleep_bed", label: "上床睡觉（推进到第二天，浇水蔬菜长大 & 动物新产出）", allowClick: true };
      }
      if (Math.hypot(px - this.interior.catPos.x, pz - this.interior.catPos.z) < 1.45) {
        return { type: "pet_cat", label: "轻轻撸一撸壁炉旁打盹的橘猫团子", allowClick: true };
      }
      if (Math.hypot(px - this.interior.fireplacePos.x, pz - this.interior.fireplacePos.z) < 1.9) {
        return { type: "stoke_hearth", label: `给石壁炉添柴火（当前柴火 ${this.inventory.firewood}）`, allowClick: true };
      }
      if (Math.hypot(px - this.interior.deskPos.x, pz - this.interior.deskPos.z) < 1.95) {
        return { type: "read_letter", label: "展开书桌上的火漆信", allowClick: true };
      }
      if (Math.hypot(px - this.interior.cakePos.x, pz - this.interior.cakePos.z) < 1.95) {
        return this.interior.cakeLit
          ? { type: "blow_candles", label: "对着生日蛋糕许个愿，吹灭蜡烛", allowClick: true }
          : { type: "eat_cake", label: "切一小块生日蛋糕尝尝", allowClick: true };
      }
      if (Math.hypot(px - this.interior.teaTablePos.x, pz - this.interior.teaTablePos.z) < 1.5) {
        return { type: "drink_cocoa", label: "品尝茶几上的热腾腾冬日热可可", allowClick: true };
      }
      if (Math.hypot(px - this.interior.stovePos.x, pz - this.interior.stovePos.z) < 1.85) {
        if (this.inventory.milk > 0) {
          return { type: "cook_milk", label: "用鲜奶熬一壶暖心蜂蜜热牛奶 (+85 G)", allowClick: true };
        }
        return { type: "cook_soup", label: "用胡萝卜熬一锅热腾腾的冬日胡萝卜汤 (+60 G)", allowClick: true };
      }
      return null;
    }

    // 1. Cottage Door
    if (Math.hypot(px - this.world.cottageDoorPos.x, pz - this.world.cottageDoorPos.z) < 1.75) {
      return { type: "enter_cottage", label: "进入小屋", allowClick: true };
    }

    // 1b. Mailbox
    if (Math.hypot(px - this.world.mailboxPos.x, pz - this.world.mailboxPos.z) < 1.45) {
      return {
        type: "check_mail",
        label: this._getNextMail() ? "打开信箱（有一封新的信）" : "看看信箱",
        allowClick: true,
      };
    }

    // 2. Shipping Bin (sell all veggies + animal produce, or buy seed pack)
    if (Math.hypot(px - this.world.shippingBinPos.x, pz - this.world.shippingBinPos.z) < 1.9) {
      const totalVal = this._getHarvestSellValue();
      if (totalVal > 0) {
        return { type: "shipping_sell", label: `投入出货箱出售全部蔬果与牧场农产 (+${totalVal} G)`, allowClick: true };
      }
      return { type: "shipping_buy", label: "花费 30 G 邮购一套混合蔬菜种子 (+4种各3颗)", allowClick: true };
    }

    // 3. Chicken Coop Egg Nest Box
    if (Math.hypot(px - this.world.coopNestPos.x, pz - this.world.coopNestPos.z) < 1.65) {
      if (this.wildlife.coopEggs > 0) {
        return { type: "collect_eggs", label: `拾取鸡舍里的 ${this.wildlife.coopEggs} 颗新鲜土鸡蛋`, allowClick: true };
      }
      return { type: "check_coop", label: "查看暖棚鸡窝（明天清晨母鸡会下新蛋）", allowClick: true };
    }

    // 4. Animal Paddock Hay Feeding Trough
    if (Math.hypot(px - this.world.hayTroughPos.x, pz - this.world.hayTroughPos.z) < 1.75) {
      return {
        type: "feed_trough",
        label: this.world.troughFilled ? "摇动干草食槽，呼唤动物们过来吃草" : "给牧场食槽添满金黄干草",
        allowClick: true,
      };
    }

    // 5. Paddock Farm Animals (Cow, Sheep, Chickens)
    let closestAnimal = null;
    let bestAD = 1.65;
    for (const a of this.wildlife.farmAnimals) {
      const d = Math.hypot(px - a.mesh.position.x, pz - a.mesh.position.z);
      if (d < bestAD) {
        bestAD = d;
        closestAnimal = a;
      }
    }
    if (closestAnimal) {
      let lbl;
      if (closestAnimal.hasProduct && closestAnimal.kind === "cow") {
        lbl = `给${closestAnimal.name}挤一桶温牛奶`;
      } else if (closestAnimal.hasProduct && closestAnimal.kind === "sheep") {
        lbl = `给${closestAnimal.name}收集蓬松冬羊毛`;
      } else if (this.inventory.carrot > 0 && !closestAnimal.fedToday) {
        lbl = `喂${closestAnimal.name}一根胡萝卜`;
      } else {
        lbl = `温柔地摸摸${closestAnimal.name}`;
      }
      return { type: "farm_animal", target: closestAnimal, label: lbl, allowClick: true };
    }

    // 6. Stone Water Well
    if (Math.hypot(px - this.world.wellPos.x, pz - this.world.wellPos.z) < 2.0) {
      return { type: "refill_water", label: "石水井摇辘轳打水（装满蓝铁水壶）", allowClick: true };
    }

    // 7. Claude Crab Mascot roasting marshmallow by East Campfire!
    if (this.world.claudeCrabPos && Math.hypot(px - this.world.claudeCrabPos.x, pz - this.world.claudeCrabPos.z) < 1.95) {
      return { type: "greet_claude", label: "和烤火的 Claude 小螃蟹打招呼", allowClick: true };
    }

    // 8. Forest Campfire
    if (Math.hypot(px - this.world.campfirePos.x, pz - this.world.campfirePos.z) < 2.1) {
      return { type: "stoke_campfire", label: `给林间篝火添柴火（当前柴火 ${this.inventory.firewood}）`, allowClick: true };
    }

    // 8. Wild Snow Rabbits
    for (const r of this.wildlife.rabbits) {
      if (Math.hypot(px - r.mesh.position.x, pz - r.mesh.position.z) < 1.75) {
        const hasCarrot = this.inventory.carrot > 0;
        return {
          type: "rabbit",
          target: r,
          label: hasCarrot ? `喂${r.name}一根胡萝卜` : `轻轻摸摸${r.name}`,
          allowClick: true,
        };
      }
    }

    // 9. Dropped Firewood
    for (const item of this.world.droppedItems) {
      if (Math.hypot(px - item.x, pz - item.z) < 1.4) {
        return { type: "pickup_wood", target: item, label: "捡起松木柴火", allowClick: true };
      }
    }

    // 10. Shakeable Pine Trees
    let closestTree = null;
    let bestD = 2.15;
    for (const t of this.world.shakeTrees) {
      const d = Math.hypot(px - t.x, pz - t.z);
      if (d < bestD) {
        bestD = d;
        closestTree = t;
      }
    }
    if (closestTree) {
      return { type: "shake_tree", target: closestTree, label: "摇晃雪松树", allowClick: false };
    }

    return null;
  }

  _getHarvestSellValue() {
    return (
      this.inventory.carrot * CROP_DEFS.carrot.price +
      this.inventory.radish * CROP_DEFS.radish.price +
      this.inventory.cabbage * CROP_DEFS.cabbage.price +
      this.inventory.pumpkin * CROP_DEFS.pumpkin.price +
      this.inventory.egg * ANIMAL_PRICES.egg +
      this.inventory.milk * ANIMAL_PRICES.milk +
      this.inventory.wool * ANIMAL_PRICES.wool
    );
  }

  // World-space point just above whatever an interaction acts on (for the focus arrow & facing)
  _getInteractAnchor(act) {
    if (!act) return null;
    const W = this.world;
    const I = this.interior;
    const at = (v, y) => ({ x: v.x, y, z: v.z });
    switch (act.type) {
      case "enter_cottage": return at(W.cottageDoorPos, 3.15);
      case "check_mail": return at(W.mailboxPos, this._getNextMail() ? 2.55 : 1.85);
      case "shipping_sell":
      case "shipping_buy": return at(W.shippingBinPos, 1.75);
      case "collect_eggs":
      case "check_coop": return at(W.coopNestPos, 1.45);
      case "feed_trough": return at(W.hayTroughPos, 1.35);
      case "refill_water": return at(W.wellPos, 2.75);
      case "greet_claude": return at(W.claudeCrabPos, 1.75);
      case "stoke_campfire": return at(W.campfirePos, 1.6);
      case "farm_animal": {
        const a = act.target;
        const h = a.kind === "cow" ? 1.62 : a.kind === "sheep" ? 1.3 : a.isChick ? 0.78 : 1.02;
        return at(a.mesh.position, h + 0.62);
      }
      case "rabbit": return at(act.target.mesh.position, 1.5);
      case "pickup_wood": return { x: act.target.x, y: 0.8, z: act.target.z };
      case "shake_tree": return { x: act.target.x, y: 1.9, z: act.target.z };
      case "sleep_bed": return at(I.bedPos, 1.35);
      case "pet_cat": return at(I.catPos, 2.35);
      case "stoke_hearth": return at(I.fireplacePos, 1.25);
      case "drink_cocoa": return at(I.teaTablePos, 1.15);
      case "cook_soup":
      case "cook_milk": return at(I.stovePos, 1.75);
      case "eat_cake": return at(I.cakePos, 1.75);
      // gifts, letter & lit cake already have their own floating sparkle; doors need no arrow
      default: return null;
    }
  }

  _getInteractKey(act) {
    if (!act) return null;
    const t = act.target;
    return act.type + (t ? ":" + (t.name || t.id || `${t.x},${t.z}`) : "");
  }

  _handleContextInteract(explicitAct = null) {
    if (this.inTransition) return;
    const act = explicitAct || this.activeInteract;
    if (!act) {
      this._handleFarmAction(null);
      return;
    }

    const anchor = this._getInteractAnchor(act);
    if (anchor) {
      const fx = anchor.x - this.player.position.x;
      const fz = anchor.z - this.player.position.z;
      if (Math.hypot(fx, fz) > 0.25) this.player.facingAngle = Math.atan2(fx, fz);
    }

    switch (act.type) {
      case "enter_cottage":
        this.enterCottage();
        break;
      case "check_mail":
        this._openMailbox();
        break;
      case "leave_cottage":
        this.leaveCottage();
        break;
      case "open_gift":
        this._openGiftBox(0);
        break;
      case "sleep_bed":
        this.triggerNewDay("在温暖壁炉旁睡了个好觉 · 第二天清晨到来");
        break;
      case "pet_cat":
        this.emotes.show({ x: this.interior.catPos.x, y: 0, z: this.interior.catPos.z }, "heart", 1.8);
        this.interior.petCat();
        this.sound.catPurr();
        this._popupAt(this.interior.catPos.x, 0.85, this.interior.catPos.z, "呼噜呼噜~", "#ffb8c6");
        this.ui.showToast("橘猫团子舒服地翻了个身，发出了满足的呼噜声！");
        this._maybeBless(this.interior.catPos.x, 2.1, this.interior.catPos.z);
        break;
      case "read_letter":
        this._openDeskLetter();
        break;
      case "blow_candles":
        this._blowCandlesSequence();
        break;
      case "eat_cake": {
        const lines = [
          "奶油甜而不腻，草莓酸酸的——是生日的味道",
          "又偷偷吃了一小块……没关系，今天是生日！",
          "橘猫团子闻到奶油香，在壁炉边伸了个懒腰",
          "蛋糕还剩好多，留一块给明天的自己吧",
        ];
        this.interior.cakeSlices = (this.interior.cakeSlices || 0) + 1;
        this.sound.sipWarm();
        this._popupAt(this.interior.cakePos.x, 1.7, this.interior.cakePos.z, "甜甜的!", "#ffc7d4");
        this.ui.showToast(lines[(this.interior.cakeSlices - 1) % lines.length]);
        break;
      }
      case "drink_cocoa":
        this.sound.sipWarm();
        this._popupAt(this.interior.teaTablePos.x, 1.15, this.interior.teaTablePos.z, "暖呼呼热可可!", "#ffe1a8");
        this.ui.showToast("捧起热可可望着大窗外的漫天飘雪，浑身都暖洋洋的~");
        break;
      case "stoke_hearth":
        if (this.inventory.firewood > 0) {
          this.inventory.firewood -= 1;
          this.interior.stokeFireplace();
          this.sound.fireStoke();
          this._popupAt(this.interior.fireplacePos.x, 1.35, this.interior.fireplacePos.z, "壁炉更暖和了!", "#ffb957");
          this._refreshUI();
        } else {
          this.ui.showToast("没有柴火啦，去屋外森林摇一摇雪松树捡些柴火吧！");
        }
        break;
      case "cook_soup":
        if (this.inventory.carrot > 0) {
          this.inventory.carrot -= 1;
          this.gold += 60;
          this.sound.coinChime();
          this._popupAt(this.interior.stovePos.x, 1.55, this.interior.stovePos.z, "香喷喷胡萝卜汤 +60G!", "#ffd16b");
          this.ui.showToast("熬好了一锅暖呼呼的冬日胡萝卜汤，香气飘满了厨房！");
          this._refreshUI();
        } else {
          this.ui.showToast("需要至少 1 根新鲜胡萝卜才能煮胡萝卜汤哦！");
        }
        break;
      case "cook_milk":
        if (this.inventory.milk > 0) {
          this.inventory.milk -= 1;
          this.gold += 85;
          this.sound.coinChime();
          this._popupAt(this.interior.stovePos.x, 1.55, this.interior.stovePos.z, "蜂蜜热牛奶 +85G!", "#fff2b2");
          this.ui.showToast("用牧场鲜奶煮了一壶香甜暖心的蜂蜜热牛奶！");
          this._refreshUI();
        }
        break;
      case "collect_eggs": {
        const count = this.wildlife.collectCoopEggs();
        if (count > 0) {
          this.inventory.egg += count;
          this.sound.harvestPop();
          this._popupAt(this.world.coopNestPos.x, 1.15, this.world.coopNestPos.z, `+${count} 土鸡蛋`, "#fff3a6");
          this.ui.showToast(`从暖棚鸡窝里拾取了 ${count} 颗热乎乎的土鸡蛋！`);
          this._refreshUI();
        }
        break;
      }
      case "check_coop":
        this.sound.chickenCluck();
        this.ui.showToast("鸡窝里的稻草暖呼呼的，记得喂饱小动物，明早会有新鸡蛋！");
        break;
      case "feed_trough": {
        this.wildlife.feedAllAnimalsViaTrough();
        this.sound.hayRustle();
        this._popupAt(this.world.hayTroughPos.x, 1.1, this.world.hayTroughPos.z, "干草已添满!", "#f5d76e");
        this.ui.showToast("食槽堆满了金黄干草，牧场里的小奶牛、绵羊和母鸡们都开心围过来啦！");
        break;
      }
      case "farm_animal": {
        const a = act.target;
        const hasCarrot = this.inventory.carrot > 0;
        const res = this.wildlife.interactFarmAnimal(a, hasCarrot);
        if (a.kind === "cow") this.sound.cowMoo();
        else if (a.kind === "sheep") this.sound.sheepBaa();
        else this.sound.chickenCluck();

        const ap = a.mesh.position;
        if (res.action === "harvest") {
          this.inventory[res.product] += 1;
          this.sound.harvestPop();
          this._popupAt(ap.x, 1.2, ap.z, `+1 ${res.productName}`, "#ffe875");
          this.ui.showToast(`收获了来自${a.name}的${res.productName}！可以投入出货箱或回屋烹饪`);
          this._refreshUI();
        } else if (res.action === "fed") {
          this.inventory.carrot -= 1;
          this._popupAt(ap.x, 1.1, ap.z, "吃得好开心!", "#ff8ca3");
          this.ui.showToast(`${a.name}津津有味地吃掉了胡萝卜，明天一定会有丰厚产出！`);
          this._refreshUI();
        } else {
          this._popupAt(ap.x, 1.1, ap.z, "暖乎乎很亲人", "#ffd2dc");
        }
        this._maybeBless(ap.x, (a.kind === "cow" ? 1.62 : a.kind === "sheep" ? 1.3 : 1.02) + 0.9, ap.z);
        break;
      }
      case "shipping_sell": {
        const val = this._getHarvestSellValue();
        this.inventory.carrot = 0;
        this.inventory.radish = 0;
        this.inventory.cabbage = 0;
        this.inventory.pumpkin = 0;
        this.inventory.egg = 0;
        this.inventory.milk = 0;
        this.inventory.wool = 0;
        this.gold += val;
        this.sound.coinChime();
        this.world.spawnBurst(this.world.shippingBinPos.x, 1.1, this.world.shippingBinPos.z, 0xffe066, 16, 2.6);
        this._popupAt(this.world.shippingBinPos.x, 1.4, this.world.shippingBinPos.z, `+${val} G`, "#ffe159");
        this.ui.showToast(`出货箱结算成功！赚到了 ${val} 金币`);
        this._refreshUI();
        break;
      }
      case "shipping_buy":
        if (this.gold >= 30) {
          this.gold -= 30;
          this.inventory.seed_carrot += 3;
          this.inventory.seed_radish += 3;
          this.inventory.seed_cabbage += 3;
          this.inventory.seed_pumpkin += 3;
          this.sound.coinChime();
          this._popupAt(this.world.shippingBinPos.x, 1.35, this.world.shippingBinPos.z, "种子已补货!", "#b4ff9f");
          this._refreshUI();
        } else {
          this.ui.showToast("金币不足 30 G，先收获门口的蔬菜或牧场特产卖掉吧！");
        }
        break;
      case "refill_water":
        this.water = this.waterMax;
        this.sound.waterSplash();
        this.world.spawnBurst(this.world.wellPos.x, 1.1, this.world.wellPos.z, 0x7cd4ff, 14, 2.2);
        this._popupAt(this.world.wellPos.x, 1.4, this.world.wellPos.z, "水壶已装满!", "#9be2ff");
        this._refreshUI();
        break;
      case "greet_claude": {
        this.emotes.show({ x: this.world.claudeCrabPos.x, y: 0, z: this.world.claudeCrabPos.z }, "note", 1.1);
        const msg = this.world.interactClaudeCrab();
        this.sound.crabClack();
        this._popupAt(this.world.claudeCrabPos.x, 1.05, this.world.claudeCrabPos.z, "咔哒咔哒~", "#ffad85");
        this.ui.showToast(msg);
        this._maybeBless(this.world.claudeCrabPos.x, 1.9, this.world.claudeCrabPos.z);
        break;
      }
      case "stoke_campfire":
        if (this.inventory.firewood > 0) {
          this.inventory.firewood -= 1;
          this.world.stokeCampfire();
          this.sound.fireStoke();
          this._popupAt(this.world.campfirePos.x, 1.2, this.world.campfirePos.z, "篝火烧得更旺了!", "#ffb247");
          this._refreshUI();
        } else {
          this.ui.showToast("背包里没有松木柴火了，去摇晃旁边的雪松树吧！");
        }
        break;
      case "rabbit": {
        const hasCarrot = this.inventory.carrot > 0;
        const res = this.wildlife.interactRabbit(act.target, hasCarrot);
        this.sound.rabbitSqueak();
        const rp = act.target.mesh.position;
        if (res.fed) {
          this.inventory.carrot -= 1;
          this._popupAt(rp.x, 0.95, rp.z, "超爱胡萝卜!", "#ff8ca3");
          this.ui.showToast(`${act.target.name}开心地吃掉了胡萝卜，决定跟着你一起散步！`);
          this._refreshUI();
        } else {
          this._popupAt(rp.x, 0.9, rp.z, "绒毛软乎乎", "#ffd2dc");
        }
        this._maybeBless(rp.x, 1.7, rp.z);
        break;
      }
      case "pickup_wood":
        this.world.removeDroppedItem(act.target);
        this.inventory.firewood += 1;
        this.sound.woodPickup();
        this._popupAt(act.target.x, 0.65, act.target.z, "+1 松木柴火", "#f5cfa0");
        this._refreshUI();
        break;
      case "shake_tree": {
        this.player.triggerSwing();
        this.sound.treeShake();
        const dropped = this.world.shakeTree(act.target);
        if (dropped) {
          this._popupAt(act.target.x, 2.2, act.target.z, "抖落了积雪与柴火!", "#e4f4ff");
        } else {
          this._popupAt(act.target.x, 2.2, act.target.z, "簌簌落雪...", "#e4f4ff");
        }
        break;
      }
    }
  }

  async enterCottage() {
    if (this.isIndoor || this.inTransition) return;
    if (this._resetJoystick) this._resetJoystick();
    this.inTransition = true;
    this.sound.doorCreak();
    this.savedOutdoorPos.copy(this.player.position);

    await this.ui.runFadeTransition("推开木门，炉火暖意与全景雪窗映入眼帘...", () => {
      this.isIndoor = true;
      this.world.group.visible = false;
      this.farm.group.visible = false;
      this.wildlife.group.visible = false;
      this.player.clearFootprints();
      this.emotes.clear();
      this.interior.group.visible = true;
      this.atmosphere.setIndoorMode(true);
      this.sound.setIndoor(true);

      this.player.position.copy(this.interior.spawnPos);
      this.player.facingAngle = Math.PI;
      this.camFocus.set(0, 1.05, -0.35);
      this.camTargetDist = 16.4;
      this.camDist = 16.4;
      this.camTargetYaw = 0;
      this.camYaw = 0;
      this.camTargetPitch = 0.44;
      this.camPitch = 0.44;
      this._refreshUI();
    });
    this.inTransition = false;
    if (!this.photoMode && this.bday.introSeen && !this.bday.enter) {
      this._completeBirthdayQuest("enter");
      this.ui.showToast("小屋里暖暖的～跟着右上角的生日清单逛一逛吧");
    }
  }

  async leaveCottage(message = "推门回到冬麓院子...") {
    if (!this.isIndoor || this.inTransition) return;
    if (this._resetJoystick) this._resetJoystick();
    this.inTransition = true;
    this.sound.doorCreak();

    await this.ui.runFadeTransition(message, () => {
      this.isIndoor = false;
      this.interior.group.visible = false;
      this.emotes.clear();
      this.world.group.visible = true;
      this.farm.group.visible = true;
      this.wildlife.group.visible = true;
      this.atmosphere.setIndoorMode(false);
      this.sound.setIndoor(false);

      this.player.position.set(-0.8, 0, -2.55);
      this.player.facingAngle = 0;
      this.camFocus.set(-0.2, 0.95, -1.8);
      this.camTargetDist = 22.6;
      this.camDist = 22.6;
      this.camTargetYaw = 0;
      this.camYaw = 0;
      this.camTargetPitch = 0.44;
      this.camPitch = 0.44;
      this._refreshUI();
    });
    this.inTransition = false;
  }

  async triggerNewDay(msg) {
    if (this.inTransition) return;
    this.inTransition = true;
    let grown = 0;
    let animalRes = { produced: 0, coopEggs: 0 };
    await this.ui.runFadeTransition(msg, () => {
      this.day += 1;
      grown = this.farm.advanceNewDay();
      animalRes = this.wildlife.advanceNewDay();
      this.atmosphere.setTime(7.0);
      this._refreshUI();
    });
    this.inTransition = false;
    this._saveGame();
    this.sound.harvestPop();
    this.ui.showToast(
      `第 ${this.day} 天清晨！${grown} 株蔬菜长高啦 · 牧场鸡窝现有 ${animalRes.coopEggs} 颗蛋，奶牛绵羊也准备好了！`
    );
    if (this._getNextMail()) {
      setTimeout(() => this.ui.showToast("门口的信箱旗子竖起来了，有新的信"), 2800);
    }
  }

  _updateMovement(dt) {
    if (this.inTransition || this.ui.isModalOpen() || (this.skyShow && this.skyShow.t < this.skyShow.lockUntil)) {
      return { isMoving: false, speedRatio: 1 };
    }

    let ix = 0;
    let iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;

    let isMoving = ix !== 0 || iz !== 0;
    let speedRatio = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) ? 1.48 : 1.0;

    // Seamless 360° analog virtual joystick input (outer ring auto-sprints!)
    if (!isMoving && this.joyState.active && this.joyState.mag > 0.08) {
      ix = this.joyState.x;
      iz = this.joyState.z;
      isMoving = true;
      speedRatio = this.joyState.sprinting
        ? 1.44
        : THREE.MathUtils.lerp(0.55, 1.05, this.joyState.mag);
    }

    if (isMoving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;

      const cos = Math.cos(this.camYaw);
      const sin = Math.sin(this.camYaw);
      const wx = ix * cos + iz * sin;
      const wz = -ix * sin + iz * cos;

      const speed = (this.isIndoor ? 3.6 : 4.35) * speedRatio;
      const nx = this.player.position.x + wx * speed * dt;
      const nz = this.player.position.z + wz * speed * dt;

      const resolved = this.isIndoor
        ? this.interior.resolveMovement(nx, nz)
        : this.world.resolveMovement(nx, nz);

      this.player.position.x = resolved.x;
      this.player.position.z = resolved.z;
      this.player.facingAngle = Math.atan2(wx, wz);

      if (!this.isIndoor) {
        const surf = this.world.getSurfaceInfo(resolved.x, resolved.z);
        this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, surf.y, Math.min(1, dt * 22));
        for (let i = this.world.droppedItems.length - 1; i >= 0; i--) {
          const item = this.world.droppedItems[i];
          if (Math.hypot(resolved.x - item.x, resolved.z - item.z) < 0.72) {
            this.world.removeDroppedItem(item);
            this.inventory.firewood += 1;
            this.sound.woodPickup();
            this._popupAt(item.x, 0.65, item.z, "+1 松木柴火", "#f5cfa0");
            this._refreshUI();
          }
        }
      } else {
        this.player.position.y = 0;
      }
    } else if (!this.isIndoor) {
      const surf = this.world.getSurfaceInfo(this.player.position.x, this.player.position.z);
      this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, surf.y, Math.min(1, dt * 18));
    }

    return { isMoving, speedRatio };
  }

  _orbitCameraByDrag(dx, dy, sensitivity = 0.0052) {
    this.photoPreset = null;
    if (this.isIndoor) {
      this.camTargetYaw = THREE.MathUtils.clamp(this.camTargetYaw - dx * sensitivity, -0.88, 0.88);
      this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch + dy * sensitivity * 0.78, 0.24, 0.78);
    } else {
      // Outdoors: FULL 360° horizontal orbit + vertical pitch from 8.5° alpine vista up to 54° farming overview!
      this.camTargetYaw -= dx * sensitivity;
      this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch + dy * sensitivity * 0.78, 0.14, 0.95);
    }
  }

  _updateCamera(dt) {
    this.camDist = THREE.MathUtils.lerp(this.camDist, this.camTargetDist, Math.min(1, dt * 8));
    this.camYaw = THREE.MathUtils.lerp(this.camYaw, this.camTargetYaw, Math.min(1, dt * 10));
    this.camPitch = THREE.MathUtils.lerp(this.camPitch, this.camTargetPitch, Math.min(1, dt * 10));

    let elev;
    if (this.photoPreset) {
      this.camFocus.copy(this.photoPreset.focus);
      elev = this.photoPreset.elev;
    } else {
      // Slightly raise focus height when pitching low so you admire the cabin eaves, sunset sky & alpine snow peaks!
      const lowLift = !this.isIndoor ? Math.max(0, (0.45 - this.camPitch) * 2.4) : 0;
      const target = this.isIndoor
        ? new THREE.Vector3(this.player.position.x * 0.56, 1.08, this.player.position.z * 0.25 - 0.35)
        : new THREE.Vector3(this.player.position.x, this.player.position.y + 0.95 + lowLift, this.player.position.z - 0.85);
      // Outdoors during the fireworks: stand still for a moment and the view tilts up to the
      // sky; start walking and it settles back to the normal follow camera
      const wantOut = !this.isIndoor && this.worldFireworks.showOn && (this._idleT || 0) > 1.0 ? 1 : 0;
      const outRate = wantOut ? dt * 0.7 : dt * 2.5;
      this._outSkyW = THREE.MathUtils.lerp(this._outSkyW || 0, wantOut, Math.min(1, outRate));
      const ow = THREE.MathUtils.smoothstep(this._outSkyW, 0, 1);
      if (ow > 0.001) target.y += 4.8 * ow;
      const sw = this._skyCamWeight();
      if (sw > 0) {
        // Look up over the back wall toward the sky outside the big north window
        target.lerp(_SKY_CAM_FOCUS, sw);
      }
      this.camFocus.lerp(target, Math.min(1, dt * 6.5));
      elev = THREE.MathUtils.lerp(this.camPitch, -0.1, sw);
      if (ow > 0.001) elev = THREE.MathUtils.lerp(elev, 0.0, ow);
    }

    const skyW = this._skyCamWeight();
    let camDist = THREE.MathUtils.lerp(this.camDist, 15.2, skyW);
    if (!this.isIndoor && this._outSkyW > 0.001) camDist = THREE.MathUtils.lerp(camDist, 17, THREE.MathUtils.smoothstep(this._outSkyW, 0, 1));
    const camYaw = this.camYaw * (1 - skyW);
    const horiz = Math.cos(elev) * camDist;
    const vert = Math.sin(elev) * camDist;

    this.camera.position.set(
      this.camFocus.x + Math.sin(camYaw) * horiz,
      this.camFocus.y + vert,
      this.camFocus.z + Math.cos(camYaw) * horiz
    );
    this.camera.lookAt(this.camFocus);
  }

  // Adaptive quality: if the device can't keep ~42 fps, step quality down (never back up,
  // so the picture doesn't keep flipping). Each step trades a little sharpness for smoothness.
  _monitorPerformance() {
    const now = performance.now();
    if (!this._perf) this._perf = { start: now, windowStart: now, frames: 0, level: 0, fps: 60, slow: 0 };
    const pf = this._perf;
    if (document.visibilityState !== "visible" || this.inTransition) {
      pf.windowStart = now;
      pf.frames = 0;
      return;
    }
    pf.frames++;
    const span = now - pf.windowStart;
    if (span < 2000) return;
    pf.fps = (pf.frames * 1000) / span;
    pf.windowStart = now;
    pf.frames = 0;
    if (now - pf.start < 5000 || pf.level >= 3) return; // let shaders compile first
    pf.slow = pf.fps < 42 ? pf.slow + 1 : 0;
    if (pf.slow < 2) return; // two slow windows in a row before acting
    pf.slow = 0;
    pf.level++;
    const dpr = window.devicePixelRatio || 1;
    const cur = this.renderer.getPixelRatio();
    if (pf.level === 1) {
      this.renderer.setPixelRatio(Math.max(1, Math.min(cur, dpr) * 0.75));
      this.atmosphere.snowQuality = 0.7;
    } else if (pf.level === 2) {
      const sh = this.atmosphere.dirLight.shadow;
      const size = Math.max(512, sh.mapSize.x / 2);
      sh.mapSize.set(size, size);
      if (sh.map) {
        sh.map.dispose();
        sh.map = null;
      }
      this.renderer.setPixelRatio(Math.min(cur, 1));
      this.atmosphere.snowQuality = 0.5;
    } else {
      this.renderer.setPixelRatio(Math.max(0.65, Math.min(cur, 1) * 0.8));
      this.atmosphere.snowQuality = 0.4;
    }
    this._syncCameraViewport();
    console.info(`[冬麓] 帧率 ${pf.fps.toFixed(0)}，自动降低画质到第 ${pf.level} 档`);
  }

  _loop(timestamp) {
    requestAnimationFrame((t) => this._loop(t));
    this._monitorPerformance();
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;

    const { isMoving, speedRatio } = this._updateMovement(dt);
    this._idleT = isMoving ? 0 : (this._idleT || 0) + dt;
    const surf = this.isIndoor
      ? { y: 0, surface: "wood", slopeX: 0 }
      : this.world.getSurfaceInfo(this.player.position.x, this.player.position.z);
    // Compute subtle physical forward/backward lean along player's facing direction on curved bridge arch!
    const forwardSlope = surf.slopeX * Math.sin(this.player.facingAngle);
    const slopePitch = isMoving ? THREE.MathUtils.clamp(-forwardSlope * 0.42, -0.18, 0.18) : 0;

    this.player.update(
      dt,
      this.elapsed,
      isMoving,
      speedRatio,
      this.isIndoor,
      (useWoodSound) => {
        this.sound.footstep(useWoodSound);
      },
      surf.surface,
      slopePitch
    );

    this.atmosphere.update(dt, this.camFocus, this.world.chimneyTopPos, this.elapsed, this.camera);
    this._updateSkyShow(dt);
    this._updateWorldFireworks(dt);
    // Fresh snow covers footprints quickly in a blizzard; they linger when the sky is clear
    this.player.footprintLife = [16, 7.5, 3.2][this.atmosphere.snowLevel] ?? 7.5;
    this.landscape.update(
      dt,
      this.elapsed,
      this.atmosphere.currentSky,
      this.atmosphere.skySunDir,
      this.atmosphere.snowLevel,
      this.isIndoor
    );

    if (!this.isIndoor) {
      this.canvas.style.cursor = "crosshair";
      this.world.update(dt, this.elapsed, this.atmosphere.nightFactor, this.player.position, this.atmosphere.snowLevel);
      this.farm.update(dt, this.elapsed);
      this.wildlife.update(dt, this.elapsed, this.player.position);

      if (this.photoMode) {
        this.farm.setHoveredTile(null);
      } else {
        const hoverTile = this._raycastFarmTile();
        if (hoverTile && Math.hypot(hoverTile.x - this.player.position.x, hoverTile.z - this.player.position.z) < 3.4) {
          this.farm.setHoveredTile(hoverTile);
        } else {
          const front = this.player.getFrontPoint(0.95);
          const frontTile = this.farm.getTileNearWorld(front.x, front.z, 0.78);
          this.farm.setHoveredTile(frontTile);
        }
      }
    } else {
      this.farm.setHoveredTile(null);
      const modalOpen = this.ui.isModalOpen();
      const hoveringGift = !modalOpen && !!this._raycastGiftBox();
      const hoveringLetter = !modalOpen && !hoveringGift && this._raycastLetter();
      const hoveringCake = !modalOpen && !hoveringGift && !hoveringLetter && this._raycastCake();
      this.interior.setGiftHovered(hoveringGift);
      this.interior.setLetterHovered(hoveringLetter);
      this.interior.setCakeHovered(hoveringCake);
      this.canvas.style.cursor = (hoveringGift || hoveringLetter || hoveringCake) ? "pointer" : "crosshair";
      this.interior.update(dt, this.elapsed, this.atmosphere.getSkySample(), this.atmosphere.snowLevel);
    }

    this.activeInteract = this._findBestInteractable();
    this.ui.setInteractPrompt(this.activeInteract ? this.activeInteract.label : null);
    const showFocus = !this.photoMode && !this.inTransition && !this.ui.isModalOpen();
    const focusAnchor = showFocus ? this._getInteractAnchor(this.activeInteract) : null;
    this.emotes.setFocus(focusAnchor, focusAnchor ? this._getInteractKey(this.activeInteract) : null);
    const hasMail = !!this._getNextMail();
    this.world.setMailFlag(hasMail);
    this.emotes.setIndicator("mail", hasMail && !this.isIndoor && !this.photoMode ? this.world.mailboxPos : null, "mail", 1.95);
    this.emotes.update(dt, this.elapsed);
    this.ui.updateTouchControls(this.activeInteract, this._getHotbarSlots()[this.selectedSlot], this.isIndoor);

    this._updateCamera(dt);

    if (Math.floor(this.elapsed * 6) !== Math.floor((this.elapsed - dt) * 6)) {
      this._refreshUI();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const _SKY_CAM_FOCUS = new THREE.Vector3(0.6, 5.1, -3.2);

window.addEventListener("DOMContentLoaded", () => {
  new WinterfootGame();
});
