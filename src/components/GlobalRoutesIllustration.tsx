import React from 'react'

/** Decorative geography, deliberately independent of a customer's actual route. */
export default function GlobalRoutesIllustration() {
  return <svg className="workspace-route-globe" viewBox="0 0 560 410" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="shipping-globe-light" cx=".35" cy=".25" r=".8"><stop stopColor="#fbfdff" /><stop offset="1" stopColor="#dce7ef" /></radialGradient>
      <clipPath id="shipping-globe-clip"><circle cx="280" cy="205" r="164" /></clipPath>
    </defs>
    <ellipse cx="280" cy="216" rx="244" ry="72" transform="rotate(-27 280 216)" stroke="currentColor" strokeOpacity=".14" />
    <circle cx="280" cy="205" r="164" fill="url(#shipping-globe-light)" stroke="#dce5ec" />
    <g clipPath="url(#shipping-globe-clip)" stroke="#cbd9e3" strokeWidth=".8">
      <ellipse cx="280" cy="205" rx="112" ry="164" /><ellipse cx="280" cy="205" rx="54" ry="164" />
      <ellipse cx="280" cy="205" rx="164" ry="52" /><ellipse cx="280" cy="205" rx="164" ry="108" />
      <path d="M116 205H444M280 41V369" />
      <g fill="#b7cbd9" stroke="#e7eff4" strokeWidth="2" strokeLinejoin="round">
        <path d="M135 118 174 91 206 94 222 113 209 134 221 155 199 177 203 196 187 203 166 178 150 171 144 145 128 143Z" />
        <path d="M202 205 229 214 250 239 244 258 230 280 225 309 212 334 201 309 198 276 184 252 188 229Z" />
        <path d="M241 65 268 58 280 78 262 103 245 94Z" />
        <path d="M281 132 299 114 318 116 329 102 354 106 376 96 411 120 440 132 452 158 429 176 403 174 393 198 369 190 356 168 334 172 322 155 304 159 289 148Z" />
        <path d="M283 169 315 163 339 182 337 209 322 236 308 264 290 250 282 222 270 199Z" />
        <path d="M370 208 389 217 394 235 379 228ZM397 278 424 271 444 289 435 309 410 313 392 296Z" />
      </g>
    </g>
    <path d="M387 154C318 71 165 145 215 305" stroke="#2863a1" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
    <circle cx="387" cy="154" r="9" fill="#fff" /><circle cx="387" cy="154" r="4" fill="#2863a1" />
    <circle cx="215" cy="305" r="9" fill="#fff" /><circle cx="215" cy="305" r="4" fill="#10283c" />
    <g fill="currentColor" fontFamily="inherit" fontSize="11"><text x="404" y="149">Origen</text><text x="145" y="330">Argentina</text><text x="328" y="43" fontSize="8" letterSpacing="2">DE ORIGEN A DECISIÓN</text></g>
  </svg>
}
