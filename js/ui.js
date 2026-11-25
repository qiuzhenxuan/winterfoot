export class GameUI {
  constructor(icons, callbacks) {
    this.icons = icons;
    this.callbacks = callbacks;

    this.elDay = document.getElementById("hud-day");
    this.elPhaseIcon = document.getElementById("hud-phase-icon");
    this.elClock = document.getElementById("hud-clock");
    this.elLocation = document.getElementById("hud-location");
    this.elGold = document.getElementById("hud-gold");

    this.elCntCarrot = document.getElementById("cnt-carrot");
    this.elCntRadish = document.getElementById("cnt-radish");
    this.elCntCabbage = document.getElementById("cnt-cabbage");
    this.elCntPumpkin = document.getElementById("cnt-pumpkin");
    this.elCntWood = document.getElementById("cnt-wood");
    this.elCntEgg = document.getElementById("cnt-egg");
    this.elCntMilk = document.getElementById("cnt-milk");
    this.elCntWool = document.getElementById("cnt-wool");
    this.elBtnIndoor = document.getElementById("btn-toggle-indoor");

    this.elHotbar = document.getElementById("hotbar");
    this.elHotbarLabel = document.getElementById("hotbar-label");
    this.elInteract = document.getElementById("interact-prompt");
    this.elInteractKeyCap = this.elInteract ? this.elInteract.querySelector(".key-cap") : null;
    this.elInteractText = document.getElementById("interact-text");
    this.elToastBox = document.getElementById("toast-box");
    this.elFloatLayer = document.getElementById("floating-layer");
    this.elTapRippleLayer = document.getElementById("tap-ripple-layer");
    this.elFade = document.getElementById("fade-overlay");
    this.elFadeMsg = document.getElementById("fade-message");

    this.elTimeSlider = document.getElementById("time-slider");
    this.elBtnFlow = document.getElementById("btn-time-flow");
    this.elBtnAudio = document.getElementById("btn-audio");
    this.elBtnTouchMode = document.getElementById("btn-touch-mode");
    this.elHelpModal = document.getElementById("help-modal");

    this.elBtnTouchInteract = document.getElementById("btn-touch-interact");
    this.elTouchInteractIco = document.getElementById("touch-interact-ico");
    this.elTouchInteractTxt = document.getElementById("touch-interact-txt");
    this.elBtnTouchAction = document.getElementById("btn-touch-action");
    this.elTouchActionIco = document.getElementById("touch-action-ico");
    this.elTouchActionTxt = document.getElementById("touch-action-txt");
    this.elBtnTouchCamReset = document.getElementById("btn-touch-cam-reset");

    this.touchUIEnabled = false;

    this.elGiftModal = document.getElementById("gift-modal");
    this.elGiftMainImg = document.getElementById("gift-main-img");
    this.elGiftTitle = document.getElementById("gift-title");
    this.elGiftDate = document.getElementById("gift-date");
    this.elGiftCaption = document.getElementById("gift-caption");
    this.elGiftCounter = document.getElementById("gift-counter");
    this.elGiftThumbs = document.getElementById("gift-thumbs");
    this.giftItems = [];
    this.giftIndex = 0;

    this.elLetterModal = document.getElementById("letter-modal");
    this.elLetterTitle = document.getElementById("letter-title");
    this.elLetterImg = document.getElementById("letter-img");
    this.elLetterSub = document.getElementById("letter-sub");
    this.elLetterCounter = document.getElementById("letter-counter");
    this.elLetterEnvelope = document.getElementById("letter-envelope");
    this.elLetterReader = document.getElementById("letter-reader");
    this.elLetterSheetWrap = document.getElementById("letter-sheet-wrap");
    this.elBtnLetterPrev = document.getElementById("btn-letter-prev");
    this.elBtnLetterNext = document.getElementById("btn-letter-next");
    this.letterConfig = null;
    this.letterPages = [];
    this.letterPage = 0;
    this.letterEnvelopeOpened = false;

    this.elGiftWrapCover = document.getElementById("gift-wrap-cover");
    this.revealedGifts = new Set();

    // Birthday layer: title screen, Stardew dialogue, checklist, wish & banner
    this.elTitle = document.getElementById("title-screen");
    this.elDialogue = document.getElementById("dialogue-box");
    this.elDialogueText = document.getElementById("dialogue-text");
    this.elDialogueNext = document.getElementById("dialogue-next");
    this.elDialoguePortrait = document.getElementById("dialogue-portrait");
    this.elDialogueName = document.getElementById("dialogue-name");
    this.dialogue = null;
    this.elQuest = document.getElementById("bday-quest");
    this.elQuestList = document.getElementById("bday-quest-list");
    this.elQuestCount = document.getElementById("bday-quest-count");
    this.elWish = document.getElementById("wish-overlay");
    this.elBanner = document.getElementById("bday-banner");
    this.elMail = document.getElementById("mail-modal");
    this.dayBadge = "";

    this.slotEls = [];
    this._bindControls();
  }

  _bindControls() {
    const panel = document.getElementById("control-panel");
    const btnToggle = document.getElementById("btn-toggle-panel");
    btnToggle.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      btnToggle.textContent = panel.classList.contains("collapsed") ? "▸" : "▾";
    });

    // Time presets
    const timeBtns = document.querySelectorAll("#time-presets button");
    timeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = parseFloat(btn.dataset.time);
        timeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.callbacks.onSetTime(t);
      });
    });

    this.elTimeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      timeBtns.forEach((b) => b.classList.remove("active"));
      this.callbacks.onSetTime(val);
    });

    this.elBtnFlow.addEventListener("click", () => {
      const next = this.callbacks.onToggleTimeFlow();
      this.elBtnFlow.classList.toggle("active", next);
      this.elBtnFlow.textContent = next ? "流逝: 开" : "流逝: 停";
    });

    // Snow intensity presets
    const snowBtns = document.querySelectorAll("#snow-presets button");
    snowBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const lvl = parseInt(btn.dataset.snow, 10);
        snowBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.callbacks.onSetSnow(lvl);
      });
    });

    document.getElementById("btn-next-day").addEventListener("click", () => {
      this.callbacks.onNextDay();
    });

    if (this.elBtnIndoor) {
      this.elBtnIndoor.addEventListener("click", () => {
        if (this.callbacks.onToggleIndoor) this.callbacks.onToggleIndoor();
      });
    }

    this.elBtnAudio.addEventListener("click", () => {
      const muted = this.callbacks.onToggleAudio();
      this.elBtnAudio.textContent = muted ? "音效: 关" : "音效: 开";
    });

    document.getElementById("btn-help").addEventListener("click", () => {
      this.elHelpModal.classList.remove("hidden");
    });
    document.getElementById("btn-close-help").addEventListener("click", () => {
      this.elHelpModal.classList.add("hidden");
    });
    this.elHelpModal.addEventListener("click", (e) => {
      if (e.target === this.elHelpModal) this.elHelpModal.classList.add("hidden");
    });

    if (this.elGiftModal) {
      document.getElementById("btn-close-gift").addEventListener("click", () => this.closeGiftGallery());
      document.getElementById("btn-gift-prev").addEventListener("click", () => this.stepGiftGallery(-1));
      document.getElementById("btn-gift-next").addEventListener("click", () => this.stepGiftGallery(1));
      this.elGiftModal.addEventListener("click", (e) => {
        if (e.target === this.elGiftModal) this.closeGiftGallery();
      });

      // Swipe left/right on Polaroid photo to browse gift album on mobile!
      const polaroid = this.elGiftModal.querySelector(".gift-polaroid");
      if (polaroid) {
        let swipeX = null;
        polaroid.addEventListener("pointerdown", (e) => { swipeX = e.clientX; });
        polaroid.addEventListener("pointerup", (e) => {
          if (swipeX === null) return;
          const dx = e.clientX - swipeX;
          swipeX = null;
          if (Math.abs(dx) > 42) this.stepGiftGallery(dx < 0 ? 1 : -1);
        });
        polaroid.addEventListener("pointercancel", () => { swipeX = null; });
      }
    }

    if (this.elLetterModal) {
      document.getElementById("btn-close-letter").addEventListener("click", () => this.closeLetterModal());
      this.elLetterModal.addEventListener("click", (e) => {
        if (e.target === this.elLetterModal) this.closeLetterModal();
      });
      document.getElementById("env-seal").addEventListener("click", (e) => {
        e.stopPropagation();
        this._breakLetterSeal();
      });
      this.elLetterEnvelope.addEventListener("click", () => this._breakLetterSeal());
      this.elBtnLetterPrev.addEventListener("click", () => this.stepLetterPage(-1));
      this.elBtnLetterNext.addEventListener("click", () => this.stepLetterPage(1));
      // Tap the sheet to zoom in for reading handwriting (scrollable when zoomed);
      // horizontal swipe flips pages when not zoomed.
      let swipeX = null;
      let swiped = false;
      this.elLetterSheetWrap.addEventListener("pointerdown", (e) => { swipeX = e.clientX; swiped = false; });
      this.elLetterSheetWrap.addEventListener("pointerup", (e) => {
        if (swipeX === null) return;
        const dx = e.clientX - swipeX;
        swipeX = null;
        if (!this.elLetterSheetWrap.classList.contains("zoomed") && Math.abs(dx) > 48 && this.letterPages.length > 1) {
          swiped = true;
          this.stepLetterPage(dx < 0 ? 1 : -1);
        }
      });
      this.elLetterSheetWrap.addEventListener("click", () => {
        if (swiped) { swiped = false; return; }
        this.elLetterSheetWrap.classList.toggle("zoomed");
      });
    }

    if (this.elGiftWrapCover) {
      this.elGiftWrapCover.addEventListener("click", (e) => {
        e.stopPropagation();
        this._unwrapCurrentGift();
      });
      this.elGiftWrapCover.addEventListener("pointerdown", (e) => e.stopPropagation());
      this.elGiftWrapCover.addEventListener("pointerup", (e) => e.stopPropagation());
    }

    if (this.elDialogue) {
      this.elDialogue.addEventListener("click", () => this.advanceDialogue());
    }
    if (this.elMail) {
      this.elMail.addEventListener("click", () => this.closeMail());
    }
    if (this.elQuest) {
      document.getElementById("bday-quest-head").addEventListener("click", () => {
        this.elQuest.classList.toggle("collapsed");
      });
    }
    const btnReplay = document.getElementById("btn-replay-birthday");
    if (btnReplay) {
      btnReplay.addEventListener("click", () => {
        this.elHelpModal.classList.add("hidden");
        if (this.callbacks.onReplayBirthday) this.callbacks.onReplayBirthday();
      });
    }
    const btnFw = document.getElementById("btn-replay-fireworks");
    if (btnFw) {
      btnFw.addEventListener("click", () => {
        this.elHelpModal.classList.add("hidden");
        if (this.callbacks.onReplayFireworks) this.callbacks.onReplayFireworks();
      });
    }

    if (this.elBtnTouchMode) {
      this.elBtnTouchMode.addEventListener("click", () => {
        this.setTouchUI(!this.touchUIEnabled);
      });
    }

    if (this.elInteract) {
      this.elInteract.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.touchUIEnabled && this.callbacks.onInteract) {
          this.callbacks.onInteract();
        }
      });
    }

    if (this.elBtnTouchInteract) {
      this.elBtnTouchInteract.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onInteract) this.callbacks.onInteract();
      });
    }

    if (this.elBtnTouchAction) {
      this.elBtnTouchAction.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onFarmAction) this.callbacks.onFarmAction();
      });
    }

    if (this.elBtnTouchCamReset) {
      this.elBtnTouchCamReset.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onResetCamera) this.callbacks.onResetCamera();
      });
    }

    // Auto-enable touch controls & collapse top-left panel on phones/tablets
    const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const isTouch = isCoarse || "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 820 || window.innerHeight <= 520;
    if (isTouch || isSmallScreen) {
      this.setTouchUI(true);
      if (isSmallScreen && !panel.classList.contains("collapsed")) {
        panel.classList.add("collapsed");
        btnToggle.textContent = "▸";
      }
    }
  }

  setTouchUI(enabled) {
    this.touchUIEnabled = !!enabled;
    document.body.classList.toggle("touch-ui", this.touchUIEnabled);
    if (this.elBtnTouchMode) {
      this.elBtnTouchMode.classList.toggle("active", this.touchUIEnabled);
      this.elBtnTouchMode.textContent = this.touchUIEnabled ? "触控: 开" : "触控";
    }
    if (this.elInteractKeyCap) {
      this.elInteractKeyCap.textContent = this.touchUIEnabled ? "👆" : "E";
    }
  }

  spawnTapRipple(screenX, screenY) {
    if (!this.elTapRippleLayer) return;
    const el = document.createElement("div");
    el.className = "tap-ripple";
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.elTapRippleLayer.appendChild(el);
    setTimeout(() => el.remove(), 400);
  }

  updateTouchControls(activeInteract, selectedSlot, isIndoor) {
    if (this.elBtnTouchInteract) {
      if (!activeInteract) {
        this.elBtnTouchInteract.classList.add("hidden");
      } else {
        const meta = {
          enter_cottage: ["🏡", "进小屋"],
          leave_cottage: ["❄", "出小屋"],
          open_gift: ["🎁", "拆礼盒"],
          read_letter: ["✉️", "展开信"],
          blow_candles: ["🎂", "许愿"],
          check_mail: ["✉️", "信箱"],
          eat_cake: ["🍰", "吃蛋糕"],
          sleep_bed: ["💤", "睡觉"],
          pet_cat: ["🐱", "撸猫"],
          stoke_hearth: ["🔥", "添柴"],
          drink_cocoa: ["☕", "热可可"],
          cook_soup: ["🍲", "煮汤"],
          cook_milk: ["🥛", "热牛奶"],
          shipping_sell: ["💰", "卖货"],
          shipping_buy: ["🌱", "买种子"],
          collect_eggs: ["🥚", "捡鸡蛋"],
          check_coop: ["🐔", "看鸡窝"],
          feed_trough: ["🌾", "喂干草"],
          farm_animal: ["❤️", "互动"],
          refill_water: ["💧", "打水"],
          greet_claude: ["🦀", "打招呼"],
          stoke_campfire: ["🔥", "添柴"],
          rabbit: ["🐰", "摸小兔"],
          pickup_wood: ["🪵", "捡柴火"],
          shake_tree: ["🌲", "摇树"],
        }[activeInteract.type] || ["✋", "互动"];
        this.elTouchInteractIco.textContent = meta[0];
        this.elTouchInteractTxt.textContent = meta[1];
        this.elBtnTouchInteract.classList.remove("hidden");
      }
    }

    if (this.elBtnTouchAction && selectedSlot) {
      this.elBtnTouchAction.classList.toggle("hidden", !!isIndoor);
      let ico = "⛏";
      let txt = "耕作";
      if (selectedSlot.id === "hoe") { ico = "⛏"; txt = "翻土"; }
      else if (selectedSlot.id === "watering_can") { ico = "💧"; txt = "浇水"; }
      else if (selectedSlot.kind === "seed") { ico = "🌱"; txt = "播种"; }
      else if (selectedSlot.id === "carrot") { ico = "🥕"; txt = "喂食"; }
      else if (selectedSlot.id === "firewood") { ico = "🪵"; txt = "柴火"; }
      this.elTouchActionIco.textContent = ico;
      this.elTouchActionTxt.textContent = txt;
    }
  }

  initLetter(config) {
    this.letterConfig = config;
    if (!config || !this.elLetterModal) return;
    this.elLetterTitle.textContent = config.title || "书桌上的火漆信";
    this.letterPages = Array.isArray(config.pages) && config.pages.length
      ? config.pages.slice()
      : (config.src ? [config.src] : []);
    this.elLetterSub.textContent = (config.subtitle || "") + (this.letterPages.length > 1 ? " · ◀ ▶ 翻页" : "");
    // Preload every page so flipping is instant
    this.letterPages.forEach((src) => { const im = new Image(); im.src = src; });
    this._showLetterPage(0);
  }

  isLetterOpen() {
    return this.elLetterModal && !this.elLetterModal.classList.contains("hidden");
  }

  openLetterModal() {
    if (!this.elLetterModal) return;
    this.elLetterSheetWrap.classList.remove("zoomed");
    const showEnvelope = !this.letterEnvelopeOpened;
    this.elLetterEnvelope.classList.toggle("hidden", !showEnvelope);
    this.elLetterEnvelope.classList.remove("opening");
    this.elLetterReader.classList.toggle("hidden", showEnvelope);
    if (!showEnvelope) this._showLetterPage(this.letterPage);
    this.elLetterModal.classList.remove("hidden");
  }

  closeLetterModal() {
    if (!this.elLetterModal || !this.isLetterOpen()) return;
    this.elLetterModal.classList.add("hidden");
    if (this.callbacks.onLetterClosed) this.callbacks.onLetterClosed(this.letterEnvelopeOpened);
  }

  _breakLetterSeal() {
    if (this.letterEnvelopeOpened || this.elLetterEnvelope.classList.contains("opening")) return;
    this.elLetterEnvelope.classList.add("opening");
    if (this.callbacks.onLetterSealBroken) this.callbacks.onLetterSealBroken();
    setTimeout(() => {
      this.letterEnvelopeOpened = true;
      this.elLetterEnvelope.classList.add("hidden");
      this.elLetterReader.classList.remove("hidden");
      this.elLetterReader.classList.add("unfold");
      this._showLetterPage(0);
      setTimeout(() => this.elLetterReader.classList.remove("unfold"), 700);
    }, 1050);
  }

  stepLetterPage(delta) {
    if (this.letterPages.length <= 1) return;
    const next = Math.max(0, Math.min(this.letterPages.length - 1, this.letterPage + delta));
    if (next === this.letterPage) return;
    this.elLetterSheetWrap.classList.remove("zoomed");
    this._showLetterPage(next);
    if (this.callbacks.onLetterPageTurn) this.callbacks.onLetterPageTurn();
  }

  _showLetterPage(idx) {
    if (!this.letterPages.length) return;
    this.letterPage = idx;
    this.elLetterImg.src = this.letterPages[idx];
    const multi = this.letterPages.length > 1;
    this.elLetterCounter.classList.toggle("hidden", !multi);
    this.elLetterCounter.textContent = `${idx + 1} / ${this.letterPages.length}`;
    this.elBtnLetterPrev.classList.toggle("hidden", !multi);
    this.elBtnLetterNext.classList.toggle("hidden", !multi);
    this.elBtnLetterPrev.disabled = idx === 0;
    this.elBtnLetterNext.disabled = idx === this.letterPages.length - 1;
  }

  setLetterEnvelopeOpened(opened) {
    this.letterEnvelopeOpened = !!opened;
    this.letterPage = 0;
  }

  initGiftGallery(items, revealedIds = []) {
    this.giftItems = items || [];
    this.revealedGifts = new Set(revealedIds);
    if (!this.elGiftThumbs) return;
    this.elGiftThumbs.innerHTML = "";
    this.giftItems.forEach((item, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gift-thumb";
      btn.title = item.title;
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.title;
      img.draggable = false;
      const wrap = document.createElement("span");
      wrap.className = "gift-thumb-wrap";
      wrap.textContent = "🎁";
      btn.append(img, wrap);
      btn.addEventListener("click", () => this.showGiftAt(idx));
      this.elGiftThumbs.appendChild(btn);
    });
    this._syncGiftThumbs();
  }

  setRevealedGifts(ids) {
    this.revealedGifts = new Set(ids);
    this._syncGiftThumbs();
  }

  getRevealedGiftCount() {
    return this.giftItems.filter((g) => this.revealedGifts.has(g.id)).length;
  }

  _syncGiftThumbs() {
    if (!this.elGiftThumbs) return;
    const thumbs = this.elGiftThumbs.querySelectorAll(".gift-thumb");
    thumbs.forEach((el, i) => {
      const item = this.giftItems[i];
      el.classList.toggle("wrapped", !!item && !this.revealedGifts.has(item.id));
      el.classList.toggle("active", i === this.giftIndex);
    });
  }

  isGiftGalleryOpen() {
    return this.elGiftModal && !this.elGiftModal.classList.contains("hidden");
  }

  openGiftGallery(startIndex = 0) {
    if (!this.elGiftModal || this.giftItems.length === 0) return;
    // Jump straight to the first still-wrapped present so nothing gets missed
    const firstWrapped = this.giftItems.findIndex((g) => !this.revealedGifts.has(g.id));
    this.showGiftAt(firstWrapped >= 0 ? firstWrapped : startIndex);
    this.elGiftModal.classList.remove("hidden");
  }

  closeGiftGallery() {
    if (!this.elGiftModal || !this.isGiftGalleryOpen()) return;
    this.elGiftModal.classList.add("hidden");
    if (this.callbacks.onGiftGalleryClosed) this.callbacks.onGiftGalleryClosed();
  }

  stepGiftGallery(delta) {
    if (this.giftItems.length === 0) return;
    const next = (this.giftIndex + delta + this.giftItems.length) % this.giftItems.length;
    this.showGiftAt(next);
  }

  showGiftAt(idx) {
    if (this.giftItems.length === 0) return;
    this.giftIndex = ((idx % this.giftItems.length) + this.giftItems.length) % this.giftItems.length;
    const item = this.giftItems[this.giftIndex];
    const wrapped = !this.revealedGifts.has(item.id);
    this.elGiftMainImg.src = item.src;
    this.elGiftMainImg.alt = item.title;
    this.elGiftTitle.textContent = wrapped ? "？？？" : item.title;
    this.elGiftDate.textContent = wrapped ? "还没拆开" : item.date;
    this.elGiftCaption.textContent = wrapped ? "包装纸下面藏着什么呢……" : item.caption;
    this.elGiftCounter.textContent = `${this.giftIndex + 1} / ${this.giftItems.length}`;
    if (this.elGiftWrapCover) {
      this.elGiftWrapCover.classList.remove("tearing");
      this.elGiftWrapCover.classList.toggle("hidden", !wrapped);
      this.elGiftWrapCover.style.setProperty("--wrap-hue", `${(this.giftIndex * 67) % 360}deg`);
    }
    this._syncGiftThumbs();
  }

  _unwrapCurrentGift() {
    const item = this.giftItems[this.giftIndex];
    if (!item || this.revealedGifts.has(item.id)) return;
    if (this.elGiftWrapCover.classList.contains("tearing")) return;
    this.elGiftWrapCover.classList.add("tearing");
    this.revealedGifts.add(item.id);
    if (this.callbacks.onGiftUnwrapped) {
      this.callbacks.onGiftUnwrapped(item, this.getRevealedGiftCount(), this.giftItems.length);
    }
    const idx = this.giftIndex;
    setTimeout(() => {
      if (this.giftIndex === idx) this.showGiftAt(idx);
    }, 520);
  }

  buildHotbar(slots, selectedIndex) {
    this.elHotbar.innerHTML = "";
    this.slotEls = [];
    slots.forEach((slot, idx) => {
      const el = document.createElement("div");
      el.className = "hotbar-slot" + (idx === selectedIndex ? " selected" : "");
      el.innerHTML = `
        <span class="slot-key">${idx + 1}</span>
        <img class="slot-icon" src="${this.icons[slot.icon]}" alt="${slot.name}" draggable="false" />
        ${slot.kind === "water"
          ? `<div class="slot-bar"><div class="slot-bar-fill" style="width:100%"></div></div>`
          : `<span class="slot-count"></span>`
        }
      `;
      el.addEventListener("click", () => this.callbacks.onSelectSlot(idx));
      this.elHotbar.appendChild(el);
      this.slotEls.push(el);
    });
    this.updateHotbar(slots, selectedIndex, 1.0);
  }

  updateHotbar(slots, selectedIndex, waterRatio) {
    slots.forEach((slot, idx) => {
      const el = this.slotEls[idx];
      if (!el) return;
      el.classList.toggle("selected", idx === selectedIndex);
      if (slot.kind === "water") {
        const fill = el.querySelector(".slot-bar-fill");
        if (fill) fill.style.width = `${Math.round(waterRatio * 100)}%`;
      } else {
        const cnt = el.querySelector(".slot-count");
        if (cnt) cnt.textContent = slot.count !== null ? String(slot.count) : "";
      }
    });
    const cur = slots[selectedIndex];
    if (cur) {
      this.elHotbarLabel.textContent = `${cur.name} · ${cur.hint}`;
    }
  }

  updateHUD({ day, clockStr, phaseIcon, locationName, gold, inventory, timeHours }) {
    this.elDay.textContent = `冬 · 第 ${day} 天${day === 1 && this.dayBadge ? " " + this.dayBadge : ""}`;
    this.elPhaseIcon.textContent = phaseIcon;
    this.elClock.textContent = clockStr;
    this.elLocation.textContent = locationName;
    this.elGold.textContent = String(gold);

    this.elCntCarrot.textContent = String(inventory.carrot);
    this.elCntRadish.textContent = String(inventory.radish);
    this.elCntCabbage.textContent = String(inventory.cabbage);
    this.elCntPumpkin.textContent = String(inventory.pumpkin);
    this.elCntWood.textContent = String(inventory.firewood);
    if (this.elCntEgg) this.elCntEgg.textContent = String(inventory.egg || 0);
    if (this.elCntMilk) this.elCntMilk.textContent = String(inventory.milk || 0);
    if (this.elCntWool) this.elCntWool.textContent = String(inventory.wool || 0);
    if (this.elBtnIndoor) {
      this.elBtnIndoor.textContent = locationName === "小屋室内" ? "回院子" : "进小屋";
    }

    if (document.activeElement !== this.elTimeSlider) {
      this.elTimeSlider.value = String(timeHours.toFixed(2));
    }
  }

  setInteractPrompt(text) {
    if (!text) {
      this.elInteract.classList.add("hidden");
    } else {
      this.elInteractText.textContent = text;
      this.elInteract.classList.remove("hidden");
    }
  }

  showToast(msg) {
    const div = document.createElement("div");
    div.className = "toast-item";
    div.textContent = msg;
    // longer lines (a constellation and its note) stay up long enough to read
    const ms = Math.max(2650, Math.min(7000, String(msg).length * 85));
    if (ms > 2650) div.style.animationDuration = `${ms - 50}ms`;
    this.elToastBox.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // Parchment speech bubble with a birthday blessing (stays ~3.6 s)
  spawnBlessing(screenX, screenY, text) {
    const el = document.createElement("div");
    el.className = "bless-pop";
    const margin = 90;
    el.style.left = `${Math.min(window.innerWidth - margin, Math.max(margin, screenX))}px`;
    el.style.top = `${Math.max(70, screenY)}px`;
    el.textContent = text;
    this.elFloatLayer.appendChild(el);
    setTimeout(() => el.remove(), 3650);
  }

  spawnFloatingText(screenX, screenY, text, color = "#fffbe6") {
    const el = document.createElement("div");
    el.className = "float-pop";
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.color = color;
    el.textContent = text;
    this.elFloatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1180);
  }

  async runFadeTransition(message, midCallback) {
    this.elFadeMsg.textContent = message || "";
    this.elFade.classList.add("visible");
    await new Promise((r) => setTimeout(r, 380));
    if (midCallback) midCallback();
    await new Promise((r) => setTimeout(r, 260));
    this.elFade.classList.remove("visible");
  }

  // Reflect a restored snow level / custom time in the control panel buttons
  syncWeatherButtons(snowLevel) {
    document.querySelectorAll("#snow-presets button").forEach((b) => {
      b.classList.toggle("active", parseInt(b.dataset.snow, 10) === snowLevel);
    });
    document.querySelectorAll("#time-presets button").forEach((b) => b.classList.remove("active"));
  }

  // ================= Birthday layer =================

  isModalOpen() {
    return this.isGiftGalleryOpen() || this.isLetterOpen() || this.isDialogueOpen() || this.isWishOpen() || this.isTitleOpen() || this.isMailOpen() || !!(this.journal && this.journal.isOpen()) || !!(this.wardrobe && this.wardrobe.isOpen()) || !!(this.board && this.board.isOpen());
  }

  isMailOpen() {
    return !!this.elMail && !this.elMail.classList.contains("hidden");
  }

  openMail(title, body, sign) {
    document.getElementById("mail-title").textContent = title || "";
    document.getElementById("mail-body").textContent = body || "";
    document.getElementById("mail-sign").textContent = sign || "";
    this.elMail.classList.remove("hidden");
    this._mailOpenedAt = performance.now();
  }

  closeMail() {
    if (!this.isMailOpen()) return;
    if (performance.now() - (this._mailOpenedAt || 0) < 300) return; // ignore the opening click
    this.elMail.classList.add("hidden");
    if (this.callbacks.onMailClosed) this.callbacks.onMailClosed();
  }

  isTitleOpen() {
    return !!this.elTitle && !this.elTitle.classList.contains("hidden");
  }

  showTitleScreen(main, sub, onStart) {
    document.getElementById("title-main").textContent = main;
    document.getElementById("title-sub").textContent = sub;
    this.elTitle.classList.remove("hidden", "leaving");
    document.body.classList.add("title-active");
    const btn = document.getElementById("btn-title-start");
    const start = () => {
      btn.removeEventListener("click", start);
      this.elTitle.classList.add("leaving");
      document.body.classList.remove("title-active");
      setTimeout(() => this.elTitle.classList.add("hidden"), 900);
      onStart();
    };
    btn.addEventListener("click", start);
  }

  setDialogueSpeaker(name, portraitSrc, portraitEmoji) {
    this.elDialogueName.textContent = name || "";
    this.elDialoguePortrait.innerHTML = "";
    if (portraitSrc) {
      const img = document.createElement("img");
      img.src = portraitSrc;
      img.alt = name || "";
      img.draggable = false;
      this.elDialoguePortrait.appendChild(img);
    } else {
      this.elDialoguePortrait.textContent = portraitEmoji || "✉️";
    }
  }

  isDialogueOpen() {
    return !!this.dialogue;
  }

  // Stardew-style typewriter dialogue; resolves when the last line is dismissed
  playDialogue(lines) {
    return new Promise((resolve) => {
      if (this.dialogue) this._finishDialogue();
      this.dialogue = { lines, idx: -1, typing: false, timer: null, resolve, openedAt: performance.now() };
      this.elDialogue.classList.remove("hidden");
      this._nextDialogueLine();
    });
  }

  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    // Ignore the same click/keypress that opened the box
    if (performance.now() - d.openedAt < 250) return;
    if (d.typing) {
      clearInterval(d.timer);
      d.typing = false;
      this.elDialogueText.textContent = d.lines[d.idx];
      this.elDialogueNext.classList.add("ready");
      return;
    }
    this._nextDialogueLine();
  }

  _nextDialogueLine() {
    const d = this.dialogue;
    d.idx += 1;
    if (d.idx >= d.lines.length) {
      this._finishDialogue();
      return;
    }
    const text = d.lines[d.idx];
    let i = 0;
    d.typing = true;
    this.elDialogueText.textContent = "";
    this.elDialogueNext.classList.remove("ready");
    d.timer = setInterval(() => {
      i += 1;
      this.elDialogueText.textContent = text.slice(0, i);
      if (i % 2 === 1 && this.callbacks.onDialogueBlip) this.callbacks.onDialogueBlip();
      if (i >= text.length) {
        clearInterval(d.timer);
        d.typing = false;
        this.elDialogueNext.classList.add("ready");
      }
    }, 45);
  }

  _finishDialogue() {
    const d = this.dialogue;
    if (!d) return;
    clearInterval(d.timer);
    this.dialogue = null;
    this.elDialogue.classList.add("hidden");
    d.resolve();
  }

  renderQuestLog(quests, justDoneId = null) {
    if (!this.elQuest) return;
    this.elQuest.classList.remove("hidden");
    this.elQuestList.innerHTML = "";
    let done = 0;
    for (const q of quests) {
      if (q.done) done += 1;
      const li = document.createElement("li");
      if (q.done) li.classList.add("done");
      if (q.id === justDoneId) li.classList.add("just-done");
      const box = document.createElement("span");
      box.className = "q-box";
      box.textContent = q.done ? "✔" : "";
      const txt = document.createElement("span");
      txt.className = "q-text";
      txt.textContent = q.text;
      li.append(box, txt);
      this.elQuestList.appendChild(li);
    }
    this.elQuestCount.textContent = `${done} / ${quests.length}`;
    this._placeQuestLog();
    if (!this._questResizeBound) {
      this._questResizeBound = true;
      window.addEventListener("resize", () => this._placeQuestLog());
    }
    this.elQuest.classList.toggle("all-done", done === quests.length);
    if (justDoneId) {
      this.elQuest.classList.remove("collapsed", "bump");
      void this.elQuest.offsetWidth;
      this.elQuest.classList.add("bump");
    }
    // On phones, show the list briefly then fold it to just "生日清单 2/4" (tap to expand)
    clearTimeout(this._questFoldTimer);
    if (window.innerWidth <= 820) {
      this.elQuest.classList.remove("collapsed");
      this._questFoldTimer = setTimeout(() => this.elQuest.classList.add("collapsed"), 6500);
    }
  }

  // Tuck the checklist right under the clock / gold HUD box
  _placeQuestLog() {
    const hud = document.getElementById("stardew-hud");
    if (!hud || !this.elQuest) return;
    const panel = document.getElementById("control-panel");
    // Landscape phones: the right column is full of touch buttons, so sit under the left panel instead
    if (window.innerHeight <= 520 && panel) {
      const p = panel.getBoundingClientRect();
      this.elQuest.style.left = `${Math.round(p.left)}px`;
      this.elQuest.style.right = "auto";
      this.elQuest.style.top = `${Math.round(p.bottom + 6)}px`;
      this.elQuest.style.width = "190px";
      return;
    }
    const r = hud.getBoundingClientRect();
    this.elQuest.style.left = "";
    this.elQuest.style.right = "";
    this.elQuest.style.top = `${Math.round(r.bottom + 8)}px`;
    this.elQuest.style.width = `${Math.round(r.width)}px`;
  }

  isWishOpen() {
    return !!this.elWish && !this.elWish.classList.contains("hidden");
  }

  // Dim the room, let the wish bar fill, then wait for a tap / Space to blow
  runWish(prompt, onBlow) {
    const text = document.getElementById("wish-text");
    const hint = document.getElementById("wish-hint");
    const fill = document.getElementById("wish-bar-fill");
    text.textContent = prompt;
    hint.textContent = "（安静地想一想……）";
    this._wishBlow = null;
    fill.style.transition = "none";
    fill.style.width = "0%";
    this.elWish.classList.remove("hidden", "ready");
    void fill.offsetWidth;
    fill.style.transition = "width 3.4s linear";
    fill.style.width = "100%";
    clearTimeout(this._wishTimer);
    this._wishTimer = setTimeout(() => {
      this.elWish.classList.add("ready");
      hint.textContent = "点击屏幕 / 按空格，吹灭蜡烛";
      this._wishBlow = () => {
        this._wishBlow = null;
        this.elWish.classList.add("hidden");
        onBlow();
      };
    }, 3450);
    this.elWish.onclick = () => this.tryBlowWish();
  }

  tryBlowWish() {
    if (this._wishBlow) {
      this._wishBlow();
      return true;
    }
    return false;
  }

  showBirthdayBanner(main, sub, ms = 5200) {
    document.getElementById("bday-banner-main").textContent = main;
    document.getElementById("bday-banner-sub").textContent = sub || "";
    this.elBanner.classList.remove("hidden", "show");
    void this.elBanner.offsetWidth;
    this.elBanner.classList.add("show");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      this.elBanner.classList.remove("show");
      this.elBanner.classList.add("hidden");
    }, ms);
  }

  setFireworksReplayVisible(visible) {
    const btn = document.getElementById("btn-replay-fireworks");
    if (btn) btn.classList.toggle("hidden", !visible);
  }
}
