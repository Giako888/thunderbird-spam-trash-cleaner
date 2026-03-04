// popup.js — Spam & Trash Cleaner popup logic

"use strict";

const api = typeof messenger !== "undefined" ? messenger : browser;
const msg = (key, ...subs) => api.i18n.getMessage(key, subs) || key;

// DOM references
const btnEmptyTrash = document.getElementById("btnEmptyTrash");
const btnEmptyJunk = document.getElementById("btnEmptyJunk");
const btnEmptyBoth = document.getElementById("btnEmptyBoth");
const trashCountEl = document.getElementById("trashCount");
const junkCountEl = document.getElementById("junkCount");
const feedbackEl = document.getElementById("feedback");
const spinnerEl = document.getElementById("spinner");
const mainButtons = document.getElementById("mainButtons");
const confirmPanel = document.getElementById("confirmPanel");
const confirmText = document.getElementById("confirmText");
const btnConfirmYes = document.getElementById("btnConfirmYes");
const btnConfirmNo = document.getElementById("btnConfirmNo");

// Apply i18n labels
document.getElementById("popupTitle").textContent = msg("popupTitle");
document.getElementById("labelTrash").textContent = msg("labelTrash");
document.getElementById("labelSpam").textContent = msg("labelSpam");
btnEmptyTrash.textContent = msg("btnEmptyTrash");
btnEmptyJunk.textContent = msg("btnEmptySpam");
btnEmptyBoth.textContent = msg("btnEmptyBoth");
btnConfirmYes.textContent = msg("confirmYes");
btnConfirmNo.textContent = msg("confirmNo");
document.getElementById("spinnerText").textContent = msg("deleting");

let pendingAction = null;
let pendingSuccessMsg = null;

// Init
refreshStatus();

// Event listeners
btnEmptyTrash.addEventListener("click", () => {
  showConfirm(msg("confirmTrash"), "emptyTrash", msg("successTrash"));
});

btnEmptyJunk.addEventListener("click", () => {
  showConfirm(msg("confirmSpam"), "emptyJunk", msg("successSpam"));
});

btnEmptyBoth.addEventListener("click", () => {
  showConfirm(msg("confirmBoth"), "emptyBoth", msg("successBoth"));
});

btnConfirmYes.addEventListener("click", async () => {
  hideConfirm();
  if (pendingAction) {
    await executeAction(pendingAction, pendingSuccessMsg);
    pendingAction = null;
    pendingSuccessMsg = null;
  }
});

btnConfirmNo.addEventListener("click", () => {
  hideConfirm();
  pendingAction = null;
  pendingSuccessMsg = null;
});

// Inline confirmation (replaces confirm() which breaks TB popups)
function showConfirm(message, action, successMsg) {
  pendingAction = action;
  pendingSuccessMsg = successMsg;
  confirmText.textContent = message;
  mainButtons.classList.add("hidden");
  confirmPanel.classList.remove("hidden");
  hideFeedback();
}

function hideConfirm() {
  confirmPanel.classList.add("hidden");
  mainButtons.classList.remove("hidden");
}

// Refresh status counts
async function refreshStatus() {
  trashCountEl.textContent = msg("loading");
  junkCountEl.textContent = msg("loading");
  setButtonsEnabled(false);

  try {
    const status = await api.runtime.sendMessage({ action: "getStatus" });
    if (!status || typeof status.trashCount === "undefined") {
      throw new Error(msg("errorInvalidResponse"));
    }
    trashCountEl.textContent = `${status.trashCount} ${msg("messages")}`;
    junkCountEl.textContent = `${status.junkCount} ${msg("messages")}`;
    setButtonsEnabled(true);

    if (status.trashCount === 0) btnEmptyTrash.disabled = true;
    if (status.junkCount === 0) btnEmptyJunk.disabled = true;
    if (status.trashCount === 0 && status.junkCount === 0) btnEmptyBoth.disabled = true;
  } catch (e) {
    console.error("Spam & Trash Cleaner popup: refreshStatus error:", e);
    trashCountEl.textContent = msg("errorLabel");
    junkCountEl.textContent = msg("errorLabel");
    showFeedback(msg("errorStatus", e.message), "error");
  }
}

// Execute empty action
async function executeAction(action, successMessage) {
  setButtonsEnabled(false);
  showSpinner(true);
  hideFeedback();

  try {
    const result = await api.runtime.sendMessage({ action });

    if (!result) {
      throw new Error(msg("errorNoResponse"));
    }

    if (result.success) {
      const total = result.deleted != null
        ? result.deleted
        : ((result.trashDeleted || 0) + (result.junkDeleted || 0));
      showFeedback(msg("successDetail", successMessage, String(total)), "success");
    } else {
      const errText = (result.errors || []).join("\n");
      showFeedback(msg("warningWithErrors", errText), "warning");
    }
  } catch (e) {
    console.error("Spam & Trash Cleaner popup: action error:", e);
    showFeedback(`❌ ${msg("errorGeneric", e.message)}`, "error");
  } finally {
    showSpinner(false);
    await refreshStatus();
  }
}

function setButtonsEnabled(enabled) {
  btnEmptyTrash.disabled = !enabled;
  btnEmptyJunk.disabled = !enabled;
  btnEmptyBoth.disabled = !enabled;
}

function showFeedback(text, type) {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${type}`;
  feedbackEl.classList.remove("hidden");
}

function hideFeedback() {
  feedbackEl.classList.add("hidden");
}

function showSpinner(visible) {
  spinnerEl.classList.toggle("hidden", !visible);
}
