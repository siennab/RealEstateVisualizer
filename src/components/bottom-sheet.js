import { LitElement, html, css } from 'lit'
import { ERAS } from '../store.js'

function houseIllustration(eraId, color, theme) {
  const roofs = {
    early:      'M40 60 L100 30 L160 60 Z',
    gilded:     'M40 60 L70 35 L130 35 L160 60 Z',
    victorian:  'M40 60 L60 30 L90 50 L120 25 L160 55 Z',
    craftsman:  'M35 65 L100 35 L165 65 Z',
    depression: 'M40 60 L100 40 L160 60 Z',
    midcentury: 'M30 55 L170 55',
    modernist:  'M30 55 L170 55',
    revival:    'M40 60 L70 40 L130 40 L160 60 Z',
    contemp:    'M30 55 L170 55',
  }
  const flat = eraId === 'midcentury' || eraId === 'modernist' || eraId === 'contemp'
  const roof = roofs[eraId] || roofs.early
  const bg = theme?.bg || '#fff'

  return html`
    <svg width="200" height="120" viewBox="0 0 200 120" style="margin-top:10px">
      <!-- body -->
      <rect x="40" y="${flat ? 55 : 60}" width="120" height="${flat ? 45 : 50}" fill="${color}" opacity="0.85"/>
      <!-- roof -->
      ${!flat ? html`<path d="${roof}" fill="${color}"/>` : ''}
      <!-- windows -->
      <rect x="55" y="70" width="22" height="22" fill="${bg}" opacity="0.9"/>
      <rect x="123" y="70" width="22" height="22" fill="${bg}" opacity="0.9"/>
      ${eraId === 'victorian' ? html`<rect x="89" y="65" width="20" height="28" fill="${bg}" opacity="0.9"/>` : ''}
      <!-- door -->
      <rect x="89" y="${flat ? 80 : 82}" width="20" height="22" fill="${bg}" opacity="0.95"/>
      <circle cx="104" cy="${flat ? 92 : 94}" r="0.8" fill="${color}"/>
      <!-- chimney -->
      ${!flat && eraId !== 'depression'
        ? html`<rect x="130" y="28" width="8" height="18" fill="${color}" opacity="0.7"/>`
        : ''}
    </svg>
  `
}

customElements.define('bottom-sheet', class extends LitElement {
  static styles = css`
    :host { display: block; }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.2);
      transition: opacity 240ms;
      z-index: 40;
    }
    .sheet {
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 8px;
      border-radius: 28px;
      box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
      transition: transform 360ms cubic-bezier(.32,.72,0,1);
      z-index: 50;
      overflow: hidden;
      padding-bottom: 28px;
    }
    .handle-row {
      display: flex;
      justify-content: center;
      padding: 8px 0 6px;
    }
    .handle {
      width: 36px;
      height: 4px;
      border-radius: 2px;
    }
    .photo-area {
      margin: 4px 16px 14px;
      height: 160px;
      border-radius: 18px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .year-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      font-family: ui-monospace, 'SF Mono', monospace;
    }
    .photo-label {
      position: absolute;
      bottom: 10px;
      right: 10px;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-family: ui-monospace, monospace;
      background: rgba(255,255,255,0.7);
      padding: 3px 7px;
      border-radius: 4px;
      backdrop-filter: blur(8px);
    }
    .content { padding: 0 22px; }
    .era-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .era-tag-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .style-name {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 26px;
      font-weight: 500;
      letter-spacing: -0.01em;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .address {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .stat {
      border-radius: 14px;
      padding: 10px 12px;
    }
    .stat-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 600;
      font-family: 'Fraunces', Georgia, serif;
    }
  `

  static properties = {
    property: { type: Object },
    theme:    { type: Object },
  }

  #onClose() {
    this.dispatchEvent(new CustomEvent('sheet-closed', { bubbles: true, composed: true }))
  }

  render() {
    const t = this.theme || {}
    const home = this.property
    const open = !!home
    const era = home ? ERAS.find(e => e.id === home.era) : null

    return html`
      <!-- backdrop -->
      <div
        class="backdrop"
        style="opacity:${open ? 1 : 0}; pointer-events:${open ? 'auto' : 'none'}"
        @click=${this.#onClose}
      ></div>

      <!-- sheet -->
      <div
        class="sheet"
        style="
          background:${t.sheet || '#fff'};
          transform:${open ? 'translateY(0)' : 'translateY(110%)'};
        "
      >
        <div class="handle-row">
          <div class="handle" style="background:${t.inkMuted}"></div>
        </div>

        ${home && era ? html`
          <!-- photo area -->
          <div
            class="photo-area"
            style="
              background: linear-gradient(135deg, ${era.color}22, ${era.color}55);
              border: 1px solid ${era.color}33;
            "
          >
            ${houseIllustration(home.era, era.color, t)}
            <div class="year-badge" style="background:${t.sheet};color:${t.ink}">
              ◷ c. ${home.year}
            </div>
            <div class="photo-label" style="color:${t.inkSoft}">
              photo pending
            </div>
          </div>

          <!-- content -->
          <div class="content">
            <div class="era-tag" style="color:${era.color}">
              <span class="era-tag-dot" style="background:${era.color}"></span>
              ${era.label}
            </div>
            ${home.style ? html`<div class="style-name" style="color:${t.ink}">${home.style}</div>` : ''}
            <div class="address" style="color:${t.inkSoft}">${home.address}</div>
            <div class="stats">
              <div class="stat" style="background:${t.bg}">
                <div class="stat-label" style="color:${t.inkSoft}">Year</div>
                <div class="stat-value" style="color:${t.ink}">${home.year}</div>
              </div>
              <div class="stat" style="background:${t.bg}">
                <div class="stat-label" style="color:${t.inkSoft}">Beds</div>
                <div class="stat-value" style="color:${t.ink}">${home.beds ?? '—'}</div>
              </div>
              <div class="stat" style="background:${t.bg}">
                <div class="stat-label" style="color:${t.inkSoft}">Sq Ft</div>
                <div class="stat-value" style="color:${t.ink}">${home.sqft != null ? home.sqft.toLocaleString() : '—'}</div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `
  }
})
