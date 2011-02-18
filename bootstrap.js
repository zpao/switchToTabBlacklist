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

const PREFNAME = "switchToBlacklist.blacklist";
const DEFAULT_BLACKLIST = [
  "http://maps.google.com/"
];

let gBlacklist = [];

Cu.import("resource://gre/modules/Services.jsm");

function install(data, reason) {
  // set default pref values
  if (!Services.prefs.prefHasUserValue(PREFNAME))
    Services.prefs.setCharPref(PREFNAME, JSON.stringify(DEFAULT_BLACKLIST));
}

function startup(data, reason) {
  // Read the blacklist from prefs
  let blacklist;
  try {
    blacklist = JSON.parse(Services.prefs.getCharPref(PREFNAME));
  }
  catch (e) {
    dump(e);
    // On failure set the default blacklist
    Services.prefs.setCharPref(PREFNAME, JSON.stringify(DEFAULT_BLACKLIST));
    blacklist = DEFAULT_BLACKLIST;
  }

  // Turn the blacklist entries into actual RegExps
  gBlacklist = blacklist.map(function(bl) new RegExp(bl));
  dump("blacklist: " + gBlacklist + "\n");

  // register our observer
  Services.ww.registerNotification(windowWatcherObserver);

  // Process open windows
  let windowsEnum = Services.wm.getEnumerator("navigator:browser");
  while (windowsEnum.hasMoreElements()) {
    let window = windowsEnum.getNext();
    addListener(window);
  }
}

function shutdown(data, reason) {
  // unregister our observer
  Services.ww.unregisterNotification(windowWatcherObserver);

  // Process open windows
  let windowsEnum = Services.wm.getEnumerator("navigator:browser");
  while (windowsEnum.hasMoreElements()) {
    let window = windowsEnum.getNext();
    removeListener(window);
  }
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
  aWindow.removeTabsProgressListener(gTabsProgressListener);
}


function windowWatcherObserver(aSubject, aTopic, aData) {
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
  }
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
      let shouldBlock = gBlacklist.some(function(bl) bl.test(aLocation.spec));
      if (shouldBlock) {
        removeEntryForBrowser(aBrowser);
        dump("\nBLOCKED: " + aLocation.spec + "\n");
      }
    }
  }
}


function removeEntryForBrowser(aBrowser) {
  if (!aBrowser.registeredOpenURI)
    return;

  let window = aBrowser.ownerDocument.defaultView;
  let autocomplete = window.gBrowser._placesAutocomplete;
  autocomplete.unregisterOpenPage(aURI);
  delete aBrowser.registeredOpenURI;
}

function addEntryForURI(aBrowser, aURI) {
  if (aBrowser.registeredOpenURI)
    return;

  let window = aBrowser.ownerDocument.defaultView;
  let autocomplete = window.gBrowser._placesAutocomplete;
  autocomplete.registerOpenPage(aURI);
  aBrowser.registeredOpenURI = aURI;
}
