"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

const LISTENER_ID = "spam-trash-cleaner-toolbar-buttons";
const CONTAINER_ID = "spam-trash-cleaner-btn-container";

const BUTTONS = [
  {
    id: "spam-trash-cleaner-btn-trash",
    listenerKey: "trash",
    labelEN: "Empty Trash",
    labelIT: "Svuota Cestino",
    tooltipEN: "Delete all messages from Trash",
    tooltipIT: "Elimina tutti i messaggi dal Cestino",
    iconPath: "icons/btn-trash.svg",
  },
  {
    id: "spam-trash-cleaner-btn-junk",
    listenerKey: "junk",
    labelEN: "Empty Spam",
    labelIT: "Svuota Spam",
    tooltipEN: "Delete all messages from Spam",
    tooltipIT: "Elimina tutti i messaggi dallo Spam",
    iconPath: "icons/btn-spam.svg",
  },
  {
    id: "spam-trash-cleaner-btn-both",
    listenerKey: "both",
    labelEN: "Empty Trash & Spam",
    labelIT: "Svuota Cestino e Spam",
    tooltipEN: "Delete all messages from Trash and Spam",
    tooltipIT: "Elimina tutti i messaggi da Cestino e Spam",
    iconPath: "icons/btn-both.svg",
  },
];

var toolbarButtons = class extends ExtensionCommon.ExtensionAPI {
  constructor(extension) {
    super(extension);
    this._listeners = {
      trash: new Set(),
      junk: new Set(),
      both: new Set(),
    };
    this._registered = false;
  }

  _getLocale() {
    try {
      const locale = Services.locale.appLocaleAsBCP47;
      if (locale && locale.startsWith("it")) {
        return "it";
      }
    } catch (_) {}
    return "en";
  }

  _resolveToolbar(document) {
    const toolbarIds = [
      "mail-bar3",
      "tabs-toolbar",
      "toolbar-menubar",
    ];

    for (const tbId of toolbarIds) {
      const tb = document.getElementById(tbId);
      if (tb) {
        return tb;
      }
    }

    return document.querySelector("toolbar:not([hidden])");
  }

  _injectButtons(window, extension, locale) {
    const document = window.document;

    if (document.getElementById(CONTAINER_ID)) {
      return;
    }

    const toolbar = this._resolveToolbar(document);
    if (!toolbar) {
      console.warn("Spam & Trash Cleaner [experiment]: no toolbar found in window");
      return;
    }

    const container = document.createXULElement("hbox");
    container.id = CONTAINER_ID;
    container.setAttribute("align", "center");
    container.style.cssText = "margin-left: 4px; margin-right: 4px; gap: 2px;";

    for (const btnDef of BUTTONS) {
      const btn = document.createXULElement("toolbarbutton");
      btn.id = btnDef.id;
      btn.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
      btn.setAttribute("label", locale === "it" ? btnDef.labelIT : btnDef.labelEN);
      btn.setAttribute("tooltiptext", locale === "it" ? btnDef.tooltipIT : btnDef.tooltipEN);
      btn.setAttribute("image", extension.rootURI.resolve(btnDef.iconPath));
      btn.style.cssText = "-moz-appearance: none; appearance: none; min-width: 28px; min-height: 28px; padding: 4px 6px; border-radius: 4px; cursor: pointer;";

      // Debounce protects against duplicate command/click firing in some toolbar states.
      let lastFired = 0;
      const fireListeners = () => {
        const now = Date.now();
        if (now - lastFired < 500) {
          return;
        }
        lastFired = now;
        for (const listener of this._listeners[btnDef.listenerKey]) {
          listener();
        }
      };

      btn.addEventListener("command", fireListeners);
      btn.addEventListener("click", fireListeners);
      container.appendChild(btn);
    }

    toolbar.appendChild(container);
    console.log("Spam & Trash Cleaner [experiment]: toolbar buttons injected");
  }

  _removeButtons(window) {
    try {
      const document = window.document;
      const container = document.getElementById(CONTAINER_ID);
      if (container) {
        container.remove();
      }
    } catch (_) {}
  }

  _registerWindowListener() {
    if (this._registered) {
      return;
    }

    const self = this;
    const extension = this.extension;
    const locale = this._getLocale();

    ExtensionSupport.registerWindowListener(LISTENER_ID, {
      chromeURLs: [
        "chrome://messenger/content/messenger.xhtml",
      ],
      onLoadWindow(window) {
        self._injectButtons(window, extension, locale);
      },
      onUnloadWindow(window) {
        self._removeButtons(window);
      },
    });

    this._registered = true;
  }

  onStartup() {
    this._registerWindowListener();
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    try {
      ExtensionSupport.unregisterWindowListener(LISTENER_ID);
    } catch (_) {}

    for (const window of ExtensionSupport.openWindows) {
      if (window.location.href === "chrome://messenger/content/messenger.xhtml") {
        this._removeButtons(window);
      }
    }

    Services.obs.notifyObservers(null, "startupcache-invalidate");
  }

  getAPI(context) {
    const self = this;
    this._registerWindowListener();

    return {
      toolbarButtons: {
        onEmptyTrashClicked: new ExtensionCommon.EventManager({
          context,
          name: "toolbarButtons.onEmptyTrashClicked",
          register(fire) {
            const listener = () => fire.async();
            self._listeners.trash.add(listener);
            return () => self._listeners.trash.delete(listener);
          },
        }).api(),

        onEmptyJunkClicked: new ExtensionCommon.EventManager({
          context,
          name: "toolbarButtons.onEmptyJunkClicked",
          register(fire) {
            const listener = () => fire.async();
            self._listeners.junk.add(listener);
            return () => self._listeners.junk.delete(listener);
          },
        }).api(),

        onEmptyBothClicked: new ExtensionCommon.EventManager({
          context,
          name: "toolbarButtons.onEmptyBothClicked",
          register(fire) {
            const listener = () => fire.async();
            self._listeners.both.add(listener);
            return () => self._listeners.both.delete(listener);
          },
        }).api(),
      },
    };
  }
};
