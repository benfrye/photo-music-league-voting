// Cartoon racehorse with a photo for a jockey. Faces right.
import { esc } from './common.js?v=mw6g0r3r';

let uid = 0;
export function horseSVG({ photo, color = '#ff3ea5', mane = '#ffd400', cap = '#00c2c7', num = '' }) {
  const id = `jc${++uid}`;
  const leg = (cls, x, fill) => `
    <g class="leg ${cls}">
      <rect x="${x}" y="88" width="14" height="50" rx="7" fill="${fill}" stroke="#111" stroke-width="4"/>
      <rect x="${x - 3}" y="132" width="20" height="10" rx="4" fill="#111"/>
    </g>`;
  return `
  <svg class="horse" viewBox="0 -34 204 194" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="96" cy="18" r="33"/></clipPath></defs>
    <path class="tail" d="M44 68 C16 56 4 92 18 118 C24 100 30 88 46 84 Z" fill="${mane}" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    ${leg('l1', 58, shade(color))}
    ${leg('l2', 128, shade(color))}
    <ellipse cx="96" cy="80" rx="56" ry="30" fill="${color}" stroke="#111" stroke-width="4"/>
    ${leg('l3', 74, color)}
    ${leg('l4', 142, color)}
    <path d="M126 72 L148 24 L176 30 L158 90 Z" fill="${color}" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <rect x="150" y="14" width="50" height="28" rx="14" fill="${color}" stroke="#111" stroke-width="4" transform="rotate(30 162 26)"/>
    <polygon points="150,22 156,2 166,18" fill="${color}" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M152 14 l-10 10 l9 1 l-11 13 l9 1 l-11 13 l9 1 l-12 16" fill="none" stroke="${mane}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="170" cy="28" r="4.5" fill="#111"/><circle cx="171.5" cy="26.5" r="1.5" fill="#fff"/>
    <circle cx="190" cy="50" r="2.5" fill="#111"/>
    <path d="M70 56 Q96 44 122 56 L120 72 Q96 62 72 72 Z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <text x="96" y="70" text-anchor="middle" font-family="Luckiest Guy, Impact, sans-serif" font-size="15" fill="#111">${esc(num)}</text>
    <circle cx="96" cy="18" r="35" fill="#fff"/>
    ${photo ? `<image href="${esc(photo)}" x="61" y="-17" width="70" height="70" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
            : `<text x="96" y="32" text-anchor="middle" font-family="Luckiest Guy, Impact, sans-serif" font-size="40" fill="#111">?</text>`}
    <circle cx="96" cy="18" r="35" fill="none" stroke="#111" stroke-width="5"/>
    <path d="M66 -6 Q96 -44 126 -6 Z" fill="${cap}" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
    <path d="M120 -8 L146 -4" stroke="#111" stroke-width="6" stroke-linecap="round"/>
    <circle cx="96" cy="-25" r="4.5" fill="${mane}" stroke="#111" stroke-width="3"/>
  </svg>`;
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.72));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
