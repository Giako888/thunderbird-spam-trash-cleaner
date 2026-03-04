// background.js — Spam & Trash Cleaner v4 for Thunderbird 115+
// Pure WebExtension — no Experiment API required.
// Uses messenger.* APIs (Thunderbird native namespace) with browser.* fallback.

"use strict";

const api = typeof messenger !== "undefined" ? messenger : browser;

// Helper: get i18n message
function _(key, ...subs) {
  return api.i18n.getMessage(key, subs) || key;
}

// ======================================================================
// Message Listener — handles popup requests
// ======================================================================
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      console.error("Spam & Trash Cleaner: handler error:", err);
      sendResponse({ success: false, errors: [err.message] });
    });
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  console.log("Spam & Trash Cleaner: received action:", message.action);

  switch (message.action) {
    case "getStatus":
      return await getFolderStatus();

    case "emptyTrash":
      return await emptyFoldersByType("trash");

    case "emptyJunk":
      return await emptyFoldersByType("junk");

    case "emptyBoth": {
      const trashResult = await emptyFoldersByType("trash");
      const junkResult = await emptyFoldersByType("junk");
      return {
        success: trashResult.success && junkResult.success,
        trashDeleted: trashResult.deleted,
        junkDeleted: junkResult.deleted,
        deleted: trashResult.deleted + junkResult.deleted,
        errors: [...(trashResult.errors || []), ...(junkResult.errors || [])],
      };
    }

    default:
      return { success: false, errors: ["Unknown action: " + message.action] };
  }
}

// ======================================================================
// Folder discovery
// ======================================================================

async function findFoldersByType(folderType) {
  const results = [];

  try {
    const accounts = await api.accounts.list(true);
    console.log(`Spam & Trash Cleaner: found ${accounts.length} account(s)`);

    for (const account of accounts) {
      const folders = flattenFolders(account.folders || []);
      console.log(`  Account "${account.name}" (${account.type}): ${folders.length} folders`);

      for (const folder of folders) {
        if (folder.type === folderType) {
          console.log(`    → ${folderType}: "${folder.name}" (id: ${folder.id || folder.path})`);
          results.push({ folder, account });
        }
      }
    }
  } catch (e) {
    console.error("Spam & Trash Cleaner: accounts.list error:", e);

    // Fallback: try folders.getSubFolders per account
    try {
      const accounts = await api.accounts.list(false);
      for (const account of accounts) {
        try {
          const subFolders = await api.folders.getSubFolders(account, true);
          const folders = flattenFolders(subFolders || []);
          for (const folder of folders) {
            if (folder.type === folderType) {
              results.push({ folder, account });
            }
          }
        } catch (innerErr) {
          console.warn(`  Could not get folders for "${account.name}":`, innerErr);
        }
      }
    } catch (e2) {
      console.error("Spam & Trash Cleaner: fallback folder discovery failed:", e2);
    }
  }

  return results;
}

function flattenFolders(folders) {
  const result = [];
  for (const folder of folders) {
    result.push(folder);
    if (folder.subFolders && folder.subFolders.length > 0) {
      result.push(...flattenFolders(folder.subFolders));
    }
  }
  return result;
}

// ======================================================================
// Message counting
// ======================================================================

async function getFolderStatus() {
  let trashCount = 0;
  let junkCount = 0;

  const trashFolders = await findFoldersByType("trash");
  const junkFolders = await findFoldersByType("junk");

  for (const { folder } of trashFolders) {
    trashCount += await countMessages(folder);
  }
  for (const { folder } of junkFolders) {
    junkCount += await countMessages(folder);
  }

  console.log(`Spam & Trash Cleaner: status → trash=${trashCount}, junk=${junkCount}`);
  return { trashCount, junkCount };
}

async function countMessages(folder) {
  // Fast path: folders.getFolderInfo (TB 91+)
  try {
    if (api.folders && typeof api.folders.getFolderInfo === "function") {
      const folderId = folder.id || folder;
      const info = await api.folders.getFolderInfo(folderId);
      if (typeof info.totalMessageCount === "number") {
        return info.totalMessageCount;
      }
    }
  } catch (_) {
    // fall through
  }

  // Slow path: list and count
  let count = 0;
  try {
    let page;
    try {
      page = await api.messages.list(folder.id);
    } catch (_) {
      page = await api.messages.list(folder);
    }
    count += page.messages.length;
    while (page.id) {
      page = await api.messages.continueList(page.id);
      count += page.messages.length;
    }
  } catch (e) {
    console.warn(`Spam & Trash Cleaner: count error for "${folder.name}":`, e);
  }
  return count;
}

// ======================================================================
// Folder emptying
// ======================================================================

async function emptyFoldersByType(folderType) {
  const folderEntries = await findFoldersByType(folderType);
  let totalDeleted = 0;
  const errors = [];

  if (folderEntries.length === 0) {
    return { success: true, deleted: 0, errors: [] };
  }

  for (const { folder, account } of folderEntries) {
    try {
      const deleted = await emptyFolder(folder);
      totalDeleted += deleted;
      console.log(`Spam & Trash Cleaner: deleted ${deleted} from "${folder.name}" in "${account.name}"`);
    } catch (e) {
      const msg = `${account.name}/${folder.name}: ${e.message}`;
      console.error("Spam & Trash Cleaner: empty error:", msg, e);
      errors.push(msg);
    }
  }

  return { success: errors.length === 0, deleted: totalDeleted, errors };
}

async function emptyFolder(folder) {
  let totalDeleted = 0;
  const MAX_PASSES = 50;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let page;
    try {
      page = await api.messages.list(folder.id);
    } catch (_) {
      page = await api.messages.list(folder);
    }

    const messageIds = page.messages.map((m) => m.id);
    while (page.id) {
      page = await api.messages.continueList(page.id);
      messageIds.push(...page.messages.map((m) => m.id));
    }

    if (messageIds.length === 0) break;

    console.log(`Spam & Trash Cleaner: pass ${pass + 1}, deleting ${messageIds.length} from "${folder.name}"`);

    const batchSize = 100;
    let batchFailed = false;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      try {
        await api.messages.delete(batch, true);
      } catch (batchErr) {
        console.warn("Spam & Trash Cleaner: batch error, trying one-by-one:", batchErr.message);
        for (const id of batch) {
          try {
            await api.messages.delete([id], true);
          } catch (singleErr) {
            console.warn(`Spam & Trash Cleaner: could not delete ${id}:`, singleErr.message);
            batchFailed = true;
          }
        }
      }
    }

    if (batchFailed) {
      console.warn(`Spam & Trash Cleaner: persistent failures, stopping for "${folder.name}"`);
      break;
    }

    totalDeleted += messageIds.length;
  }

  return totalDeleted;
}

// ======================================================================
// Notifications helper
// ======================================================================

async function showNotification(title, message) {
  try {
    await api.notifications.create("spam-trash-cleaner-notify", {
      type: "basic",
      iconUrl: "icons/icon-48.svg",
      title,
      message,
    });
  } catch (e) {
    console.warn("Spam & Trash Cleaner: notification error:", e.message);
  }
}

// Unified action runner (used by menus and keyboard shortcuts)
async function runAction(actionType, labelKey) {
  const label = _(labelKey);
  console.log(`Spam & Trash Cleaner: action — ${label}`);
  try {
    if (actionType === "both") {
      const t = await emptyFoldersByType("trash");
      const j = await emptyFoldersByType("junk");
      const total = t.deleted + j.deleted;
      const allErrors = [...(t.errors || []), ...(j.errors || [])];
      if (allErrors.length === 0) {
        await showNotification("✅ " + label, _("notifyMessagesDeleted", String(total)));
      } else {
        await showNotification("⚠️ " + label, _("notifyDeletedWithErrors", String(total), allErrors.join(", ")));
      }
    } else {
      const result = await emptyFoldersByType(actionType);
      if (result.success) {
        await showNotification("✅ " + label, _("notifyMessagesDeleted", String(result.deleted)));
      } else {
        await showNotification("⚠️ " + label, _("notifyDeletedWithErrors", String(result.deleted), result.errors.join(", ")));
      }
    }
  } catch (e) {
    console.error(`Spam & Trash Cleaner: action error:`, e);
    await showNotification("❌ " + _("errorLabel"), e.message);
  }
}

// ======================================================================
// Context menu items (right-click in folder tree + Tools menu)
// ======================================================================

try {
  api.menus.create({
    id: "stc-empty-trash",
    title: _("toolbarTrashLabel"),
    contexts: ["folder_pane", "tools_menu"],
    icons: { "16": "icons/btn-trash.svg" },
  });

  api.menus.create({
    id: "stc-empty-spam",
    title: _("toolbarSpamLabel"),
    contexts: ["folder_pane", "tools_menu"],
    icons: { "16": "icons/btn-spam.svg" },
  });

  api.menus.create({
    id: "stc-empty-both",
    title: _("toolbarBothLabel"),
    contexts: ["folder_pane", "tools_menu"],
    icons: { "16": "icons/btn-both.svg" },
  });

  api.menus.onClicked.addListener(async (info) => {
    switch (info.menuItemId) {
      case "stc-empty-trash":
        await runAction("trash", "toolbarTrashLabel");
        break;
      case "stc-empty-spam":
        await runAction("junk", "toolbarSpamLabel");
        break;
      case "stc-empty-both":
        await runAction("both", "toolbarBothLabel");
        break;
    }
  });

  console.log("Spam & Trash Cleaner: context menus registered");
} catch (e) {
  console.warn("Spam & Trash Cleaner: menus error:", e.message);
}

// ======================================================================
// Keyboard shortcuts
// ======================================================================

try {
  api.commands.onCommand.addListener(async (command) => {
    console.log(`Spam & Trash Cleaner: shortcut — ${command}`);
    switch (command) {
      case "empty-trash":
        await runAction("trash", "toolbarTrashLabel");
        break;
      case "empty-spam":
        await runAction("junk", "toolbarSpamLabel");
        break;
      case "empty-both":
        await runAction("both", "toolbarBothLabel");
        break;
    }
  });
  console.log("Spam & Trash Cleaner: keyboard shortcuts registered");
} catch (e) {
  console.warn("Spam & Trash Cleaner: shortcuts error:", e.message);
}

console.log("Spam & Trash Cleaner: background script loaded (v4.0.0)");
