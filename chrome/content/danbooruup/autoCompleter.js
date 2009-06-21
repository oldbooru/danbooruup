/*
 * GUI scripting to extend a textbox into an tag autocompleter.
 * Should in theory have used XBL to extend a widget, but this is much easier.
 */

var AutoCompleter = function(textfield, completer, createPopup)
{
	this._textfield = textfield;
	this._completer = completer;

	this._textfield.danbooruUpAutoCompleter = this;

	this._popup = new createPopup(textfield);
	this._listbox = this._popup.listbox;

	// The list box sometimes doesn't seem to acquire all its methods before it's been shown once...
	this._popup.openPopup(this._textfield, 'after_start', 0, 0, false, false);
	this._popup.hidePopup();

	var o = this;
	this._showSugg = function(tag, suggestions) { o.showSuggestions(tag, suggestions); };
	this._showRel = function(tag, related) { o.showRelated(tag, related); };
	this._textfield.addEventListener('keypress', function(event) { o.onKeyPress(event); }, false);
	this._textfield.addEventListener('keydown', function(event) { o.onKeyDown(event); }, false);
	this._textfield.addEventListener('keyup', function(event) { o.onKeyUp(event); }, false);
	this._textfield.addEventListener('input', function(event) { o.onInput(event); }, false);
	this._textfield.addEventListener('blur', function(event) { o._popup.timedHide(); }, false);
	this._textfield.addEventListener('focus', function(event) { o._popup.cancelHide(); }, false);
	this._listbox.addEventListener('focus', function(event) { o._textfield.focus(); }, false);
	this._listbox.addEventListener('click', function(event) { o.onClick(event); }, false);
};

AutoCompleter.prototype = {
	tag_classes: [
		'danbooru-tagtype-0',
		'danbooru-tagtype-0 danbooru-tagtype-1',
		'danbooru-tagtype-2',
		'danbooru-tagtype-0 danbooru-tagtype-3',
		'danbooru-tagtype-0 danbooru-tagtype-4',
	],
	ignoreKeypress: false,
	ignoreEnter: false,
	ctrlKey: false,

	// Listens on the list box for mouse events.
	onClick: function(event)
	{
		// Ignore clicks that don't hit a list item.
		var orgSource = this._popup.isClick(event);
		if (!orgSource)
			return;
		
		if (event.button == 2) {
			this._completer.openBrowserTab(orgSource.value);
		} else {
			this.replaceCurrentTag(orgSource.value);
			if (!event.ctrlKey)
				this.hidePopup();
			else
				this._popup.openPopup();
		}
	},

	// Listens on the text input field for keypress events.
	onKeyDown: function(event)
	{
		this.lastKeyCode = event.keyCode;
		if (event.keyCode == KeyEvent.DOM_VK_CONTROL)
			this.ctrlKey = true;
	},

	onKeyUp: function(event)
	{
		if (event.keyCode == KeyEvent.DOM_VK_CONTROL)
			this.ctrlKey = false;
	},

	onKeyPress: function(event)
	{
		if (this.ignoreKeypress)
			return;
		// Ignore enter events that come in too quick succession.
		if (this.lastKeyCode == KeyEvent.DOM_VK_RETURN && this.ignoreEnter > new Date()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}


		var lb = this._listbox;
		var moved = true;


		// Handle some keys for the autocomplete list.
		if (this._popup.state == 'open') {
			//switch (event.keyCode) {
			switch (this.lastKeyCode) {
				case KeyEvent.DOM_VK_UP:
					if (lb.selectedIndex == -1 || lb.selectedIndex == 0)
						lb.selectedIndex = lb.itemCount - 1;
					else
						lb.selectedIndex -= 1;
					break;
				case KeyEvent.DOM_VK_DOWN:
					if (lb.selectedIndex == -1 || lb.selectedIndex == lb.itemCount - 1)
						lb.selectedIndex = lb.itemCount ? 0 : -1;
					else
						lb.selectedIndex += 1;
					break;
				case KeyEvent.DOM_VK_PAGE_UP:
					if (lb.itemCount)
						lb.selectedIndex = Math.max(0, lb.selectedIndex - lb.getNumberOfVisibleRows());
					break;
				case KeyEvent.DOM_VK_PAGE_DOWN:
					lb.selectedIndex = Math.min(lb.itemCount - 1, lb.selectedIndex + lb.getNumberOfVisibleRows());
					break;

				case KeyEvent.DOM_VK_INSERT:
				case KeyEvent.DOM_VK_HELP:
				case KeyEvent.DOM_VK_E:
					if (this.lastKeyCode == KeyEvent.DOM_VK_E && !event.ctrlKey) {
						moved = false;
						break;
					}
					if (this._listbox.selectedIndex != -1) {
						this._completer.getRelated(this._listbox.selectedItem.value, this._showRel);
					} else {
						let cur_tag = this.getTagAtCursor();
						if (cur_tag)
							this._completer.getRelated(cur_tag, this._showRel);
					}
					break;

				case KeyEvent.DOM_VK_RETURN:
					if (lb.selectedIndex != -1)
						this.replaceCurrentTag(lb.selectedItem.value);
					if (!event.ctrlKey) {
						lb.selectedIndex = -1;
						this.hidePopup();
					}
					this.ignoreEnter = new Date();
					this.ignoreEnter.setMilliseconds(this.ignoreEnter.getMilliseconds() + 100);
					break;
				case KeyEvent.DOM_VK_ESCAPE:
					this.hidePopup();
					break;

				default:
					moved = false;
					break;
			}
			if (moved) {
				event.preventDefault();
				event.stopPropagation();
			}
			if (moved && lb.selectedIndex != -1) {
				lb.ensureIndexIsVisible(lb.selectedIndex);
				// Works around some weirdness with assignment to lb.selectedIndex
				lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
			}
		} else {
			//switch (event.keyCode) {
			switch (this.lastKeyCode) {
				case KeyEvent.DOM_VK_INSERT:
				case KeyEvent.DOM_VK_HELP:
				case KeyEvent.DOM_VK_E:
					if (this.lastKeyCode == KeyEvent.DOM_VK_E && !event.ctrlKey) {
						moved = false;
						break;
					}
					let cur_tag = this.getTagAtCursor();
					if (cur_tag)
						this._completer.getRelated(cur_tag, this._showRel);
					break;
				case KeyEvent.DOM_VK_DOWN:
					var tag = this.getTagAtCursor();
					this._completer.getSuggestions(tag ? tag : '', this._showSugg);
					this.openPopup();
					break;
				case KeyEvent.DOM_VK_SPACE:
					// Abort a autocomplete that may not have fired yet.
					this.hidePopup();
					moved = false;
					break;
				default:
					moved = false;
					break;
			}
		}
		if (moved) {
			event.preventDefault();
			event.stopPropagation();
		}
	},

	// Used when the enter press is intercepted elsewhere.
	// Returns true if the default action should be stopped.
	onEnter: function()
	{
		this.lastKeyCode = KeyEvent.DOM_VK_RETURN;
		ev = { stop: false, keyCode: KeyEvent.DOM_VK_RETURN, ctrlKey: this.ctrlKey,
			preventDefault: function() { this.stop = true; }, stopPropagation: function() {}
		};
		this.onKeyPress(ev);
		return ev.stop;
	},

	// Listens on the text input field for input (= potential autocompletion task)
	onInput: function(event)
	{
		var tag = this.getTagAtCursor();
		if (tag) {
			this._completer.getSuggestions(tag, this._showSugg);
			this.openPopup()
		} else if (this._popup.state == 'open') {
			this._popup.timedHide();
		}
	},

	// Called by the completer to deliver requested suggestions.
	showSuggestions: function(tag, suggestions)
	{
		var lb = this._listbox;
		var selected = (this._popup.state == 'open' && lb.selectedIndex != -1) ? lb.selectedItem.value : null;

		var newSelectedIndex = this._popup.insertTags(suggestions, '', selected, this.tag_classes, -1);
		//N

		this.openPopup();
		if (newSelectedIndex != -1) {
			// Preserve old selection if still found.
			lb.selectedIndex = newSelectedIndex;
			lb.ensureIndexIsVisible(lb.selectedIndex);
			// Works around weirdness /w assigning to selectedIndex
			lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
		} else if (suggestions.length > 0) {
			// If not, but the first tag is a partial match, select it.
			let cur_tag = this.getTagAtCursor();
			if (suggestions[0][0].length >= cur_tag.length && cur_tag == suggestions[0][0].substr(0, cur_tag.length)) {
				lb.selectedIndex = 0;
				// Works around weirdness /w assigning to selectedIndex
				lb.ensureIndexIsVisible(lb.selectedIndex);
				lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
			}
		} else {
			lb.selectedIndex = -1;
		}

	},

	// Called by the completer to deliver requested related tag information.
	showRelated: function(tag, related)
	{
		var lb = this._listbox;
		var position = -1;	// Where to insert
		// Find the instance of the tag closest to the cursor
		// (A tag can occur more than once if we've searched for related tags before.)
		if (this._popup.state == 'open') {
			let cur_pos = Math.max(lb.selectedIndex, 0);
			let closest = lb.itemCount;
			for (var i = 0; i < lb.itemCount; i++) {
				if (lb.getItemAtIndex(i).value == tag && Math.abs(i - cur_pos) < closest) {
					position = i;
					closest = Math.abs(i - cur_pos);
				}
			}
		}

		if (position == -1)
			// Either popup not open, or couldn't find tag in current list. So make new list.
			this.showSuggestions('', related);
		else {
			let item = lb.getItemAtIndex(position);
			// Add some indentation to whatever there were.
			let indent = this._popup.getIndent(position) + '\u00a0\u00a0';	// non-breaking space.

			// The requested tag is probably in there itself, filter it.
			this._popup.insertTags(related.filter(function(x) {return x[0] != tag;}), indent, null, this.tag_classes, position);

			lb.ensureIndexIsVisible(position);
			lb.selectedIndex = position;
			lb.selectedItem = lb.getItemAtIndex(position);
		}
	},

	// Make a document fragment with listitems for the given tags.
	makeListitems: function(tags, indent, search)
	{
		var tc = this.tag_classes;
		var frag = document.createDocumentFragment();
		var searchRes = -1;
		for (var i = 0; i < tags.length; i++) {
				let x = tags[i];
				let li = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'richlistitem');
				li.value = x[0];
				li.setAttribute('class', tc[x[1]] + (x[2] ? tc[2] : ''));
				li.label = indent ? indent + x[0] : x[0];
				let label = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'description');
				label.appendChild(document.createTextNode(li.label));
				li.appendChild(label);
				frag.appendChild(li);
				if (search === x[0] && searchRes === -1)
					searchRes = i;
		}

		return [frag, searchRes];
	},

	getTagBoundsAtCursor: function()
	{
	      if (this._textfield.selectionStart != this._textfield.selectionEnd)
		      return [-1, -1];

	      var v = this._textfield.value;
	      var from = this._textfield.selectionStart;
	      var to = from;

	      while (from > 0 && /\S/.test(v[from-1]))
		      from--;
	      while (to < v.length && /\S/.test(v[to]))
		      to++;
	      var tagPrefix = this._popup.tag_prefix.exec(v.slice(from, to));
	      if (tagPrefix) {
		      from += tagPrefix[0].length;
	      }
	      return [from, to];
	},

	// Get the tag the caret is currently positioned over, stripping tag prefixes, or an empty string.
	getTagAtCursor: function()
	{
		var from, to;
		[from, to] = this.getTagBoundsAtCursor();
		// Something is selected?
		if (from === -1)
		return '';

		var value = this._textfield.value.slice(from, to);
		if (this._popup.other_prefix.test(value))
			return '';
		else
			return value;
	},

	// Replace the tag the caret is currently positioned over, keeping tag prefixes.
	replaceCurrentTag: function(replacement)
	{
		var from, to;
		[from, to] = this.getTagBoundsAtCursor();
		if (from === -1)
			return;
		replacement += ' ';
		var v = this._textfield.value;
		this._textfield.value = v.slice(0, from) + replacement + v.slice(to);

		// Update caret position
		var newend = from + replacement.length;
		this._textfield.setSelectionRange(newend, newend);
		this._textfield.focus();

		// Ignore any simulated keypresses during scrolling.
		this.ignoreKeypress = true;
		// Scroll to caret position
		this._popup.scrollText(this._textfield);
		this.ignoreKeypress = false;
	},

	hidePopup: function()
	{
		this._popup.hidePopup();
		this._completer.abortSuggestion();
	},

	openPopup: function()
	{
		if (this._popup.state != 'open') {
			this._popup.openPopup();
			this._listbox.selectedIndex = -1;
		}
	}
};
