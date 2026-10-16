// Sticky score bar for the judge scorer: running total + a stick that loads up with
// shapes, one per 1/SLOTS of the max score. Shapes cycle in shape and band color.
const COUNT_MS = 350;
const SLOTS = 8;
const PITCH = 35;
const HANDLE = 16;
const TIP = 14;
const STAGGER_MS = 70;
const PICK_W = 7;

// images/stick/skewer_stick.svg, drawn vertically; laid flat in stickSvg()
const PICK_VIEWBOX = "113.6072 -88.5575 18.4423 443.9435";
const PICK_PATH =
  "M 122.194 -88.556 C 123.326 -88.777 129.947 -64.744 129.671 -56.928 C 129.395 -49.112 130.093 -23.447 130.952 -5.744 C 131.809 11.959 130.215 32.555 130.717 55.962 C 131.219 79.37 130.914 105.691 130.958 132.705 C 131.002 159.719 131.391 184.868 130.965 208.276 C 130.54 231.683 130.728 241.499 131.498 269.773 C 132.268 298.047 132.286 307.83 131.206 317.731 C 130.127 327.632 125.015 355.386 123.75 355.386 C 122.486 355.386 117.264 329.249 116.153 319.348 C 115.041 309.448 115.891 286.314 115.032 268.611 C 114.175 250.908 114.589 231.683 114.087 208.275 C 113.586 184.867 113.783 159.132 113.739 132.119 C 113.695 105.105 113.414 79.37 113.839 55.962 C 114.264 32.555 113.217 11.475 114.017 -6.228 C 114.817 -23.932 113.475 -46.289 114.554 -56.19 C 115.634 -66.09 120.878 -88.534 122.143 -88.534";

const SHAPES = [
  `<rect x="-11.5" y="-11.5" width="23" height="23" />`,
  `<circle r="12.5" />`,
  `<path d="M0 -14 L14 11.5 L-14 11.5 Z" />`,
  `<path d="M0 -15 L15 0 L0 15 L-15 0 Z" />`,
];

function totalOf(categories, scores) {
  return categories.reduce((sum, c) => sum + (scores?.[c.key] || 0) * c.weight, 0);
}

function filledSlots(total, max) {
  return max ? Math.floor((total / max) * SLOTS) : 0;
}

function stickSvg(on) {
  const width = HANDLE + SLOTS * PITCH + TIP;
  const shapes = Array.from({ length: SLOTS }, (_, i) => {
    const x = HANDLE + i * PITCH + PITCH / 2;
    return `<g transform="translate(${x} 20)"><g class="kit-meter__shape${i < on ? " is-on" : ""}" data-band="${(i % 3) + 1}">${SHAPES[i % SHAPES.length]}</g></g>`;
  }).join("");
  const length = width - 4;
  return `
    <svg class="kit-meter__stick" viewBox="0 0 ${width} 40" aria-hidden="true">
      <g transform="translate(2 20) rotate(-90)">
        <svg class="kit-meter__pick" x="${-PICK_W / 2}" y="0" width="${PICK_W}" height="${length}"
          viewBox="${PICK_VIEWBOX}" preserveAspectRatio="none" overflow="visible">
          <path d="${PICK_PATH}" />
        </svg>
      </g>
      ${shapes}
    </svg>`;
}

export function scoreMeterHtml(categories, scores, { saved = false, actionHtml = "" } = {}) {
  const max = categories.reduce((sum, c) => sum + 5 * c.weight, 0);
  const total = totalOf(categories, scores);
  const anyScored = categories.some((c) => scores?.[c.key]);
  return `
    <div class="kit-meter" data-meter data-max="${max}">
      <div class="kit-meter__score">
        <span class="kit-meter__total" aria-hidden="true"><span data-meter-total>${total}</span><span class="kit-meter__max"> / ${max}</span></span>
        <span class="kit-meter__saved" data-meter-saved role="status">${anyScored ? (saved ? "saved" : "not saved") : ""}</span>
        <span class="kit-sr" role="status" data-meter-sr></span>
      </div>
      <div class="kit-meter__track">${stickSvg(filledSlots(total, max))}</div>
      ${actionHtml ? `<div class="kit-meter__action">${actionHtml}</div>` : ""}
    </div>`;
}

export function setMeterStatus(meter, text, tone = "muted") {
  const el = meter?.querySelector("[data-meter-saved]");
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

export function updateScoreMeter(meter, categories, scores, { saved = false } = {}) {
  if (!meter) return;
  const max = Number(meter.dataset.max);
  const total = totalOf(categories, scores);
  const on = filledSlots(total, max);

  const shapes = [...meter.querySelectorAll(".kit-meter__shape")];
  const changing = shapes.filter((s, i) => s.classList.contains("is-on") !== i < on);
  // shapes load on left to right and come off right to left
  if (changing.length && shapes.indexOf(changing[0]) >= on) changing.reverse();
  changing.forEach((s, n) => {
    s.style.transitionDelay = `${n * STAGGER_MS}ms`;
    s.classList.toggle("is-on");
  });

  setMeterStatus(meter, Object.keys(scores).length ? (saved ? "saved" : "not saved") : "");
  meter.querySelector("[data-meter-sr]").textContent = `Total ${total} of ${max}`;
  countTo(meter.querySelector("[data-meter-total]"), total);
}

function countTo(el, target) {
  const from = Number(el.textContent) || 0;
  cancelAnimationFrame(el._raf);
  if (from === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    el.textContent = Math.round(from + (target - from) * t);
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
