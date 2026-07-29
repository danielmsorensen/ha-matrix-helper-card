// Lit directive that wires an element up to Home Assistant's standard tap/
// hold/double-tap gesture detection, dispatching a native "action" custom
// event with detail: { action: "tap" | "hold" | "double_tap" }.
//
// custom-card-helpers publishes the handleAction/hasAction functions and
// the ActionHandlerOptions/ActionHandlerEvent types, but not this directive
// itself -- confirmed directly against the package's actual exports, which
// do not include it. Vendoring a local copy is the standard way essentially
// every real custom card handles this (there is no supported alternative --
// see the design spec for the full explanation). This version is adapted
// from the reference implementation at
// https://github.com/custom-cards/boilerplate-card/blob/master/src/action-handler-directive.ts,
// trimmed to the subset the installed custom-card-helpers package's
// ActionHandlerOptions type actually supports (hasHold/hasDoubleClick only --
// no repeat/isMomentary/disabled/disableKbd, which existed in some newer
// reference copies but aren't in this package's published types and aren't
// needed by this card).
import { ActionHandlerOptions, fireEvent } from "custom-card-helpers";
import { directive, Directive, ElementPart, PartInfo } from "lit/directive.js";

const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

interface ActionHandler extends HTMLElement {
  holdTime: number;
  cancelled: boolean;
  held: boolean;
  timer?: number;
  dblClickTimeout?: number;
  bind(element: ActionHandlerElement, options?: ActionHandlerOptions): void;
  startAnimation(x: number, y: number): void;
  stopAnimation(): void;
}

interface ActionHandlerElement extends HTMLElement {
  actionHandler?: {
    options: ActionHandlerOptions;
    start?: (ev: Event) => void;
    end?: (ev: Event) => void;
    handleTouchMove?: (ev: TouchEvent) => void;
    handleKeyDown?: (ev: KeyboardEvent) => void;
  };
}

function optionsEqual(a?: ActionHandlerOptions, b?: ActionHandlerOptions): boolean {
  return !!a?.hasHold === !!b?.hasHold && !!a?.hasDoubleClick === !!b?.hasDoubleClick;
}

const setupActionHandlerMethods = (element: HTMLElement): ActionHandler => {
  const actionHandler = element as ActionHandler;

  actionHandler.startAnimation = (x, y) => {
    Object.assign(actionHandler.style, {
      left: `${x}px`,
      top: `${y}px`,
      transform: "translate(-50%, -50%) scale(1)",
    });
  };

  actionHandler.stopAnimation = () => {
    Object.assign(actionHandler.style, {
      left: "",
      top: "",
      transform: "translate(-50%, -50%) scale(0)",
    });
  };

  actionHandler.bind = (target, options = {}) => {
    if (target.actionHandler && optionsEqual(options, target.actionHandler.options)) {
      return;
    }

    if (target.actionHandler) {
      target.removeEventListener("touchstart", target.actionHandler.start!);
      target.removeEventListener("touchend", target.actionHandler.end!);
      target.removeEventListener("touchcancel", target.actionHandler.end!);
      target.removeEventListener("mousedown", target.actionHandler.start!);
      target.removeEventListener("click", target.actionHandler.end!);
      target.removeEventListener("keydown", target.actionHandler.handleKeyDown!);
      if (target.actionHandler.handleTouchMove) {
        target.removeEventListener("touchmove", target.actionHandler.handleTouchMove);
      }
    } else {
      target.addEventListener("contextmenu", (ev) => ev.preventDefault());
    }

    target.actionHandler = { options };

    target.actionHandler.start = (ev) => {
      actionHandler.cancelled = false;
      actionHandler.held = false;
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
        actionHandler.timer = window.setTimeout(() => {
          actionHandler.startAnimation(x, y);
          actionHandler.held = true;
          fireEvent(target, "action", { action: "hold" });
        }, actionHandler.holdTime);
      }
    };

    target.actionHandler.end = (ev) => {
      if (["touchend", "touchcancel"].includes(ev.type) && actionHandler.cancelled) {
        return;
      }
      if (ev.type === "touchcancel") {
        return;
      }
      if (["touchend", "touchcancel", "mouseup"].includes(ev.type)) {
        actionHandler.stopAnimation();
      }

      if (actionHandler.timer) {
        clearTimeout(actionHandler.timer);
        actionHandler.timer = undefined;
      }

      if (actionHandler.held) {
        return;
      }

      if (options.hasDoubleClick) {
        if (
          (ev.type === "click" && (ev as MouseEvent).detail < 2) ||
          !actionHandler.dblClickTimeout
        ) {
          actionHandler.dblClickTimeout = window.setTimeout(() => {
            actionHandler.dblClickTimeout = undefined;
            fireEvent(target, "action", { action: "tap" });
          }, 250);
        } else {
          clearTimeout(actionHandler.dblClickTimeout);
          actionHandler.dblClickTimeout = undefined;
          fireEvent(target, "action", { action: "double_tap" });
        }
      } else {
        fireEvent(target, "action", { action: "tap" });
      }
    };

    target.actionHandler.handleKeyDown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        target.click();
      }
    };

    const handleTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0];
      const rect = target.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) {
        actionHandler.cancelled = true;
      }
    };
    target.actionHandler.handleTouchMove = handleTouchMove;

    target.addEventListener("touchstart", target.actionHandler.start, { passive: true });
    target.addEventListener("touchmove", handleTouchMove, { passive: true });
    target.addEventListener("touchend", target.actionHandler.end);
    target.addEventListener("touchcancel", target.actionHandler.end);
    target.addEventListener("mousedown", target.actionHandler.start, { passive: true });
    target.addEventListener("click", target.actionHandler.end);
    target.addEventListener("keydown", target.actionHandler.handleKeyDown);
  };

  ["touchcancel", "mouseout", "mouseup", "touchmove", "wheel", "scroll"].forEach((ev) => {
    document.addEventListener(
      ev,
      () => {
        actionHandler.cancelled = true;
        if (actionHandler.timer) {
          actionHandler.stopAnimation();
          clearTimeout(actionHandler.timer);
          actionHandler.timer = undefined;
        }
      },
      { passive: true }
    );
  });

  return actionHandler;
};

const getActionHandler = (): ActionHandler => {
  const body = document.body;
  const existing = body.querySelector(".action-handler-matrix-helper-card");
  if (existing) {
    return existing as ActionHandler;
  }

  const div = document.createElement("div");
  div.className = "action-handler-matrix-helper-card";
  Object.assign(div.style, {
    position: "absolute",
    width: isTouch ? "100px" : "50px",
    height: isTouch ? "100px" : "50px",
    transform: "translate(-50%, -50%) scale(0)",
    pointerEvents: "none",
    zIndex: "999",
    transition: "transform 0.1s ease-out",
    borderRadius: "50%",
    background: "rgba(var(--rgb-primary-color), 0.3)",
  });

  const typedDiv = div as unknown as ActionHandler;
  typedDiv.holdTime = 500;
  typedDiv.cancelled = false;
  typedDiv.held = false;

  body.appendChild(div);

  return setupActionHandlerMethods(div);
};

export const actionHandlerBind = (
  element: ActionHandlerElement,
  options?: ActionHandlerOptions
): void => {
  getActionHandler().bind(element, options);
};

class ActionHandlerDirective extends Directive {
  private previousOptions?: ActionHandlerOptions;

  constructor(partInfo: PartInfo) {
    super(partInfo);
  }

  render() {
    return undefined;
  }

  update(part: ElementPart, [options]: [ActionHandlerOptions?]) {
    if (!optionsEqual(options, this.previousOptions)) {
      actionHandlerBind(part.element as ActionHandlerElement, options);
      this.previousOptions = options ? { ...options } : undefined;
    }
    return this.render(options);
  }
}

export const actionHandler = directive(ActionHandlerDirective);
