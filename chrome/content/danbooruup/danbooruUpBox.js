const promptService	= Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Components.interfaces.nsIPromptService);
const prefService	= Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefBranch);
var danbooruUpMsg	= Components.classes['@mozilla.org/intl/stringbundle;1']
				.getService(Components.interfaces.nsIStringBundleService)
				.createBundle('chrome://danbooruup/locale/danbooruUp.properties');

function init()
{
	var ml = document.getElementById('danbooru');
	ml.selectedIndex = -1;
	ml.removeAllItems();
	gDanbooruManager.init(ml);

	document.getElementById('tags').focus();

	var source = '';
	if ('arguments' in window) {
		window.locations = [window.arguments[0].imageLocation.spec];

		if(!window.arguments[0].imageLocation.equals(window.arguments[0].imageURI))
			window.locations.push(window.arguments[0].imageURI.spec);

		if(window.arguments[0].referrer)
			window.locations.unshift(window.arguments[0].referrer);

		if (prefService.getBoolPref("extensions.danbooruUp.fileurlsource") || !(window.arguments[0].imageURI.scheme == 'file') )
			source = window.arguments[0].imageURI.spec;
	} else {
		window.locations = [];
	}

	document.getElementById('source').value = source;
	document.getElementById('nextSrcBtn').disabled = true;
	if (window.locations.length == 1 && source)
		document.getElementById('prevSrcBtn').disabled = true;

	if (prefService.getBoolPref('extensions.danbooruUp.autocomplete.enabled') && completer.tagService) {
		var context = ['__ALL__'];
		if ('arguments' in window) {
			// The components of the host name except the TLD, and the components of the path except the filename
			context = context.concat(window.arguments[0].imageURI.host.split('.').slice(0, -1),
					window.arguments[0].imageURI.path.split('/').filter(function (x) {return x}).slice(0, -1));
		}
		completer.context = context;
		new AutoCompleter(document.getElementById('tags'), completer, danbooruACXULPopup);

		let stylePrefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");
		setTimeout(function() {danbooruAddTagTypeStyleSheet(function(style) {return stylePrefs.getCharPref(style)});}, 100);
	}
}

function doSwitchSource(forward) {
	var srcFld = document.getElementById('source');
	for(var i=0; i<window.locations.length; i++) {
		if(window.locations[i] == srcFld.value)
			break;
	}
	if((i==0 && !forward) || (i==window.locations.length-1 && forward)) return;
	if(i == window.locations.length) {	// user-modifed value
		srcFld.value = window.locations[window.locations.length-1];
		document.getElementById('nextSrcBtn').disabled = true;
		if(window.locations.length == 1)
		{
			document.getElementById('prevSrcBtn').disabled = true;
		}
	} else {
		i += (forward ? 1 : -1);
		srcFld.value = window.locations[i];
		if (i==0) {
			document.getElementById('prevSrcBtn').disabled = true;
			document.getElementById('nextSrcBtn').disabled = false;
		} else if (i==window.locations.length-1) {
			document.getElementById('prevSrcBtn').disabled = false;
			document.getElementById('nextSrcBtn').disabled = true;
		} else {
			document.getElementById('prevSrcBtn').disabled = false;
			document.getElementById('nextSrcBtn').disabled = false;
		}
	}
}
function onSourceInput() {
	if(window.locations.length == 1)
	{
		document.getElementById('prevSrcBtn').disabled = false;
	}
	return false;
}

function doOK()
{
	var ml = document.getElementById('danbooru');
	var tags = document.getElementById('tags').value;
	var rating = ['Explicit','Questionable','Safe'][document.getElementById('ratinggrp').selectedIndex];
	gDanbooruManager.selectDanbooru(ml.selectedIndex);
	gDanbooruManager.uninit();

	var helpersvc= Components.classes["@unbuffered.info/danbooru/helper-service;1"]
			.getService(Components.interfaces.danbooruIHelperService);
	if (tags.length) {
		// compact tag input
		var tagarr=tags.replace(/\s\s+/g, ' ').replace(/^\s+|\s+$/g,'').split(' ');
		var context = completer.context;
		var needupdate = false;
		try {
			var tagHist = helpersvc.tagService;
			needupdate = !tagHist.updateTagHistory(tagarr, context);
		} catch (e) {
			// silently fail
		}
		needupdate = prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.afterdialog") && needupdate;
	}

	helpersvc.startUpload(
			window.arguments[0].imageURI,
			document.getElementById('source').value,
			tags,
			rating,
			ml.label,
			window.arguments[0].imageLocation,
			window.arguments[0].wind,
			needupdate
		);
	window.arguments[0].imageLocation = null;
	window.arguments[0].wind = null;
	window.arguments=null;

	return true;
}
function doCancel() {
	return true;
}
function refocus() {
	this.removeEventListener("focus",refocus,false);
	setTimeout(function(){window.focus()},10);
}
function doSwitchTab() {
	var tab = window.arguments[0].wind;
	var currentTab = tab.linkedBrowser.getTabBrowser().selectedTab;

	// the easy way, but not the right way:
	// 	tab.linkedBrowser.getTabBrowser().ownerDocument.__parent__.focus();
	var browserWindow = tab.linkedBrowser.contentWindow
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIWebNavigation)
				.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
					.rootTreeItem
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIDOMWindow);

	// tab (but not window) switching is on a timeout of 0 so we have to wait until we're blurred before refocusing
	browserWindow.addEventListener("focus",refocus,false);

	if (currentTab != tab) {
		tab.linkedBrowser.getTabBrowser().selectedTab = tab;
	} else {
		browserWindow.focus();
	}

	return true;
}
function doArtistSearch() {
	var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	var xhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
	var ml = document.getElementById('danbooru');
	var btn = document.getElementById('artistSearch');

	btn.setAttribute("image", "chrome://global/skin/throbber/Throbber-small.gif");
	var uri = ioService.newURI(ml.label, null, null).QueryInterface(Components.interfaces.nsIURL);
	uri.path = uri.path.replace(/\/[^/]+\/[^/]+$/, "/artist/index.xml");
	uri.query = "name=" + encodeURIComponent(document.getElementById('source').value);

	function artistLoad(event) {
		document.getElementById('artistSearch').setAttribute("image", "chrome://danbooruup/skin/glass-trimmed.png");
		var responseXML = xhr.responseXML;
		if (responseXML
			&& responseXML.documentElement.namespaceURI != "http://www.mozilla.org/newlayout/xml/parsererror.xml"
			&& (xhr.status == 200 || xhr.status == 0)) {
			var result = responseXML.evaluate("/artists/artist", responseXML, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
			if (result.snapshotLength == 1) {
				var tags = document.getElementById('tags');
				var append = result.snapshotItem(0).getAttribute("name") + ' ';
				if (append)
				{
					if (!tags.value.match(/\s$/))
						append = ' ' + append;
					tags.value += append;
					return;
				}
			} else if (result.snapshotLength > 1) {
				var s=Components.classes['@mozilla.org/sound;1'].createInstance(Components.interfaces.nsISound);
				s.beep();
				return;
			}
			var s=Components.classes['@mozilla.org/sound;1'].createInstance(Components.interfaces.nsISound);
			s.beep();
			return;
		} else {
			var msg;
			if (xhr.status != 200) {
				msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.serverresponse') + xhr.status + ' '+ xhr.statusText;
			} else if (!responseXML || responseXML.documentElement.namespaceURI != "http://www.mozilla.org/newlayout/xml/parsererror.xml") {
				msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.parse');
			} else {
				msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.artistsearchfailed');
			}
			promptService.alert(window, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), msg);
		}
	}
	function artistError(event) {
		promptService.alert(window, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.artistsearchfailed.network'));
		document.getElementById('artistSearch').setAttribute("image", "chrome://danbooruup/skin/glass-trimmed.png");
	}

	xhr.open("GET", uri.spec, true);
	xhr.overrideMimeType("text/xml");
	xhr.QueryInterface(Components.interfaces.nsIJSXMLHttpRequest);
	xhr.onload = artistLoad;
	xhr.onerror = artistError;
	xhr.send(null);
}

var completer = {
	timer: Components.classes['@mozilla.org/timer;1'].createInstance(Components.interfaces.nsITimer),
	running: false,
	cur_tag: '',
	cur_callback: null,
	context: null,	// Set from init()

	tagService: Components.classes["@unbuffered.info/danbooru/helper-service;1"]
		.getService(Components.interfaces.danbooruIHelperService).tagService,

	getSuggestions: function(tag, callback)
	{
		if (!this.running) {
			this.timer.init(this, 100, this.timer.TYPE_ONE_SHOT);
			this.running = true;
		}
		this.cur_tag = tag;
		this.cur_callback = callback;
	},

	abortSuggestion: function()
	{
		this.timer.cancel();
		this.running = false;
	},

	// Called by timer, time to do search
	observe: function(subject, topic, data)
	{
		this.running = false;
		this.tagService.autocompleteSearch(this.cur_tag, this.context, this.cur_callback);
	},

	getRelated: function(tag, callback)
	{
		this.tagService.searchRelatedTags(tag, callback);
	},

	openBrowserTab: function(tag)
	{
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var br = wm.getMostRecentWindow("navigator:browser");

		var boardUri = document.getElementById('danbooru').label;
		var uri = ioService.newURI(boardUri, null, null).QueryInterface(Components.interfaces.nsIURL);
		uri.path = uri.path.replace(/\/[^/]+\/[^/]+$/, "/post/index");

		uri.query = "tags=" + encodeURIComponent(tag);

		br.getBrowser().selectedTab = br.getBrowser().addTab(uri.spec);
	},
};
