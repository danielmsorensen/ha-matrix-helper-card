// Lit directive that wires an element up to Home Assistant's standard tap/
// hold/double-tap gesture detection, dispatching a native "action" custom
// event with detail: { action: "tap" | "hold" | "double_tap" }.
//
// custom-card-helpers publishes the handleAction/hasAction functions and
// the ActionHandlerOptions/ActionHandlerEvent types, but not this directive
// itself -- confirmed directly against the package's actual exports, which
// do not include it. Vendoring a local copy is the standard way essentially
// every real custom card handles this (there is no supported alternative).
//
// This version is a faithful adaptation of Home Assistant's own current,
// real implementation
// (src/panels/lovelace/common/directives/action-handler-directive.ts, the
// exact file hui-tile-card.ts's own action handling uses) rather than the
// older community reference (custom-cards/boilerplate-card) this file was
// originally adapted from -- that older reference turned out to diverge in
// a way that broke plain single-tap specifically once hasDoubleClick was
// enabled (hold and double-tap both worked; only the delayed single-tap
// path was affected). Trimmed here: the container/gesture-resolver
// mechanism (options.resolve/keyboardOnly), which only matters for binding
// one handler across multiple dynamically-resolved targets -- this card
// only ever binds a single fixed element -- and hasTap/disabled, which
// aren't in the installed custom-card-helpers package's simpler
// ActionHandlerOptions type ({hasHold?, hasDoubleClick?} only).
import { ActionHandlerOptions, fireEvent } from "custom-card-helpers";
import { directive, Directive, ElementPart, PartInfo } from "lit/directive.js";

const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

interface ActionHandlerElement extends HTMLElement {
  actionHandler?: {
    options: ActionHandlerOptions;
    start?: (ev: Event) => void;
    end?: (ev: Event) => void;
    handleKeyDown?: (ev: KeyboardEvent) => void;
  };
}

// deepEqual isn't exported by the installed custom-card-helpers package
// (confirmed against its actual exports) -- the installed
// ActionHandlerOptions type only has these two boolean fields, so a plain
// comparison is equivalent to a generic deep-equal here.
function optionsEqual(a?: ActionHandlerOptions, b?: ActionHandlerOptions): boolean {
  return !!a?.hasHold === !!b?.hasHold && !!a?.hasDoubleClick === !!b?.hasDoubleClick;
}

const DOUBLE_CLICK_TIME = 250;

class ActionHandler extends HTMLElement {
  public holdTime = 500;

  protected timer?: number;

  protected held = false;

  private cancelled = false;

  private dblClickTimeout?: number;

  // The double-tap window only pairs two taps on the same target; a quick
  // tap on a different target starts its own window instead of completing
  // one (relevant once more than one matrix-helper-card shares this single
  // page-wide handler instance).
  private dblClickTarget?: HTMLElement;

  public connectedCallback(): void {
    Object.assign(this.style, {
      position: "fixed",
      width: isTouch ? "100px" : "50px",
      height: isTouch ? "100px" : "50px",
      transform: "translate(-50%, -50%) scale(0)",
      pointerEvents: "none",
      zIndex: "999",
      background: "rgba(var(--rgb-primary-color), 0.3)",
      borderRadius: "50%",
      transition: "transform 180ms ease-in-out",
    });

    ["touchcancel", "mouseout", "mouseup", "touchmove", "mousewheel", "wheel", "scroll"].forEach(
      (ev) => {
        document.addEventListener(
          ev,
          () => {
            this.cancelled = true;
            if (this.timer) {
              this._stopAnimation();
              clearTimeout(this.timer);
              this.timer = undefined;
            }
          },
          { passive: true }
        );
      }
    );
  }

  public bind(element: ActionHandlerElement, options: ActionHandlerOptions = {}): void {
    if (element.actionHandler && optionsEqual(options, element.actionHandler.options)) {
      return;
    }

    if (element.actionHandler) {
      element.removeEventListener("touchstart", element.actionHandler.start!);
      element.removeEventListener("touchend", element.actionHandler.end!);
      element.removeEventListener("touchcancel", element.actionHandler.end!);
      element.removeEventListener("mousedown", element.actionHandler.start!);
      element.removeEventListener("click", element.actionHandler.end!);
      element.removeEventListener("keydown", element.actionHandler.handleKeyDown!);
    } else {
      element.addEventListener("contextmenu", (ev: Event) => {
        ev.preventDefault();
      });
    }

    element.actionHandler = { options };

    element.actionHandler.start = (ev: Event) => {
      this.cancelled = false;
      let x: number;
      let y: number;
      if ((ev as TouchEvent).touches) {
        x = (ev as TouchEvent).touches[0].clientX;
        y = (ev as TouchEvent).touches[0].clientY;
      } else {
        x = (ev as MouseEvent).clientX;
        y = (ev as MouseEvent).clientY;
      }

      if (options.hasHold) {
        this.held = false;
        this.timer = window.setTimeout(() => {
          this._startAnimation(x, y);
          this.held = true;
          fireEvent(element, "action", { action: "hold" });
        }, this.holdTime);
      }
    };

    element.actionHandler.end = (ev: Event) => {
      if (ev.type === "touchcancel" || (ev.type === "touchend" && this.cancelled)) {
        return;
      }

      const target = ev.target as HTMLElement;

      if (ev.cancelable) {
        ev.preventDefault();
      }
      if (options.hasHold) {
        clearTimeout(this.timer);
        this._stopAnimation();
        this.timer = undefined;
      }
      if (options.hasHold && this.held) {
        fireEvent(target, "action", { action: "hold" });
      } else if (options.hasDoubleClick) {
        if (
          (ev.type === "click" && (ev as MouseEvent).detail < 2) ||
          !this.dblClickTimeout ||
          this.dblClickTarget !== target
        ) {
          const timeoutId = window.setTimeout(() => {
            if (this.dblClickTimeout === timeoutId) {
              this.dblClickTimeout = undefined;
              this.dblClickTarget = undefined;
            }
            fireEvent(target, "action", { action: "tap" });
          }, DOUBLE_CLICK_TIME);
          this.dblClickTimeout = timeoutId;
          this.dblClickTarget = target;
        } else {
          clearTimeout(this.dblClickTimeout);
          this.dblClickTimeout = undefined;
          this.dblClickTarget = undefined;
          fireEvent(target, "action", { action: "double_tap" });
        }
      } else {
        fireEvent(target, "action", { action: "tap" });
      }
    };

    element.actionHandler.handleKeyDown = (ev: KeyboardEvent) => {
      if (!["Enter", " "].includes(ev.key)) {
        return;
      }
      (ev.currentTarget as ActionHandlerElement).actionHandler!.end!(ev);
    };

    element.addEventListener("touchstart", element.actionHandler.start, { passive: true });
    element.addEventListener("touchend", element.actionHandler.end);
    element.addEventListener("touchcancel", element.actionHandler.end);
    element.addEventListener("mousedown", element.actionHandler.start, { passive: true });
    element.addEventListener("click", element.actionHandler.end);
    element.addEventListener("keydown", element.actionHandler.handleKeyDown);
  }

  private _startAnimation(x: number, y: number): void {
    Object.assign(this.style, {
      left: `${x}px`,
      top: `${y}px`,
      transform: "translate(-50%, -50%) scale(1)",
    });
  }

  private _stopAnimation(): void {
    Object.assign(this.style, {
      left: "",
      top: "",
      transform: "translate(-50%, -50%) scale(0)",
    });
  }
}

customElements.define("matrix-helper-card-action-handler", ActionHandler);

const getActionHandler = (): ActionHandler => {
  const body = document.body;
  const existing = body.querySelector("matrix-helper-card-action-handler");
  if (existing) {
    return existing as ActionHandler;
  }

  const actionHandlerElement = document.createElement(
    "matrix-helper-card-action-handler"
  ) as ActionHandler;
  body.appendChild(actionHandlerElement);
  return actionHandlerElement;
};

export const actionHandlerBind = (
  element: ActionHandlerElement,
  options?: ActionHandlerOptions
): void => {
  getActionHandler().bind(element, options);
};

class ActionHandlerDirective extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
  }

  render(_options?: ActionHandlerOptions) {
    return undefined;
  }

  update(part: ElementPart, [options]: [ActionHandlerOptions?]) {
    actionHandlerBind(part.element as ActionHandlerElement, options);
    return this.render();
  }
}

export const actionHandler = directive(ActionHandlerDirective);
