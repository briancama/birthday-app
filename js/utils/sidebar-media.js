function getMediaCatalog() {
  const gifCandidates = [
    {
      id: "gif_iron_man",
      type: "gif-stepper",
      src: "/images/iron-man.gif",
      alt: "Iron Man GIF",
      width: 347,
      height: 207,
      stepsPerClick: 3,
      gifSound: "proton-cannon.mp3",
      gifSoundPercent: 70,
      allowedAreas: ["sidebar"],
      audience: "signed-in",
    },
    {
      id: "gif_kobe",
      type: "gif-stepper",
      src: "/images/stepper-kobe.gif",
      alt: "Kobe Bryant GIF",
      width: 240,
      height: 180,
      stepsPerClick: 1,
      gifSound: "kobe.mp3",
      gifSoundPercent: 70,
      allowedAreas: ["sidebar"],
      audience: "signed-in",
    },
    {
      id: "gif_vince",
      type: "gif-stepper",
      src: "/images/stepper-vince.gif",
      alt: "Vince Carter GIF",
      width: 240,
      height: 192,
      stepsPerClick: 2,
      gifSound: "roundball-rock-basketball.mp3",
      gifSoundPercent: 70,
      allowedAreas: ["sidebar"],
      audience: "signed-in",
    },
    {
      id: "gif_gotenks",
      type: "gif-stepper",
      src: "/images/with-fusion.gif",
      alt: "Gotenks GIF",
      width: 139,
      height: 80,
      stepsPerClick: 1,
      gifSound: "dbz-ssj3-gotenks.mp3",
      gifSoundPercent: 70,
      allowedAreas: ["sidebar"],
      audience: "signed-in",
    },
    {
      id: "gif_hello_kitty",
      type: "gif-stepper",
      src: "/images/stepper-hello-kitty.gif",
      alt: "Hello Kitty GIF",
      width: 400,
      height: 150,
      stepsPerClick: 1,
      gifSound: "hello-kitty.mp3",
      gifSoundPercent: 70,
      allowedAreas: ["sidebar"],
      audience: "signed-in",
    },
  ];

  const adCandidates = [
    {
      id: "ad_on_a_stick",
      type: "ad",
      src: "/images/ad_on-a-stick.png",
      alt: "On a Stick — The Food Competition",
      link: "/on-a-stick",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
      // shown in every matching slot through this date, then dropped from the catalog
      pinUntil: "2026-12-05",
    },
    {
      id: "ad_att_click_here",
      type: "ad",
      src: "/images/ad_att-click-here.png",
      alt: "ATT Click Here",
      link: "#",
      audio: "/audio/woohoo.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["main"],
      audience: "both",
    },
    {
      id: "ad_ezsquirt",
      type: "ad",
      src: "/images/ad_ezsquirt.png",
      alt: "E-Z Squirt Shrek",
      link: "#",
      audio: "/audio/smashmouth_allstar.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_duke_nukem",
      type: "ad",
      src: "/images/ad_duke-nukem.gif",
      alt: "Play Duke Nukem 3D Here",
      link: "https://playclassic.games/games/first-person-shooter-dos-games-online/play-duke-nukem-3d-online/play/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["main"],
      audience: "both",
    },
    {
      id: "ad_babylon_5",
      type: "ad",
      src: "/images/ad_babylon-5.gif",
      alt: "Babylon 5 on TNT",
      link: "http://www.midwinter.com/lurk/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
      imageMaxWidth: "240px",
    },
    {
      id: "ad_tiger_trap",
      type: "ad",
      src: "/images/ad_tiger-trap.webp",
      alt: "Tiger Trap",
      link: "#",
      audio: "/audio/tiger-monologue.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_10th_kingdom",
      type: "ad",
      src: "/images/ad_10th_kingdom.gif",
      alt: "10th Kingdom",
      link: "#",
      audio: "/audio/suck-an-elf.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["main"],
      audience: "both",
    },
    {
      id: "ad_connery",
      type: "ad",
      src: "/images/ad_connery.gif",
      alt: "Sean Connery",
      link: "https://seanconnery.com/",
      audio: null,
      overlayText: "Entrapment",
      belowText: '"Welcome to the Rock"',
      overlayClass: "ad-connery",
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_heavensgate",
      type: "ad",
      src: "/images/ad_heavensgate.jpg",
      alt: "Heaven's Gate",
      link: "https://www.heavensgate.com/",
      audio: null,
      overlayText: "Next gate in 2,359 years",
      belowText: null,
      overlayClass: "ad-heavensgate",
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_homestar",
      type: "ad",
      src: "/images/ad_homestar.png",
      alt: "Homestar Runner",
      link: "https://homestarrunner.com/main",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_space_jam",
      type: "ad",
      src: "/images/ad_space-jam.gif",
      alt: "Space Jam",
      link: "https://www.spacejam.com/1996",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["sidebar"],
      audience: "both",
    },
    {
      id: "ad_toyraygun",
      type: "ad",
      src: "/images/ad_toyraygun.gif",
      alt: "Toy Ray Gun",
      link: "https://www.toyraygun.com/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
      allowedAreas: ["main"],
      audience: "both",
    },
  ];

  return [...adCandidates, ...gifCandidates];
}

function isAudienceMatch(item, isSignedIn) {
  if (item.audience === "signed-in") return !!isSignedIn;
  if (item.audience === "signed-out") return !isSignedIn;
  return true;
}

function getQueryTestConfig(req) {
  const sidebarTestRaw = String((req && req.query && req.query.sidebarTest) || "").toLowerCase();
  const enabled = sidebarTestRaw === "1" || sidebarTestRaw === "true";
  const rawIndex = Number.parseInt((req && req.query && req.query.sidebarIndex) || "0", 10);
  return {
    enabled,
    index: Number.isFinite(rawIndex) ? Math.max(0, rawIndex) : 0,
  };
}

function pickCandidate(candidates, testState) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (testState.enabled) {
    const idx = testState.cursor % candidates.length;
    testState.cursor += 1;
    return candidates[idx];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function resolveForcedItem(forced, catalogById) {
  if (!forced) return null;
  if (typeof forced === "string") {
    return catalogById.get(forced) || null;
  }
  if (forced && typeof forced === "object") {
    return { ...forced };
  }
  return null;
}

function buildMediaSlots({ req, isSignedIn, slotPlan = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const catalog = getMediaCatalog().filter((item) => !item.pinUntil || item.pinUntil >= today);
  const pinned = catalog.filter((item) => item.pinUntil);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const usedIds = new Set();
  const slots = {};

  const testConfig = getQueryTestConfig(req);
  const testState = {
    enabled: testConfig.enabled,
    cursor: testConfig.index,
  };

  for (const slot of slotPlan) {
    const {
      key,
      area,
      count = 1,
      includeTypes = null,
      forced = null,
      title = "Advertisement",
    } = slot;

    if (!key) continue;
    const items = [];

    const forcedItems = Array.isArray(forced) ? [...forced] : forced ? [forced] : [];
    pinned.forEach((item) => {
      if (Array.isArray(item.allowedAreas) && area && !item.allowedAreas.includes(area)) return;
      if (Array.isArray(includeTypes) && includeTypes.length && !includeTypes.includes(item.type))
        return;
      if (!isAudienceMatch(item, isSignedIn)) return;
      forcedItems.push(item);
    });
    for (const forcedEntry of forcedItems) {
      const forcedItem = resolveForcedItem(forcedEntry, catalogById);
      if (!forcedItem) continue;
      const forcedId = forcedItem.id || forcedItem.src;
      if (forcedId && usedIds.has(forcedId)) continue;
      items.push(forcedItem);
      if (forcedId) usedIds.add(forcedId);
      if (items.length >= count) break;
    }

    while (items.length < count) {
      const filtered = catalog.filter((item) => {
        const itemId = item.id || item.src;
        if (itemId && usedIds.has(itemId)) return false;
        if (!isAudienceMatch(item, isSignedIn)) return false;
        if (Array.isArray(item.allowedAreas) && area && !item.allowedAreas.includes(area)) {
          return false;
        }
        if (
          Array.isArray(includeTypes) &&
          includeTypes.length &&
          !includeTypes.includes(item.type)
        ) {
          return false;
        }
        return true;
      });

      const picked = pickCandidate(filtered, testState);
      if (!picked) break;
      items.push(picked);
      const pickedId = picked.id || picked.src;
      if (pickedId) usedIds.add(pickedId);
    }

    slots[key] = {
      key,
      area,
      title,
      items,
    };
  }

  const anyGifStepper = Object.values(slots).some((slot) =>
    Array.isArray(slot.items)
      ? slot.items.some((item) => item && item.type === "gif-stepper")
      : false
  );

  const basePath = (req && req.path) || "/";
  const total = catalog.length;
  const safeIndex = total > 0 ? testConfig.index % total : 0;

  const test = {
    enabled: testConfig.enabled,
    index: safeIndex,
    total,
    prevUrl: `${basePath}?sidebarTest=1&sidebarIndex=${Math.max(0, safeIndex - 1)}`,
    nextUrl: `${basePath}?sidebarTest=1&sidebarIndex=${safeIndex + 1}`,
  };

  const adKeys = Array.from(
    new Set(
      catalog
        .filter((item) => item.type === "ad")
        .map((item) => item.id || item.src)
        .filter(Boolean)
    )
  );

  return {
    slots,
    adKeys,
    anyGifStepper,
    test,
  };
}

module.exports = {
  getMediaCatalog,
  buildMediaSlots,
};
