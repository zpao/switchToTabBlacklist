/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Switch To Blacklist.
 *
 * The Initial Developer of the Original Code is
 * Paul O’Shannessy <paul@oshannessy.com>.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cu = Components.utils;

const PREFNAME = "switchToTabBlacklist.blacklist";
const DEFAULT_BLACKLIST = [
  "http://maps.google.com/"
];
const DEBUG = false;

let gBlacklist = [];

Cu.import("resource://gre/modules/Services.jsm");

function log(aMsg) {
  if (!DEBUG) return;
  aMsg = ("switchToTabBlacklist: " + aMsg + "\n");
  dump(aMsg);
  Services.console.logStringMessage(aMsg);
}

function install(data, reason) {
  // set default pref values
  if (!Services.prefs.prefHasUserValue(PREFNAME))
    Services.prefs.setCharPref(PREFNAME, JSON.stringify(DEFAULT_BLACKLIST));
}

function startup(data, reason) {
  // Observe pref changes
  Services.prefs.addObserver(PREFNAME, observe, false);

  // register our observer
  Services.ww.registerNotification(observe);

  // Process open windows
  forEachBrowserWindow(function(aWindow) {
    addListener(aWindow);
  });

  // read the blacklist and process open windows
  setupAndProcessBlacklist();
}

function shutdown(data, reason) {
  // unregister our observer
  Services.ww.unregisterNotification(observe);

  // Process open windows
  forEachBrowserWindow(function(aWindow) {
    removeListener(aWindow);
    aWindow.gBrowser.browsers.forEach(maybeAddEntryForBrowser);
  });
}

function uninstall(data, reason) {
  try {
    Services.prefs.clearUserPref(PREFNAME);
  }
  catch (e) { }
}


function addListener(aWindow) {
  aWindow.gBrowser.addTabsProgressListener(gTabsProgressListener);
}

function removeListener(aWindow) {
  aWindow.gBrowser.removeTabsProgressListener(gTabsProgressListener);
}


function observe(aSubject, aTopic, aData) {
  switch (aTopic) {
    case "domwindowopened":
      // The window doesn't know it's going to have a gBrowser yet, so we need to wait for load
      aSubject.addEventListener("load", function onWindowLoad(aEvent) {
        let window = aEvent.currentTarget;
        window.removeEventListener("load", onWindowLoad, false);
        if (window.document.documentElement.getAttribute("windowtype") != "navigator:browser")
          return;

        addListener(window);
      }, false);
      break;
    case "domwindowclosed":
      removeListener(aSubject);
      break;
    case "nsPref:changed":
      setupAndProcessBlacklist();
      break;
  }
}

// Read the pref, iterate over each window unblocking & blocking
function setupAndProcessBlacklist(aBlacklist) {
  let blacklist;
  try {
    blacklist = JSON.parse(Services.prefs.getCharPref(PREFNAME));
  }
  catch (e) {
    log(e);
    // On failure set the default blacklist
    Services.prefs.setCharPref(PREFNAME, JSON.stringify(DEFAULT_BLACKLIST));
    blacklist = DEFAULT_BLACKLIST;
  }

  // Turn the blacklist entries into actual RegExps
  gBlacklist = blacklist.map(function(bl) new RegExp(bl));
  log("blacklist updated: " + gBlacklist);

  // Now process the blacklist. Loop over each browser in each window and
  // unblock then block as needed. This will re-add entries that were blocked
  // before and block new (and old) entries again.
  forEachBrowserWindow(function(aWindow) {
    aWindow.gBrowser.browsers.forEach(function(aBrowser) {
      maybeAddEntryForBrowser(aBrowser);
      maybeRemoveEntryForBrowser(aBrowser);
    })
  });
}



gTabsProgressListener = {
  onLocationChange: function TPL_onLocationChange(aBrowser, aWebProgress, aRequest, aLocation) {
    // OnLocationChange is called for both the top-level content
    // and the subframes.
    let topLevel = aWebProgress.DOMWindow == aBrowser.contentWindow;

    if (topLevel) {
      // If the registered uri doesn't match this location then something went wrong
      if (aBrowser.registeredOpenURI &&
          aBrowser.registeredOpenURI.spec != aLocation.spec)
        return;

      // If this page is in the blacklist, then unregister it
      maybeRemoveEntryForBrowser(aBrowser);
    }
  }
}

function maybeRemoveEntryForBrowser(aBrowser) {
  if (!aBrowser.registeredOpenURI)
    return;

  let shouldBlock = gBlacklist.some(function(bl) bl.test(aBrowser.registeredOpenURI.spec));
  if (shouldBlock) {
    let window = aBrowser.ownerDocument.defaultView;
    let autocomplete = window.gBrowser._placesAutocomplete;
    autocomplete.unregisterOpenPage(aBrowser.registeredOpenURI);
    log("BLOCKED: " + aBrowser.registeredOpenURI.spec);
    delete aBrowser.registeredOpenURI;
  }
}


function maybeAddEntryForBrowser(aBrowser) {
  if (aBrowser.registeredOpenURI)
    return;

  // about:blank is explicitly blocked from being added, so don't add it back.
  if (aBrowser.currentURI.spec == "about:blank")
    return;

  // At this point, we can probably assume that we can just add currentURI
  let window = aBrowser.ownerDocument.defaultView;
  let autocomplete = window.gBrowser._placesAutocomplete;
  autocomplete.registerOpenPage(aBrowser.currentURI);
  aBrowser.registeredOpenURI = aBrowser.currentURI;
  log("UNBLOCKED: " + aBrowser.currentURI.spec);
}

function forEachBrowserWindow(aFunction) {
  let windowsEnum = Services.wm.getEnumerator("navigator:browser");
  while (windowsEnum.hasMoreElements()) {
    let window = windowsEnum.getNext();
    if (!window.closed) {
      aFunction.call(this, window);
    }
  }
}
