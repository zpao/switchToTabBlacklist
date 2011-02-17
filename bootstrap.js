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
    Services.prefs.setCharPref(PREFNAME, DEFAULT_BLACKLIST.join("|"));
}

function startup(data, reason) {
  // Read the blacklist from prefs
  try {
    gBlacklist = Services.prefs.getCharPref(PREFNAME).split("|");
  }
  catch (e) {
    dump(e);
  }
  dump("blacklist: " + JSON.stringify(gBlacklist) + "\n");

  // register our observer
  Services.ww.registerNotification(windowWatcherObserver);
  //XXXzpao Need to modify existing windows
}

function shutdown(data, reason) {
  // unregister our observer
  Services.ww.unregisterNotification(windowWatcherObserver);
  //XXXzpao need to unmodify open windows
}

function uninstall(data, reason) {
  try {
    Services.prefs.clearUserPref(PREFNAME);
  }
  catch (e) { }
}


function addListener(aWindow) {
  let tpl = new TabsProgressListener();
  tpl.window = aWindow;
  aWindow.gBrowser.addTabsProgressListener(tpl);
  aWindow.__STB_listener = tpl;
}

function removeListener(aWindow) {
  if (aWindow.__STB_listener) {
    aWindow.removeTabsProgressListener(aWindow.__STB_listener)
    delete aWindow.__STB_listener;
  }

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


function TabsProgressListener() {}
TabsProgressListener.prototype = {
  window: null,
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
      if (gBlacklist.indexOf(aLocation.spec) > -1) {
        dump("\nBLOCKED: " + aLocation.spec + "\n");
        let autocomplete = this.window.gBrowser._placesAutocomplete;
        delete aBrowser.registeredOpenURI;
        autocomplete.unregisterOpenPage(aLocation);
      }
    }
  }
}
