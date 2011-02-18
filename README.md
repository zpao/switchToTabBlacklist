Firefox 4's switch-to-tab feature is great. However sometimes there are some websites that don't behave well with that feature. My personal pet peeve is Google Maps. If I open a tab to go to Google Maps, I almost never want the existing tab, which is a map or directions to somewhere else.

There is no front-end on this addon at this time. The blacklist is stored as a JSON array in the `switchToTabBlacklist.blacklist` preference accessible via [about:config](http://kb.mozillazine.org/About:config). Each entry is a regular expression that will be used to match against URIs.

**By default:** This adds *http://maps.google.com/* to the blacklist. You can remove this by editing the preference.

