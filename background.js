// background.js — Spam & Trash Cleaner v4 for Thunderbird 115+
// Uses messenger.* APIs (Thunderbird native namespace) with browser.* fallback.
// Toolbar buttons are provided via a Mail Experiment API (see experiment-apis/).

"use strict";

const api = typeof messenger !== "undefined" ? messenger : browser;

// Helper: get i18n message
function _(key, ...subs) {
  return api.i18n.getMessage(key, subs) || key;
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
// Experiment toolbar buttons (3 separate one-click icons)
// ======================================================================

try {
  if (typeof browser !== "undefined" && browser.toolbarButtons) {
    browser.toolbarButtons.onEmptyTrashClicked.addListener(async () => {
      await runAction("trash", "toolbarTrashLabel");
    });
    browser.toolbarButtons.onEmptyJunkClicked.addListener(async () => {
      await runAction("junk", "toolbarSpamLabel");
    });
    browser.toolbarButtons.onEmptyBothClicked.addListener(async () => {
      await runAction("both", "toolbarBothLabel");
    });
    console.log("Spam & Trash Cleaner: experiment toolbar listeners registered");
  } else {
    console.log("Spam & Trash Cleaner: experiment toolbar API unavailable");
  }
} catch (e) {
  console.warn("Spam & Trash Cleaner: experiment toolbar listener error:", e.message);
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

console.log("Spam & Trash Cleaner: background script loaded");
