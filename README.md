# 🇩🇰 Copenhagen Editor

**Copenhagen** is a free, lightweight and hackable
open source code editor for the web. It's written entirely in vanilla JavaScript
with only [highlight.js](https://highlightjs.org/) and
[feather icons](https://feathericons.com) bundled as
dependencies.

![Copenhagen Demo](/readme/gallery/01.gif)

# Getting Started

To get started with Copenhagen, add `copenhagen.v0-3-0.min.css`
and `copenhagen.v0-3-0.min.js` to your web project.
You can find them in this repository.
Then import them to your webpage by adding the following lines in the
`<head>` tag of your webpage:

```html
<!-- Copenhagen Editor -->
<link rel="stylesheet" href="./compiled/copenhagen.v0-3-0.min.css">
<script src="./compiled/copenhagen.v0-3-0.min.js"></script>
```

You can then instantiate a new Editor adding the following JavaScript
within a `<script>` tag:

```javascript
// Use DOMContentLoaded or whatever instantiation code you'd like,
// just make sure the page is ready...
window.addEventListener('DOMContentLoaded', function () {

  // instantiated CPHEditor instance with config
  var editor = new Copenhagen.Editor({language: 'javascript'});

  // open, but do not auto-focus the editor
  editor.open(this.selector('.some-selector'), false);

  // set a value
  editor.setValue('var message = `hello world`;');

});
```

Alternatively, you can automatically convert all elements matching a
specific selector. This will automatically pass in config values
via `data-*` attributes on the HTML tag.

```html
<div class="editor" data-language="html" data-maxrows="20">
  // some code
</div>
```

```javascript
window.addEventListener('DOMContentLoaded', function () {
  var editors = Copenhagen.initSelectorAll('.editor');
});
```

# Hacking the Editor, Contributing

Hacking the editor and making updates is simple. We recommend you install the
Autocode command line tools to get started.

[Autocode CLI, stdlib/lib on Github](https://github.com/stdlib/lib/)

Once installed, you can run your own local instance of the Autocode HTTP gateway
using;

```
$ lib http
```

And then visit `http://localhost:3434/dev/raw/` or `http://localhost:3434/dev/min/`
to play with the raw or minified compiled version of the editor. You can change
the editor code via the `src/` directory in this repository.

## Compiling Copenhagen

**You can only compile the editor when running locally**, this is not available
via the Autocode web interface because live web services run a read-only filesystem.

To compile changes to a single script / css file, simply run:

```
$ lib .compile --filename script.js --min t --write t
$ lib .compile --filename style.css --min t --write t
```

You can remove the `--min t` flag if you want to compile the non-minified versions.
