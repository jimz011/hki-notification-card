/* HKI Notification Card
 * Version: 18.3.1 (Per-Notification Confirmation Override)
 */

const _getLit = () => {
  const base =
    customElements.get("hui-masonry-view") ||
    customElements.get("ha-panel-lovelace") ||
    customElements.get("ha-app");
  const LitElement = base ? Object.getPrototypeOf(base) : window.LitElement;
  const html = LitElement?.prototype?.html || window.html;
  const css = LitElement?.prototype?.css || window.css;
  return { LitElement, html, css };
};

const { LitElement, html, css } = _getLit();

const CARD_TYPE = "hki-notification-card";
const EDITOR_TAG = "hki-notification-card-editor";

const FONTS = [
  "system-ui, sans-serif",
  "Roboto, sans-serif",
  "Segoe UI, sans-serif",
  "Helvetica Neue, sans-serif",
  "Arial, sans-serif",
  "Verdana, sans-serif",
  "Open Sans, sans-serif",
  "Lato, sans-serif",
  "Montserrat, sans-serif",
  "Poppins, sans-serif",
  "Inter, sans-serif",
  "Nunito, sans-serif",
  "Raleway, sans-serif",
  "Ubuntu, sans-serif",
  "Source Sans Pro, sans-serif",
  "Oswald, sans-serif",
  "Playfair Display, serif",
  "Merriweather, serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Courier New, monospace",
  "Fira Code, monospace",
  "JetBrains Mono, monospace",
  "Custom"
];

// --- MAIN CARD CLASS ---
class HkiNotificationCard extends LitElement {
  
  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return {
      entity: "sensor.notifications",
      display_mode: "ticker",
      show_icon: true,
      interval: 3,
      auto_cycle: true
    };
  }

  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _tickerIndex: { state: true },
      _animationClass: { state: true },
      _isInBadgeSlot: { state: true },
      _popupOpen: { state: true },
      _marqueeNeedsDuplicate: { state: true },
      _confirmationPending: { state: true }
    };
  }

  constructor() {
    super();
    this._tickerIndex = 0;
    this._tickerTimer = null;
    this._marqueeFrame = null;
    this._marqueeResumeTimer = null;
    this._scrollPos = 0;
    this._isPaused = false;
    this._dragStart = null;
    this._isDragging = false;
    this._wasDragged = false;
    this._animationClass = "";
    this._lastMsgCount = -1;
    this._lastMsgJSON = "";
    this._isInBadgeSlot = false;
    this._popupOpen = false;
    this._popupPillSwipe = null;
    this._swipeHandlers = {};
    this._marqueeNeedsDuplicate = false;
    this._confirmationPending = null;
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = {
      entity: "", 
      attribute: "messages",
      display_mode: "ticker",
      show_empty: false,
      empty_message: "No Notifications",
      auto_cycle: true, 
      auto_scroll: true,
      marquee_speed: 1, 
      marquee_gap: 16,
      list_max_items: 3,
      interval: 3, 
      animation_duration: 0.5,
      animation: "slide",
      direction: "right",
      alignment: "left",
      full_width: false,
      show_icon: true,
      icon_after: false,
      text_color: "var(--primary-text-color)",
      icon_color: "var(--primary-text-color)",
      bg_color: "rgba(var(--rgb-card-background-color, 30, 30, 30), 0.85)",
      border_color: "rgba(255,255,255,0.08)",
      border_width: 1,
      border_radius: 99,
      box_shadow: "0 4px 12px rgba(0,0,0,0.15)",
      font_size: 13,
      font_weight: "Semi Bold",
      font_family: FONTS[0],
      custom_font_family: "",
      popup_title: "Notifications",
      popup_enabled: true,
      tap_action_popup_only: false,
      confirm_tap_action: false,
      // Button mode options
      button_icon: "mdi:bell",
      button_icon_color: "var(--primary-text-color)",
      button_bg_color: "rgba(var(--rgb-card-background-color, 30, 30, 30), 0.85)",
      button_size: 48,
      button_label: "",
      button_label_position: "below",
      button_show_badge: true,
      button_badge_color: "#ff4444",
      button_badge_text_color: "#ffffff",
      // Pill button options (when label_position is "inside")
      button_pill_size: 14,
      button_pill_full_width: false,
      button_pill_bg_color: "rgba(var(--rgb-card-background-color, 30, 30, 30), 0.85)",
      button_pill_border_style: "solid",
      button_pill_border_width: 1,
      button_pill_border_color: "rgba(255,255,255,0.08)",
      button_pill_border_radius: 99,
      button_pill_badge_position: "inside",
      ...config,
    };
    this._resetTicker();
  }

  connectedCallback() {
    super.connectedCallback();
    
    this._detectBadgeSlot();
    
    this._resizeObserver = new ResizeObserver(() => {
        this._detectBadgeSlot();
        if (this._config.display_mode === 'marquee') {
            // When using CSS animation (badge slot or nested in parent card),
            // only check overflow, don't reset the entire ticker
            if (this._isInBadgeSlot) {
                this._checkMarqueeOverflow();
            } else {
                this._resetTicker();
                this._checkMarqueeOverflow();
            }
        }
    });
    this._resizeObserver.observe(this);
    this._resetTicker();
    
    // Delayed initial overflow check for when card is dynamically created
    // (ensures DOM is fully rendered with dimensions before checking)
    if (this._config?.display_mode === 'marquee') {
        setTimeout(() => this._checkMarqueeOverflow(), 100);
        setTimeout(() => this._checkMarqueeOverflow(), 500);
    }
    
    this._boundMouseMove = this._onMove.bind(this);
    this._boundMouseUp = this._onEnd.bind(this);
    window.addEventListener("mousemove", this._boundMouseMove);
    window.addEventListener("mouseup", this._boundMouseUp);
  }

  _detectBadgeSlot() {
    let element = this;
    let depth = 0;
    const maxDepth = 15;
    
    while (element && depth < maxDepth) {
      const tagName = element.tagName?.toLowerCase() || '';
      const className = element.className || '';
      const slot = element.getAttribute?.('slot') || '';
      
      if (
        tagName.includes('badge') ||
        className.includes('badge') ||
        slot.includes('badge') ||
        tagName === 'hui-badge' ||
        (className.includes('header') && className.includes('slot')) ||
        // Detect when nested inside hki-header-card or similar parent cards
        // Use CSS animation instead of JS to prevent crash from ResizeObserver loops
        tagName === 'hki-header-card'
      ) {
        this._isInBadgeSlot = true;
        return;
      }
      
      element = element.parentElement || element.getRootNode()?.host;
      depth++;
    }
    
    this._isInBadgeSlot = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopTicker();
    this._stopMarquee();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    window.removeEventListener("mousemove", this._boundMouseMove);
    window.removeEventListener("mouseup", this._boundMouseUp);
  }

  _stopTicker() {
    if (this._tickerTimer) clearInterval(this._tickerTimer);
    this._tickerTimer = null;
  }

  _stopMarquee() {
    if (this._marqueeFrame) cancelAnimationFrame(this._marqueeFrame);
    if (this._marqueeResumeTimer) clearTimeout(this._marqueeResumeTimer);
    this._marqueeFrame = null;
  }

  _resetTicker() {
    this._stopTicker();
    this._stopMarquee();
    
    if (this._config.display_mode === "marquee") {
        if (!this._isInBadgeSlot) {
            setTimeout(() => this._startMarquee(), 200);
        }
        return;
    }
    
    if (this._config.display_mode === "list" || this._config.auto_cycle === false) return;

    const intervalMs = (this._config?.interval || 3) * 1000;
    if (intervalMs <= 0) return;

    this._tickerTimer = setInterval(() => {
      const msgs = this._getMessages();
      if (this._isPaused || msgs.length <= 1) return;
      this._changeMessage("next", "auto");
    }, intervalMs);
  }

  _startMarquee() {
    const loop = () => {
        if (!this.isConnected) {
            this._stopMarquee();
            return;
        }

        const shouldScroll = this._config.auto_scroll !== false && !this._isPaused && !this._isDragging;

        if (shouldScroll) {
            const container = this.shadowRoot?.querySelector('.marquee-container');
            if (container) {
                const speed = parseFloat(this._config.marquee_speed) || 1;
                if (container.scrollWidth > container.clientWidth) {
                    this._scrollPos += speed;
                    if (this._scrollPos >= container.scrollWidth / 2) {
                        this._scrollPos = 0;
                    }
                    container.scrollLeft = this._scrollPos;
                }
            }
        }
        this._marqueeFrame = requestAnimationFrame(loop);
    };
    this._stopMarquee();
    this._marqueeFrame = requestAnimationFrame(loop);
  }

  _getMessages() {
    if (!this.hass || !this._config || !this._config.entity) return [];
    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj || !stateObj.attributes) return [];
    const list = stateObj.attributes[this._config.attribute];
    return Array.isArray(list) ? list : [];
  }

  _changeMessage(dir, source) {
    const msgs = this._getMessages();
    if (msgs.length <= 1 && source === "auto") return; 

    this._animationClass = "";
    this.requestUpdate();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (dir === "next") this._tickerIndex++;
        else this._tickerIndex = this._tickerIndex > 0 ? this._tickerIndex - 1 : 0;
        
        const animType = this._config.animation || "slide";
        this._animationClass = `anim-${animType}`;
        this.requestUpdate();
      });
    });
  }
  
  _onStart(x, y) {
    this._isPaused = true;
    this._dragStart = { x, y };
    this._isDragging = false;
    this._wasDragged = false;
    if (this._marqueeResumeTimer) clearTimeout(this._marqueeResumeTimer);
    const container = this.shadowRoot?.querySelector('.marquee-container');
    if (container) this._scrollPos = container.scrollLeft;
    
    const content = this.shadowRoot?.querySelector('.marquee-content');
    if (content) content.classList.add('paused');
  }

  _onMove(e) {
    const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);
    if (!this._dragStart) return;
    
    const diffX = Math.abs(this._dragStart.x - x);
    const diffY = Math.abs(this._dragStart.y - y);
    
    if (diffX > 5 || diffY > 5) {
        this._isDragging = true;
        this._wasDragged = true;
        if (this._config.display_mode === "marquee" && !this._isInBadgeSlot) {
             const container = this.shadowRoot?.querySelector('.marquee-container');
             if (container) {
                 const deltaX = x - this._dragStart.x;
                 container.scrollLeft = this._scrollPos - deltaX;
             }
        }
    }
  }

  _onEnd(e) {
    if (!this._dragStart) return;
    const x = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0);
    const y = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
    const startX = this._dragStart.x;
    const startY = this._dragStart.y;
    this._dragStart = null;
    this._isDragging = false;

    if (this._config.display_mode === "marquee") {
        const container = this.shadowRoot?.querySelector('.marquee-container');
        if (container) this._scrollPos = container.scrollLeft;
        
        this._marqueeResumeTimer = setTimeout(() => { 
            this._isPaused = false;
            const content = this.shadowRoot?.querySelector('.marquee-content');
            if (content) content.classList.remove('paused');
        }, 3000);
        return;
    }
    
    this._isPaused = false;
    if (this._wasDragged && this._config.display_mode === "ticker") {
       const diffX = startX - x;
       const diffY = startY - y;
       const dir = this._config.direction || "right";
       const isVertical = dir === "top" || dir === "bottom";
       if (isVertical) {
         if (Math.abs(diffY) > 30) diffY > 0 ? this._changeMessage("next", "swipe") : this._changeMessage("prev", "swipe");
       } else {
         if (Math.abs(diffX) > 30) diffX > 0 ? this._changeMessage("next", "swipe") : this._changeMessage("prev", "swipe");
       }
    }
  }

  _handleClick(msg, e) {
    if (this._wasDragged) { this._wasDragged = false; return; }
    
    // If tap_action_popup_only is enabled, always open popup (ignore service call tap_actions)
    if (this._config.tap_action_popup_only && this._config.popup_enabled !== false && msg._real !== false) {
      this._openPopup();
      return;
    }
    
    // If message has custom tap_action
    if (msg.tap_action) {
      // Check if confirmation is needed:
      // 1. Per-notification 'confirm' overrides card setting
      // 2. Fall back to card's global confirm_tap_action
      const needsConfirm = msg.confirm !== undefined ? msg.confirm : this._config.confirm_tap_action;
      
      if (needsConfirm) {
        this._confirmationPending = msg;
        return;
      }
      this._executeTapAction(msg.tap_action);
      return;
    }
    
    // Default action: open popup (if enabled and not a fake message)
    if (this._config.popup_enabled !== false && msg._real !== false) {
      this._openPopup();
    }
  }

  // --- UPDATED TAP ACTION LOGIC ---
  _executeTapAction(action) {
    if (!action) return;

    // 1. Navigation
    if (action.action === "navigate" && action.navigation_path) {
      history.pushState(null, "", action.navigation_path);
      const event = new Event("location-changed", { bubbles: true, composed: true });
      window.dispatchEvent(event);
      return;
    } 
    
    // 2. URL
    if (action.action === "url" && action.url_path) {
      window.open(action.url_path, "_blank");
      return;
    }
    
    // 3. Popup
    if (action.action === "popup") {
      this._openPopup();
      return;
    }

    // 4. Service Call (Universal Handler)
    // Detects 'call-service', 'perform-action', or just a service string 'domain.service'
    let serviceName = null;
    
    if (action.service) {
      serviceName = action.service;
    } else if (typeof action.action === "string" && action.action.includes(".")) {
      // Handle modern 'action: light.toggle'
      serviceName = action.action;
    } else if (action.action === "call-service" || action.action === "perform-action") {
      // Fallback if 'service' wasn't set but type is declared
      // We assume data might contain the service if it was malformed, but usually 'service' is required here.
      if (action.service) serviceName = action.service;
    }

    if (serviceName) {
      const [domain, service] = serviceName.split(".");
      if (domain && service) {
        // Merge all possible data locations (legacy 'data', modern 'target', 'service_data')
        const serviceData = { 
          ...(action.data || {}), 
          ...(action.service_data || {}), 
          ...(action.target || {}) 
        };
        
        this.hass.callService(domain, service, serviceData);
      }
    }
  }

  _openPopup() {
    this._popupOpen = true;
  }

  _closePopup(e) {
    if (e) e.stopPropagation();
    this._popupOpen = false;
  }

  _handlePopupBackdropClick(e) {
    if (e.target.classList.contains('popup-backdrop')) {
      this._closePopup();
    }
  }

  _confirmAction(e) {
    if (e) e.stopPropagation();
    if (this._confirmationPending?.tap_action) {
      this._executeTapAction(this._confirmationPending.tap_action);
    }
    this._confirmationPending = null;
  }

  _cancelConfirmation(e) {
    if (e) e.stopPropagation();
    this._confirmationPending = null;
  }

  _handleConfirmationBackdropClick(e) {
    if (e.target.classList.contains('confirmation-backdrop')) {
      this._cancelConfirmation();
    }
  }

  _handlePopupPillClick(msg) {
    if (!msg.tap_action) return;
    
    // Check if confirmation is needed:
    // 1. Per-notification 'confirm' overrides card setting
    // 2. Fall back to card's global confirm_tap_action
    const needsConfirm = msg.confirm !== undefined ? msg.confirm : this._config.confirm_tap_action;
    
    if (needsConfirm) {
      this._confirmationPending = msg;
      return;
    }
    
    this._executeTapAction(msg.tap_action);
  }

  _getActionDescription(action) {
    if (!action) return "Perform action";
    
    if (action.action === "navigate" && action.navigation_path) {
      return `Navigate to ${action.navigation_path}`;
    }
    if (action.action === "url" && action.url_path) {
      return `Open ${action.url_path}`;
    }
    
    let serviceName = action.service;
    if (!serviceName && typeof action.action === "string" && action.action.includes(".")) {
      serviceName = action.action;
    }
    if (serviceName) {
      return `Call ${serviceName}`;
    }
    
    return "Perform action";
  }

  _clearAllNotifications(e) {
    e.stopPropagation();
    if (!this.hass || !this._config.entity) return;
    
    this.hass.callService('hki_notify', 'dismiss_all', {
      entity_id: this._config.entity
    });
    
    this._closePopup();
  }

  _dismissNotification(msgId, e) {
    if (e) e.stopPropagation();
    if (!this.hass || !this._config.entity) return;
    
    this.hass.callService('hki_notify', 'dismiss', {
      entity_id: this._config.entity,
      id: msgId
    });
  }

  _getFontWeight(w) {
    const map = { "Light": 300, "Regular": 400, "Medium": 500, "Semi Bold": 600, "Bold": 700, "Extra Bold": 800 };
    return map[w] || 600;
  }

  _getEffectiveFontFamily() {
    const c = this._config;
    if (c.font_family === "Custom" && c.custom_font_family) {
      return c.custom_font_family;
    }
    return c.font_family || FONTS[0];
  }

  willUpdate(changedProps) {
    super.willUpdate(changedProps);
    if (changedProps.has("hass")) {
      const msgs = this._getMessages();
      const currentJSON = JSON.stringify(msgs);
      if (currentJSON !== this._lastMsgJSON) {
        this._lastMsgJSON = currentJSON;
        if (this._lastMsgCount <= 0 && msgs.length > 0) this._tickerIndex = 0;
        this._lastMsgCount = msgs.length;
        // Reset duplicate flag so it re-evaluates after render
        if (this._config?.display_mode === 'marquee') {
          this._marqueeNeedsDuplicate = false;
        }
        this.requestUpdate();
      }
    }
  }

  updated(changedProps) {
    super.updated(changedProps);
    if (this._config?.display_mode === 'marquee' && this._config?.auto_scroll !== false) {
      this._checkMarqueeOverflow();
    }
  }

  _checkMarqueeOverflow() {
    const container = this.shadowRoot?.querySelector('.marquee-container');
    const content = this.shadowRoot?.querySelector('.marquee-content');
    if (!container || !content) return;
    
    const messageCount = this._getMessages().length;
    if (messageCount === 0) return;
    
    // When in badge slot or nested in parent card (like hki-header-card),
    // the container often doesn't have constrained width, making overflow
    // detection unreliable. In these cases, always enable duplicates
    // to ensure the CSS animation works properly.
    if (this._isInBadgeSlot) {
      if (!this._marqueeNeedsDuplicate) {
        this._marqueeNeedsDuplicate = true;
      }
      return;
    }
    
    // For normal (non-nested) contexts, check for actual overflow
    const pills = content.querySelectorAll('.pill');
    if (pills.length === 0 || container.clientWidth === 0) return;
    
    let originalWidth = 0;
    for (let i = 0; i < Math.min(pills.length, messageCount); i++) {
      if (pills[i].offsetWidth === 0) return;
      originalWidth += pills[i].offsetWidth;
    }
    const gap = parseFloat(this._config.marquee_gap) || 16;
    originalWidth += gap * messageCount;
    
    const needsDuplicate = originalWidth > container.clientWidth;
    
    if (needsDuplicate !== this._marqueeNeedsDuplicate) {
      this._marqueeNeedsDuplicate = needsDuplicate;
    }
  }

  _renderPill(msg, isSingle, mode) {
    const c = this._config;
    const isRealMsg = msg._real !== false; 
    const animClass = (mode === "ticker" && !isSingle && isRealMsg) ? this._animationClass : "";

    const textColor = msg.text_color || msg.color_text || c.text_color;
    const iconColor = msg.icon_color || msg.color_icon || c.icon_color;
    const bgColor = msg.bg_color || msg.color_bg || c.bg_color;
    const borderColor = msg.border_color || msg.color_border || c.border_color;

    const fontSize = msg.font_size || c.font_size;
    const fontWeight = msg.font_weight ? this._getFontWeight(msg.font_weight) : this._getFontWeight(c.font_weight);
    const fontFamily = msg.font_family || this._getEffectiveFontFamily();
    const borderRadius = msg.border_radius ?? c.border_radius;
    const borderWidth = msg.border_width ?? c.border_width;
    const boxShadow = msg.box_shadow || c.box_shadow;

    const msgAlignment = msg.alignment || c.alignment || "left";

    const styles = [
        `--pill-color: ${textColor}`,
        `--pill-icon-color: ${iconColor}`,
        `--pill-bg: ${bgColor}`,
        `--pill-border-color: ${borderColor}`,
        `--pill-border-width: ${borderWidth}px`,
        `--pill-radius: ${borderRadius}px`,
        `--pill-shadow: ${boxShadow}`,
        `--pill-font-size: ${fontSize}px`,
        `--pill-font-weight: ${fontWeight}`,
        `--pill-font-family: ${fontFamily}`
    ].join(";");

    const icon = msg.icon || "mdi:bell";
    const showIcon = c.show_icon !== false;
    const iconAfter = !!c.icon_after;
    const spinIcon = msg.icon_spin === true;
    const hasAction = !!msg.tap_action || (c.popup_enabled !== false && isRealMsg);
    const isFullWidth = c.full_width && mode !== 'marquee';
    const widthClass = isFullWidth ? "full" : "";
    const alignClass = isFullWidth ? `align-${msgAlignment}` : "";

    return html`
        <div class="pill ${animClass} ${widthClass} ${alignClass} ${hasAction ? "clickable" : ""}" 
             style="${styles}" 
             @click=${(e) => { e.stopPropagation(); this._handleClick(msg, e); }}>
          ${showIcon && !iconAfter ? html`<ha-icon class="icon ${spinIcon ? "spinning" : ""}" .icon=${icon}></ha-icon>` : ''}
          <div class="text">${msg.message}</div>
          ${showIcon && iconAfter ? html`<ha-icon class="icon ${spinIcon ? "spinning" : ""}" .icon=${icon}></ha-icon>` : ''}
        </div>
    `;
  }

  _renderButton(messageCount) {
    const c = this._config;
    const labelPosition = c.button_label_position || "below";
    const isPill = labelPosition === "inside";
    const hasLabel = c.button_label && c.button_label.trim() !== "";
    const showBadge = c.button_show_badge !== false && messageCount > 0;
    const pillBadgePosition = c.button_pill_badge_position || "inside";
    const fullWidth = c.full_width || c.button_pill_full_width;
    
    let contentAlign = "center";
    if (c.alignment === "left") contentAlign = "flex-start";
    if (c.alignment === "right") contentAlign = "flex-end";
    
    const iconButtonStyles = [
      `--button-size: ${c.button_size || 48}px`,
      `--button-bg: ${c.button_bg_color}`,
      `--button-icon-color: ${c.button_icon_color}`,
      `--badge-color: ${c.button_badge_color}`,
      `--badge-text-color: ${c.button_badge_text_color}`,
      `--content-align: ${contentAlign}`
    ].join(";");
    
    const pillButtonStyles = [
      `--pill-button-size: ${c.button_pill_size || 14}px`,
      `--pill-button-bg: ${c.button_pill_bg_color}`,
      `--pill-button-border-style: ${c.button_pill_border_style || 'solid'}`,
      `--pill-button-border-width: ${c.button_pill_border_width ?? 1}px`,
      `--pill-button-border-color: ${c.button_pill_border_color}`,
      `--pill-button-border-radius: ${c.button_pill_border_radius ?? 99}px`,
      `--button-icon-color: ${c.button_icon_color}`,
      `--badge-color: ${c.button_badge_color}`,
      `--badge-text-color: ${c.button_badge_text_color}`,
      `--content-align: ${contentAlign}`
    ].join(";");
    
    if (isPill && hasLabel) {
      const badgeOutside = pillBadgePosition === "outside";
      return html`
        <div class="notification-pill-wrapper ${fullWidth ? 'full-width' : ''}" style="${pillButtonStyles}">
          <div class="notification-pill-button ${fullWidth ? 'full-width' : ''} ${badgeOutside && showBadge ? 'has-outside-badge' : ''}" 
               @click=${() => this._openPopup()}>
            <ha-icon class="pill-button-icon" .icon=${c.button_icon || "mdi:bell"}></ha-icon>
            <span class="pill-button-label">${c.button_label}</span>
            ${showBadge && !badgeOutside ? html`
              <span class="pill-button-badge">${messageCount > 99 ? '99+' : messageCount}</span>
            ` : ''}
          </div>
          ${showBadge && badgeOutside ? html`
            <span class="pill-outside-badge">${messageCount > 99 ? '99+' : messageCount}</span>
          ` : ''}
        </div>
      `;
    }
    
    return html`
      <div class="notification-button ${hasLabel ? `with-label label-${labelPosition}` : ''} ${fullWidth ? 'full-width' : ''}" 
           style="${iconButtonStyles}"
           @click=${() => this._openPopup()}>
        ${hasLabel && labelPosition === 'left' ? html`<span class="button-label">${c.button_label}</span>` : ''}
        <div class="button-icon-container">
          <ha-icon class="button-icon" .icon=${c.button_icon || "mdi:bell"}></ha-icon>
          ${showBadge ? html`
            <span class="button-badge">${messageCount > 99 ? '99+' : messageCount}</span>
          ` : ''}
        </div>
        ${hasLabel && (labelPosition === 'right' || labelPosition === 'below') ? html`<span class="button-label">${c.button_label}</span>` : ''}
      </div>
    `;
  }

  _calculateScrollDuration(messages) {
    const baseWidth = messages.length * 150;
    const speed = parseFloat(this._config.marquee_speed) || 1;
    return Math.max(5, (baseWidth / 50) / speed);
  }

  _renderPopup(messages) {
    const c = this._config;
    const realMessages = messages.filter(m => m._real !== false);
    const count = realMessages.length;
    
    return html`
      <div class="popup-backdrop" @click=${(e) => this._handlePopupBackdropClick(e)}>
        <div class="popup-container">
          <div class="popup-header">
            <span class="popup-title">
              ${c.popup_title || 'Notifications'}
              <span class="popup-count-badge">${count}</span>
            </span>
            <button class="popup-close-btn" @click=${(e) => this._closePopup(e)}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="popup-content">
            ${realMessages.length > 0 ? realMessages.map(msg => this._renderPopupPill(msg)) : html`
              <div class="popup-empty">No notifications</div>
            `}
          </div>
          ${realMessages.length > 0 ? html`
            <div class="popup-footer">
              <button class="popup-clear-all-btn" @click=${(e) => this._clearAllNotifications(e)}>
                Clear All
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderConfirmation(msg) {
    const icon = msg.icon || "mdi:bell";
    // Use custom confirm_message if provided, otherwise fall back to action description
    const actionDesc = msg.confirm_message || this._getActionDescription(msg.tap_action);
    
    return html`
      <div class="confirmation-backdrop" @click=${(e) => this._handleConfirmationBackdropClick(e)}>
        <div class="confirmation-container">
          <div class="confirmation-icon">
            <ha-icon icon=${icon}></ha-icon>
          </div>
          <div class="confirmation-message">${msg.message}</div>
          <div class="confirmation-action-desc">${actionDesc}</div>
          <div class="confirmation-buttons">
            <button class="confirmation-btn cancel" @click=${(e) => this._cancelConfirmation(e)}>
              Cancel
            </button>
            <button class="confirmation-btn confirm" @click=${(e) => this._confirmAction(e)}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _renderPopupPill(msg) {
    const c = this._config;
    const isRealMsg = msg._real !== false;

    const textColor = msg.text_color || msg.color_text || "var(--primary-text-color)";
    const iconColor = msg.icon_color || msg.color_icon || "var(--primary-text-color)";
    const bgColor = msg.bg_color || msg.color_bg || "rgba(var(--rgb-card-background-color, 30, 30, 30), 0.85)";
    const borderColor = msg.border_color || msg.color_border || "rgba(255, 255, 255, 0.08)";
    
    const fontSize = 14; 
    const fontWeight = 600; 
    const fontFamily = FONTS[0];
    const borderRadius = 12; 
    const borderWidth = 1;
    const boxShadow = "none"; 

    const wrapperStyles = [
        `--pill-color: ${textColor}`,
        `--pill-icon-color: ${iconColor}`,
        `--pill-bg: ${bgColor}`,
        `--pill-border-color: ${borderColor}`,
        `--pill-border-width: ${borderWidth}px`,
        `--pill-radius: ${borderRadius}px`,
        `--pill-shadow: ${boxShadow}`,
        `--pill-font-size: ${fontSize}px`,
        `--pill-font-weight: ${fontWeight}`,
        `--pill-font-family: ${fontFamily}`
    ].join(";");

    const pillStyles = `transform: translateX(0px)`;

    const icon = msg.icon || "mdi:bell";
    const showIcon = c.show_icon !== false;
    const iconAfter = !!c.icon_after;
    const spinIcon = msg.icon_spin === true;
    const hasAction = !!msg.tap_action;

    return html`
      <div class="popup-pill-wrapper"
           style="${wrapperStyles}"
           @touchstart=${(e) => this._onPopupPillTouchStart(e, msg)}
           @touchmove=${(e) => this._onPopupPillTouchMove(e, msg)}
           @touchend=${(e) => this._onPopupPillTouchEnd(e, msg)}
           @mousedown=${(e) => this._onPopupPillMouseDown(e, msg)}>
        <div class="popup-pill-swipe-bg">
          <ha-icon icon="mdi:delete"></ha-icon>
        </div>
        <div class="pill popup-pill ${hasAction ? "clickable" : ""}" 
             style="${pillStyles}" 
             @click=${hasAction ? (e) => { e.stopPropagation(); this._handlePopupPillClick(msg); } : null}>
          ${showIcon && !iconAfter ? html`<ha-icon class="icon ${spinIcon ? "spinning" : ""}" .icon=${icon}></ha-icon>` : ''}
          <div class="text">${msg.message}</div>
          ${showIcon && iconAfter ? html`<ha-icon class="icon ${spinIcon ? "spinning" : ""}" .icon=${icon}></ha-icon>` : ''}
          ${hasAction ? html`<ha-icon class="action-indicator" icon="mdi:chevron-right"></ha-icon>` : ''}
          ${isRealMsg ? html`
            <button class="dismiss-btn" @click=${(e) => this._dismissNotification(msg.id, e)}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // --- Touch Events ---
  _onPopupPillTouchStart(e, msg) {
    const touch = e.touches[0];
    this._startSwipe(touch.clientX, touch.clientY, e.currentTarget, msg);
  }

  _onPopupPillTouchMove(e, msg) {
    const touch = e.touches[0];
    this._moveSwipe(touch.clientX, touch.clientY, e, msg);
  }

  _onPopupPillTouchEnd(e, msg) {
    this._endSwipe(e, msg);
  }

  // --- Mouse Events ---
  _onPopupPillMouseDown(e, msg) {
    if (e.button !== 0) return; 
    this._isMouseSwiping = true;
    
    this._swipeHandlers.move = (ev) => this._onWindowMouseMove(ev, msg);
    this._swipeHandlers.up = (ev) => this._onWindowMouseUp(ev, msg);
    
    window.addEventListener('mousemove', this._swipeHandlers.move);
    window.addEventListener('mouseup', this._swipeHandlers.up);
    
    this._startSwipe(e.clientX, e.clientY, e.currentTarget, msg);
  }

  _onWindowMouseMove(e, msg) {
    if (!this._isMouseSwiping) return;
    this._moveSwipe(e.clientX, e.clientY, e, msg);
  }

  _onWindowMouseUp(e, msg) {
    if (!this._isMouseSwiping) return;
    this._isMouseSwiping = false;
    
    this._endSwipe(e, msg);
    
    window.removeEventListener('mousemove', this._swipeHandlers.move);
    window.removeEventListener('mouseup', this._swipeHandlers.up);
  }

  // --- Unified Swipe Logic ---
  _startSwipe(x, y, currentTarget, msg) {
    const swipeBg = currentTarget.querySelector('.popup-pill-swipe-bg');
    this._popupPillSwipe = {
      startX: x,
      startY: y,
      currentX: 0,
      msg: msg,
      element: currentTarget.querySelector('.popup-pill'),
      bgElement: swipeBg
    };
  }

  _moveSwipe(x, y, e, msg) {
    if (!this._popupPillSwipe || this._popupPillSwipe.msg !== msg) return;
    
    const diffX = x - this._popupPillSwipe.startX;
    const diffY = Math.abs(y - this._popupPillSwipe.startY);
    
    if (diffX < 0 && diffY < 30) {
      if (e.cancelable) e.preventDefault();
      
      if (this._popupPillSwipe.bgElement) {
        this._popupPillSwipe.bgElement.style.visibility = 'visible';
        this._popupPillSwipe.bgElement.style.opacity = '1';
      }
      
      const translateX = Math.max(diffX, -120);
      this._popupPillSwipe.currentX = translateX;
      this._popupPillSwipe.element.style.transform = `translateX(${translateX}px)`;
      this._popupPillSwipe.element.style.transition = 'none';
    }
  }

  _endSwipe(e, msg) {
    if (!this._popupPillSwipe || this._popupPillSwipe.msg !== msg) return;
    
    const element = this._popupPillSwipe.element;
    const bgElement = this._popupPillSwipe.bgElement;
    const currentX = this._popupPillSwipe.currentX;
    
    element.style.transition = 'transform 0.2s ease-out';
    
    if (currentX < -80) {
      element.style.transform = 'translateX(-100%)';
      setTimeout(() => {
        this._dismissNotification(msg.id, e);
      }, 200);
    } else {
      element.style.transform = 'translateX(0)';
      if (bgElement) {
        setTimeout(() => { 
            bgElement.style.opacity = '0'; 
            bgElement.style.visibility = 'hidden';
        }, 200);
      }
    }
    
    this._popupPillSwipe = null;
  }

  render() {
    if (!this._config || !this.hass) return html``;
    
    let messages = this._getMessages();
    let mode = this._config.display_mode || "ticker";
    const realMessageCount = messages.filter(m => m._real !== false).length;
    
    const c = this._config;
    let alignValue = "flex-start";
    if (c.alignment === "center") alignValue = "center";
    if (c.alignment === "right") alignValue = "flex-end";
    
    const containerStyles = [
        `--anim-duration: ${c.animation_duration || 0.5}s`,
        `--marquee-gap: ${c.marquee_gap || 16}px`,
        `--align-value: ${alignValue}`
    ].join(";");
    
    if (mode === 'button') {
      this.style.display = "block";
      return html`
        <div class="wrapper button-mode-wrapper" style="${containerStyles}">
          ${this._renderButton(realMessageCount)}
        </div>
        ${this._popupOpen ? this._renderPopup(messages) : ''}
        ${this._confirmationPending ? this._renderConfirmation(this._confirmationPending) : ''}
      `;
    }
    
    if (messages.length === 0) { 
        if (this._config.show_empty === true) {
            messages = [{
                message: this._config.empty_message || "No Notifications",
                icon: "mdi:bell-off",
                tap_action: null,
                _real: false 
            }];
            mode = "ticker"; 
        } else {
            this.style.display = "none"; 
            return html``; 
        }
    }
    this.style.display = "block";

    const dist = "30px";
    let startX = "0px"; let startY = "0px";
    switch(c.direction) {
        case "left": startX = `-${dist}`; break;
        case "top": startY = `-${dist}`; break;
        case "bottom": startY = dist; break;
        case "right": default: startX = dist; break;
    }
    
    const itemHeight = (c.font_size || 13) + 18 + 8;
    const listMaxHeight = (c.list_max_items || 3) * itemHeight;

    const scrollDuration = this._calculateScrollDuration(messages);
    // Only use CSS animation when in badge slot/nested AND duplicates are rendered
    // The -50% translateX animation requires duplicated content to loop properly
    const useCSSAnimation = this._isInBadgeSlot && c.auto_scroll !== false && this._marqueeNeedsDuplicate;

    const standardStyles = containerStyles + [
        `; --enter-x: ${startX}`, `--enter-y: ${startY}`,
        `--list-max-height: ${listMaxHeight}px`,
        `--scroll-duration: ${scrollDuration}s`
    ].join(";");

    return html`
      <div class="wrapper ${mode === 'marquee' ? 'marquee-mode' : ''}" style="${standardStyles}"
        @touchstart=${(e) => this._onStart(e.touches[0].clientX, e.touches[0].clientY)}
        @touchmove=${(e) => this._onMove(e)}
        @touchend=${(e) => this._onEnd(e)}
        @mousedown=${(e) => this._onStart(e.clientX, e.clientY)}
      >
        ${mode === 'marquee' ? html`
             <div class="marquee-container ${useCSSAnimation ? 'with-fade' : ''}">
                <div class="marquee-content ${useCSSAnimation ? 'css-scroll' : ''}">
                    ${messages.map(msg => this._renderPill(msg, false, "marquee"))}
                    ${c.auto_scroll !== false && this._marqueeNeedsDuplicate ? messages.map(msg => this._renderPill(msg, false, "marquee")) : ''}
                </div>
             </div>`
           : mode === 'list' ? html`
             <div class="list-container">${messages.map(msg => this._renderPill(msg, false, "list"))}</div>`
           : html`
             <div class="ticker-container">${this._renderPill(messages[this._tickerIndex % messages.length], messages.length === 1, "ticker")}</div>`
        }
      </div>
      ${this._popupOpen ? this._renderPopup(messages) : ''}
      ${this._confirmationPending ? this._renderConfirmation(this._confirmationPending) : ''}
    `;
  }

  static get styles() {
    return css`
      :host { display: block; touch-action: pan-y; }
      .wrapper { position: relative; display: flex; width: 100%; user-select: none; justify-content: var(--align-value, flex-start); }
      .wrapper.marquee-mode { touch-action: pan-y; cursor: grab; }
      .wrapper.marquee-mode:active { cursor: grabbing; }
      
      .wrapper.button-mode-wrapper {
        width: 100%;
        display: flex;
        justify-content: var(--align-value, flex-start);
      }
      
      .ticker-container { display: flex; overflow: hidden; justify-content: var(--align-value, flex-start); width: 100%; }
      .marquee-container { width: 100%; overflow: hidden; white-space: nowrap; }
      
      .marquee-container.with-fade {
        -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 100%);
        mask-image: linear-gradient(to right, transparent 0%, black 5%, black 100%);
      }
      
      .marquee-content { display: inline-flex; gap: var(--marquee-gap); padding: 0 4px; }
      
      .marquee-content.css-scroll {
        animation: marquee-scroll var(--scroll-duration, 20s) linear infinite;
      }
      .marquee-content.css-scroll.paused {
        animation-play-state: paused;
      }
      @keyframes marquee-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      
      .list-container { 
        display: flex; 
        flex-direction: column; 
        gap: 8px; 
        width: 100%; 
        max-height: var(--list-max-height); 
        overflow-y: auto; 
        padding-right: 4px; 
        align-items: var(--align-value, flex-start); 
      }
      .list-container::-webkit-scrollbar { width: 4px; }
      .list-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      
      .pill { 
        box-sizing: border-box; 
        display: inline-flex; 
        align-items: center; 
        gap: 8px; 
        flex-shrink: 0; 
        background: var(--pill-bg); 
        border: var(--pill-border-width) solid var(--pill-border-color); 
        border-radius: var(--pill-radius); 
        box-shadow: var(--pill-shadow); 
        padding: 8px 16px; 
        backdrop-filter: blur(12px); 
        -webkit-backdrop-filter: blur(12px); 
        transform: translate3d(0,0,0); 
        transition: background 0.2s; 
      }
      .list-container .pill:not(.popup-pill):not(.full) { width: auto; }
      .pill.full { width: 100%; }
      .pill.full.align-left { justify-content: flex-start; }
      .pill.full.align-center { justify-content: center; }
      .pill.full.align-right { justify-content: flex-end; }
      .pill.full .text { flex: 0 1 auto; }
      .pill.clickable { cursor: pointer; }
      .pill.clickable:active { transform: scale(0.97); }
      
      .pill.popup-pill {
        width: 100%;
        position: relative;
        padding-right: 70px;
        z-index: 2; 
        background: var(--pill-bg); 
      }
      .pill.popup-pill.clickable {
        cursor: pointer;
        padding-right: 90px;
      }
      .pill.popup-pill.clickable:hover {
        background: var(--pill-bg);
        filter: brightness(1.1);
      }
      
      .popup-pill .action-indicator {
        position: absolute;
        right: 36px;
        top: 50%;
        transform: translateY(-50%);
        --mdc-icon-size: 18px;
        color: var(--pill-icon-color);
        opacity: 0.5;
      }
      
      .popup-pill .dismiss-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 24px;
        color: var(--pill-icon-color);
        opacity: 0.5;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: opacity 0.2s, background 0.2s;
      }
      .popup-pill .dismiss-btn:hover {
        opacity: 1;
        background: rgba(255,255,255,0.1);
      }
      .popup-pill .dismiss-btn ha-icon {
        --mdc-icon-size: 16px;
      }
      
      .icon { color: var(--pill-icon-color); --mdc-icon-size: calc(var(--pill-font-size) + 5px); display: flex; flex-shrink: 0; }
      .icon.spinning { animation: spin 2s linear infinite; }
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .text { color: var(--pill-color); font-size: var(--pill-font-size); font-weight: var(--pill-font-weight); font-family: var(--pill-font-family); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; }
      
      .notification-pill-wrapper {
        display: inline-flex;
        align-items: center;
        position: relative;
      }
      .notification-pill-wrapper.full-width {
        width: 100%;
      }
      
      .pill-outside-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--badge-color, #ff4444);
        color: var(--badge-text-color, #ffffff);
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        box-sizing: border-box;
      }
      
      .popup-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      
      .popup-container {
        background: var(--card-background-color, #1c1c1c);
        border-radius: 16px;
        min-width: 320px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      }
      
      .popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .popup-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .popup-count-badge {
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.15);
        color: var(--primary-text-color);
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      
      .popup-close-btn {
        background: transparent;
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s;
        color: var(--primary-text-color);
        opacity: 0.7;
      }
      .popup-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 1;
      }
      .popup-close-btn ha-icon {
        --mdc-icon-size: 20px;
      }
      
      .popup-clear-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        color: var(--primary-text-color);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .popup-clear-btn:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      
      .popup-content {
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }
      
      .popup-footer {
        padding: 12px 16px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .popup-clear-all-btn {
        width: 100%;
        background: rgba(255, 255, 255, 0.08);
        border: none;
        border-radius: 8px;
        padding: 12px 16px;
        color: var(--primary-text-color);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .popup-clear-all-btn:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      
      .popup-pill-wrapper {
        position: relative;
        isolation: isolate; 
      }
      
      .popup-pill-swipe-bg {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 80px;
        background: #c62828;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        border-radius: 0 var(--pill-radius, 12px) var(--pill-radius, 12px) 0;
        z-index: 1; 
        opacity: 0; 
        visibility: hidden; 
        transition: opacity 0.2s, visibility 0.2s;
      }
      .popup-pill-swipe-bg ha-icon {
        --mdc-icon-size: 22px;
      }
      
      .popup-empty {
        text-align: center;
        padding: 32px;
        color: var(--secondary-text-color);
        font-size: 14px;
      }
      
      .popup-count {
        font-weight: 400;
        opacity: 0.7;
        font-size: 14px;
        margin-left: 4px;
      }
      
      .notification-button {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        transition: transform 0.2s, filter 0.2s;
      }
      .notification-button.full-width {
        width: 100%;
        align-items: var(--content-align, center);
      }
      .notification-button.label-left,
      .notification-button.label-right {
        flex-direction: row;
        gap: 8px;
      }
      .notification-button.full-width.label-left {
        justify-content: var(--content-align, center);
        align-items: center;
      }
      .notification-button.full-width.label-right {
        justify-content: var(--content-align, center);
        align-items: center;
      }
      
      .notification-button:hover {
        filter: brightness(1.1);
      }
      .notification-button:active {
        transform: scale(0.95);
      }
      
      .button-icon-container {
        position: relative;
        width: var(--button-size, 48px);
        height: var(--button-size, 48px);
        border-radius: 50%;
        background: var(--button-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
      
      .button-icon {
        --mdc-icon-size: calc(var(--button-size, 48px) * 0.5);
        color: var(--button-icon-color);
      }
      
      .button-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--badge-color, #ff4444);
        color: var(--badge-text-color, #ffffff);
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        box-sizing: border-box;
      }
      
      .button-label {
        font-size: 12px;
        color: var(--primary-text-color);
        font-weight: 500;
        max-width: calc(var(--button-size, 48px) + 40px);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .notification-button.label-left .button-label,
      .notification-button.label-right .button-label {
        max-width: none;
      }
      
      .notification-pill-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--pill-button-bg);
        border-style: var(--pill-button-border-style, solid);
        border-width: var(--pill-button-border-width, 1px);
        border-color: var(--pill-button-border-color);
        border-radius: var(--pill-button-border-radius, 99px);
        cursor: pointer;
        transition: transform 0.2s, filter 0.2s;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .notification-pill-button.full-width {
        width: 100%;
        justify-content: var(--content-align, center);
      }
      .notification-pill-button:hover {
        filter: brightness(1.1);
      }
      .notification-pill-button:active {
        transform: scale(0.97);
      }
      
      .pill-button-icon {
        --mdc-icon-size: calc(var(--pill-button-size, 14px) + 4px);
        color: var(--button-icon-color);
        flex-shrink: 0;
      }
      
      .pill-button-label {
        font-size: var(--pill-button-size, 14px);
        font-weight: 500;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .pill-button-badge {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--badge-color, #ff4444);
        color: var(--badge-text-color, #ffffff);
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        flex-shrink: 0;
      }
      
      .anim-slide { animation: slide-in var(--anim-duration) cubic-bezier(0.2, 0.8, 0.2, 1) forwards; } @keyframes slide-in { 0% { opacity: 0; transform: translate(var(--enter-x), var(--enter-y)); } 100% { opacity: 1; transform: translate(0, 0); } }
      .anim-fade { animation: fade-in var(--anim-duration) ease-out forwards; } @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
      .anim-scale { animation: scale-in var(--anim-duration) cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } @keyframes scale-in { 0% { opacity: 0; transform: scale(0.8) translate(var(--enter-x), var(--enter-y)); } 100% { opacity: 1; transform: scale(1) translate(0,0); } }
      .anim-flip { animation: flip-in var(--anim-duration) cubic-bezier(0.2, 0.8, 0.2, 1) forwards; transform-origin: center; } @keyframes flip-in { 0% { opacity: 0; transform: perspective(400px) rotateX(90deg); } 100% { opacity: 1; transform: perspective(400px) rotateX(0deg); } }
      .anim-glitch { animation: glitch var(--anim-duration) steps(2, end) forwards; } @keyframes glitch { 0% { opacity: 0; transform: skew(20deg); } 20% { opacity: 1; transform: skew(-20deg); } 40% { transform: skew(0deg); } }
      .anim-wobble { animation: wobble var(--anim-duration) ease-in-out forwards; } @keyframes wobble { 0% { opacity: 0; transform: translateX(var(--enter-x)); } 40% { transform: rotate(-5deg); } 60% { transform: rotate(3deg); } 100% { opacity: 1; transform: rotate(0); } }
      .anim-bounce { animation: bounce-in var(--anim-duration) cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } @keyframes bounce-in { 0% { opacity: 0; transform: translate(var(--enter-x), var(--enter-y)); } 60% { transform: translate(calc(var(--enter-x) * -0.1), calc(var(--enter-y) * -0.1)); } 100% { opacity: 1; transform: translate(0, 0); } }
      .anim-rotate { animation: rotate-in var(--anim-duration) ease-out forwards; transform-origin: center; } @keyframes rotate-in { 0% { opacity: 0; transform: rotate(90deg) scale(0.8); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
      .anim-zoom { animation: zoom-in var(--anim-duration) cubic-bezier(0.34, 1.56, 0.64, 1) forwards; } @keyframes zoom-in { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
      .anim-blur { animation: blur-in var(--anim-duration) ease-out forwards; } @keyframes blur-in { 0% { opacity: 0; filter: blur(10px); } 100% { opacity: 1; filter: blur(0); } }
      .anim-elastic { animation: elastic-in var(--anim-duration) cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; } @keyframes elastic-in { 0% { opacity: 0; transform: scale(0.5) translate(var(--enter-x), var(--enter-y)); } 100% { opacity: 1; transform: scale(1) translate(0,0); } }
      .anim-swing { animation: swing-in var(--anim-duration) cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; transform-origin: top center; } @keyframes swing-in { 0% { opacity: 0; transform: rotateX(-100deg); } 100% { opacity: 1; transform: rotateX(0deg); } }
      
      /* Confirmation Popup Styles */
      .confirmation-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        animation: fade-in 0.2s ease-out;
      }
      
      .confirmation-container {
        background: var(--card-background-color, #1c1c1c);
        border-radius: 16px;
        padding: 24px;
        min-width: 280px;
        max-width: 90vw;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        animation: scale-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      
      .confirmation-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .confirmation-icon ha-icon {
        --mdc-icon-size: 28px;
        color: var(--primary-color, #03a9f4);
      }
      
      .confirmation-message {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
        text-align: center;
        max-width: 250px;
        word-wrap: break-word;
      }
      
      .confirmation-action-desc {
        font-size: 13px;
        color: var(--secondary-text-color);
        text-align: center;
        opacity: 0.8;
      }
      
      .confirmation-buttons {
        display: flex;
        gap: 12px;
        margin-top: 8px;
        width: 100%;
      }
      
      .confirmation-btn {
        flex: 1;
        padding: 12px 20px;
        border-radius: 12px;
        border: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .confirmation-btn.cancel {
        background: rgba(255, 255, 255, 0.1);
        color: var(--primary-text-color);
      }
      .confirmation-btn.cancel:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      .confirmation-btn.cancel:active {
        transform: scale(0.97);
      }
      
      .confirmation-btn.confirm {
        background: var(--primary-color, #03a9f4);
        color: var(--text-primary-color, #fff);
      }
      .confirmation-btn.confirm:hover {
        filter: brightness(1.1);
      }
      .confirmation-btn.confirm:active {
        transform: scale(0.97);
      }
    `;
  }
}

// --- EDITOR CLASS ---
class HkiNotificationCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: { state: true } }; }
  setConfig(config) { this._config = config; }
  
  render() {
    if (!this.hass || !this._config) return html``;
    const mode = this._config.display_mode || "ticker";
    const fontFamily = this._config.font_family || FONTS[0];
    const showCustomFont = fontFamily === "Custom";

    return html`
      <div class="card-config">
        ${this._renderEntityPicker("Notification Sensor", "entity", this._config.entity, "", ["sensor"])}

        <h3>Behavior</h3>

        <ha-select label="Display Mode" .value=${mode} @selected=${(e) => this._modeChanged(e)} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
           <mwc-list-item value="ticker">Ticker (Cycle One by One)</mwc-list-item>
           <mwc-list-item value="marquee">Marquee (Scrollable List)</mwc-list-item>
           <mwc-list-item value="list">List (Vertical Stack)</mwc-list-item>
           <mwc-list-item value="button">Button (Icon Only)</mwc-list-item>
        </ha-select>
        
        ${mode !== 'button' ? html`
        <div class="side-by-side">
             ${this._renderSwitch("Show When Empty", "show_empty", this._config.show_empty)}
             ${this._config.show_empty ? this._renderInput("Empty Message", "empty_message", this._config.empty_message) : ''}
        </div>
        ` : ''}
        
        ${mode === 'marquee' ? html`
            <ha-alert alert-type="warning">
              When placing this card in the header badges section, set "Badges behaviour" to "Scroll" for auto-scroll to work.
            </ha-alert>
            <div class="side-by-side">
                ${this._renderInput("Scroll Speed", "marquee_speed", this._config.marquee_speed, "number", "0.1")}
                ${this._renderInput("Gap (px)", "marquee_gap", this._config.marquee_gap, "number")}
            </div>
            ${this._renderSwitch("Auto Scroll", "auto_scroll", this._config.auto_scroll)}
        ` : mode === 'list' ? html`
            ${this._renderInput("Max Items Visible", "list_max_items", this._config.list_max_items, "number")}
        ` : mode === 'button' ? html`
            <h3>Button Style</h3>
            <ha-select label="Alignment" .value=${this._config.alignment || "left"} @selected=${(e) => this._valueChanged(e, "alignment")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
              ${["left","center","right"].map(a => html`<mwc-list-item .value=${a}>${a.charAt(0).toUpperCase() + a.slice(1)}</mwc-list-item>`)}
            </ha-select>
            ${this._renderSwitch("Full Width", "full_width", this._config.full_width)}
            
            ${this._renderIconPicker("Button Icon", "button_icon", this._config.button_icon || "mdi:bell")}
            ${this._renderInput("Button Label (optional)", "button_label", this._config.button_label || "")}
            
            ${this._config.button_label ? html`
              <ha-select label="Label Position" .value=${this._config.button_label_position || "below"} @selected=${(e) => this._valueChanged(e, "button_label_position")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
                <mwc-list-item value="below">Below Icon</mwc-list-item>
                <mwc-list-item value="left">Left of Icon</mwc-list-item>
                <mwc-list-item value="right">Right of Icon</mwc-list-item>
                <mwc-list-item value="inside">Inside (Pill Style)</mwc-list-item>
              </ha-select>
            ` : ''}
            
            ${(this._config.button_label_position !== 'inside' || !this._config.button_label) ? html`
              <h4>Icon Button</h4>
              ${this._renderInput("Button Size (px)", "button_size", this._config.button_size || 48, "number")}
              <div class="side-by-side">
                ${this._renderColorPicker("Icon Color", "button_icon_color", this._config.button_icon_color)}
                ${this._renderColorPicker("Background", "button_bg_color", this._config.button_bg_color)}
              </div>
            ` : html`
              <h4>Pill Button</h4>
              ${this._renderInput("Font Size (px)", "button_pill_size", this._config.button_pill_size || 14, "number")}
              <div class="side-by-side">
                ${this._renderColorPicker("Icon Color", "button_icon_color", this._config.button_icon_color)}
                ${this._renderColorPicker("Background", "button_pill_bg_color", this._config.button_pill_bg_color)}
              </div>
              <div class="side-by-side">
                ${this._renderColorPicker("Border Color", "button_pill_border_color", this._config.button_pill_border_color)}
                ${this._renderInput("Border Radius", "button_pill_border_radius", this._config.button_pill_border_radius ?? 99, "number")}
              </div>
              <div class="side-by-side">
                <ha-select label="Border Style" .value=${this._config.button_pill_border_style || "solid"} @selected=${(e) => this._valueChanged(e, "button_pill_border_style")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
                  <mwc-list-item value="solid">Solid</mwc-list-item>
                  <mwc-list-item value="dashed">Dashed</mwc-list-item>
                  <mwc-list-item value="dotted">Dotted</mwc-list-item>
                  <mwc-list-item value="none">None</mwc-list-item>
                </ha-select>
                ${this._renderInput("Border Width", "button_pill_border_width", this._config.button_pill_border_width ?? 1, "number")}
              </div>
            `}
            
            <h4>Badge</h4>
            ${this._renderSwitch("Show Badge", "button_show_badge", this._config.button_show_badge !== false)}
            ${this._config.button_show_badge !== false ? html`
              ${(this._config.button_label_position === 'inside' && this._config.button_label) ? html`
                <ha-select label="Badge Position" .value=${this._config.button_pill_badge_position || "inside"} @selected=${(e) => this._valueChanged(e, "button_pill_badge_position")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
                  <mwc-list-item value="inside">Inside Pill</mwc-list-item>
                  <mwc-list-item value="outside">Outside Pill (Corner)</mwc-list-item>
                </ha-select>
              ` : ''}
              <div class="side-by-side">
                ${this._renderColorPicker("Badge Color", "button_badge_color", this._config.button_badge_color || "#ff4444")}
                ${this._renderColorPicker("Badge Text", "button_badge_text_color", this._config.button_badge_text_color || "#ffffff")}
              </div>
            ` : ''}
        ` : html`
            <div class="side-by-side">
                ${this._renderInput("Interval (sec)", "interval", this._config.interval, "number", "0.1")}
                ${this._renderInput("Anim Speed (sec)", "animation_duration", this._config.animation_duration, "number", "0.1")}
            </div>
            ${this._renderSwitch("Auto Cycle Messages", "auto_cycle", this._config.auto_cycle)}
            <div class="side-by-side">
                <ha-select label="Animation" .value=${this._config.animation || "slide"} @selected=${(e) => this._valueChanged(e, "animation")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
                  ${["slide","scale","fade","flip","glitch","wobble","bounce","rotate","zoom","blur","elastic","swing"].map(a => html`<mwc-list-item .value=${a}>${a.charAt(0).toUpperCase() + a.slice(1)}</mwc-list-item>`)}
                </ha-select>
                <ha-select label="Direction" .value=${this._config.direction || "right"} @selected=${(e) => this._valueChanged(e, "direction")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
                  ${["left","right","top","bottom"].map(d => html`<mwc-list-item .value=${d}>From ${d.charAt(0).toUpperCase() + d.slice(1)}</mwc-list-item>`)}
                </ha-select>
            </div>
        `}

        <h3>Popup</h3>
        ${mode === 'button' ? html`
          ${this._renderInput("Popup Title", "popup_title", this._config.popup_title || "Notifications")}
          ${this._renderSwitch("Confirm Tap Actions", "confirm_tap_action", this._config.confirm_tap_action)}
          <p class="helper-text">Button mode always opens the popup when clicked. When "Confirm Tap Actions" is enabled, a confirmation dialog appears before executing any tap action.</p>
        ` : html`
        <div class="side-by-side">
          ${this._renderSwitch("Enable Popup", "popup_enabled", this._config.popup_enabled !== false)}
          ${this._renderInput("Popup Title", "popup_title", this._config.popup_title || "Notifications")}
        </div>
        ${this._config.popup_enabled !== false ? html`
          ${this._renderSwitch("Tap Actions in Popup Only", "tap_action_popup_only", this._config.tap_action_popup_only)}
          ${!this._config.tap_action_popup_only ? html`
            ${this._renderSwitch("Confirm Tap Actions", "confirm_tap_action", this._config.confirm_tap_action)}
            <p class="helper-text">When enabled, a confirmation dialog appears before executing any tap action on notifications.</p>
          ` : html`
            <p class="helper-text">When enabled, tapping always opens the popup first. Custom tap_actions from service calls will only work inside the popup.</p>
          `}
        ` : html`
          <p class="helper-text">When enabled, tapping a notification opens a popup with all notifications and a clear button.</p>
        `}
        `}
        
        <ha-alert alert-type="info">
          These settings are defaults for the card. When creating notifications via the <code>hki_notify.create</code> service, you can override colors, fonts, and other styling per notification.
        </ha-alert>
        
        ${mode !== 'button' ? html`
        <h3>Appearance</h3>
        <div class="side-by-side ${mode === 'marquee' ? '' : 'three-col'}">
           ${this._renderSwitch("Show Icon", "show_icon", this._config.show_icon)}
           ${this._renderSwitch("Icon After Text", "icon_after", this._config.icon_after)}
           ${mode !== 'marquee' ? this._renderSwitch("Full Width", "full_width", this._config.full_width) : ''}
        </div>

        <ha-select label="Alignment" .value=${this._config.alignment || "left"} @selected=${(e) => this._valueChanged(e, "alignment")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
          ${["left","center","right"].map(a => html`<mwc-list-item .value=${a}>${a.charAt(0).toUpperCase() + a.slice(1)}</mwc-list-item>`)}
        </ha-select>

        <div class="side-by-side">
          ${this._renderColorPicker("Text Color", "text_color", this._config.text_color)}
          ${this._renderColorPicker("Icon Color", "icon_color", this._config.icon_color)}
        </div>
        <div class="side-by-side">
          ${this._renderColorPicker("Background", "bg_color", this._config.bg_color)}
          ${this._renderColorPicker("Border Color", "border_color", this._config.border_color)}
        </div>
        ${this._renderInput("Box Shadow", "box_shadow", this._config.box_shadow)}
        <div class="side-by-side">
          ${this._renderInput("Border Radius", "border_radius", this._config.border_radius, "number")}
          ${this._renderInput("Border Width", "border_width", this._config.border_width, "number")}
        </div>

        <h3>Typography</h3>
        <div class="side-by-side">
            ${this._renderInput("Size (px)", "font_size", this._config.font_size, "number")}
            <ha-select label="Weight" .value=${this._config.font_weight || "Semi Bold"} @selected=${(e) => this._valueChanged(e, "font_weight")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
              ${["Light","Regular","Medium","Semi Bold","Bold","Extra Bold"].map(w => html`<mwc-list-item .value=${w}>${w}</mwc-list-item>`)}
            </ha-select>
        </div>
        <ha-select label="Font Family" .value=${fontFamily} @selected=${(e) => this._valueChanged(e, "font_family")} @closed=${(e) => e.stopPropagation()} fixedMenuPosition>
          ${FONTS.map(f => html`<mwc-list-item .value=${f}>${f === "Custom" ? "Custom..." : f.split(',')[0]}</mwc-list-item>`)}
        </ha-select>
        ${showCustomFont ? html`
          ${this._renderInput("Custom Font Family", "custom_font_family", this._config.custom_font_family || "", "text")}
          <p class="helper-text">Enter a CSS font-family value (e.g., "Comic Sans MS, cursive")</p>
        ` : ''}
        ` : ''}
      </div>
    `;
  }

  _modeChanged(ev) {
    const mode = ev.target.value;
    const newConfig = { ...this._config, display_mode: mode };
    if (mode === 'marquee') newConfig.full_width = false;
    this._fireChanged(newConfig);
  }

  _renderEntityPicker(label, field, value, helper = "", includeDomains = null) {
      return html`<ha-selector .hass=${this.hass} .selector=${{ entity: { ...(includeDomains && { domain: includeDomains }) } }} .value=${value || ""} .label=${label} .helper=${helper} @value-changed=${(ev) => this._fireChanged({ ...this._config, [field]: ev.detail.value })}></ha-selector>`;
  }

  _renderInput(label, field, value, type = "text", step = null) {
      return html`<ha-textfield .label=${label} .value=${value ?? ""} .type=${type} .step=${step || ""} @input=${(ev) => this._valueChanged(ev, field)}></ha-textfield>`;
  }

  _renderIconPicker(label, field, value) {
      return html`
        <ha-selector
          .hass=${this.hass}
          .selector=${{ icon: {} }}
          .value=${value || "mdi:bell"}
          .label=${label}
          @value-changed=${(ev) => this._fireChanged({ ...this._config, [field]: ev.detail.value })}
        ></ha-selector>
      `;
  }

  _renderSwitch(label, field, checked) {
      return html`<ha-formfield .label=${label}><ha-switch .checked=${checked !== false} @change=${(ev) => this._fireChanged({ ...this._config, [field]: ev.target.checked })}></ha-switch></ha-formfield>`;
  }

  _renderColorPicker(label, field, value) {
      return html`
        <div class="color-field">
          <label>${label}</label>
          <ha-selector
            .hass=${this.hass}
            .selector=${{ color_rgb: {} }}
            .value=${this._parseColor(value)}
            @value-changed=${(ev) => this._handleColorChange(ev, field)}
          ></ha-selector>
        </div>
      `;
  }

  _parseColor(value) {
    if (!value) return [128, 128, 128];
    
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      } else if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    
    const rgbMatch = value.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
    }
    
    return [128, 128, 128];
  }

  _handleColorChange(ev, field) {
    const rgb = ev.detail.value;
    if (rgb && Array.isArray(rgb)) {
      const hexColor = '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
      this._fireChanged({ ...this._config, [field]: hexColor });
    }
  }

  _valueChanged(ev, field) { this._fireChanged({ ...this._config, [field]: ev.target.value }); }

  _fireChanged(newConfig) {
    this._config = newConfig;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig }, bubbles: true, composed: true }));
  }

  static get styles() {
      return css`
          .card-config { display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px; }
          .side-by-side { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .three-col { grid-template-columns: 1fr 1fr 1fr; }
          ha-textfield, ha-select, ha-selector { width: 100%; display: block; }
          ha-formfield { display: flex; align-items: center; height: 56px; }
          .helper-text { margin: -8px 0 8px 0; font-size: 12px; color: var(--secondary-text-color); }
          .color-field { display: flex; flex-direction: column; gap: 4px; }
          .color-field label { font-size: 12px; color: var(--secondary-text-color); margin-left: 4px; }
          code { background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
      `;
  }
}

customElements.define(CARD_TYPE, HkiNotificationCard);
customElements.define(EDITOR_TAG, HkiNotificationCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: CARD_TYPE, name: "HKI Notification Card", description: "Animated notification ticker.", preview: true });
