node-gracenote
==============

A node.js wrapper for the Gracenote API - https://developer.gracenote.com

# Functions

## Register

```
var Gracenote = require("./lib/Gracenote.js");
var clientId = "XXX";
var clientTag = "YYY";
var userId = null;
var api = new Gracenote(clientId,clientTag,userId);
api.register(function(uid) {
	// store this somewhere for the next session
})`;
```

## Search For Track

```
var Gracenote = require("./lib/Gracenote.js");
var clientId = "XXX";
var clientTag = "YYY";
var userId = "ZZZ";
var api = new Gracenote(clientId,clientTag,userId);
api.searchTrack("Kings of Leon", "Only by the Night", "Sex on fire", function(result) {
	// Search Result as array
});
```

## Search for Artist

```
var Gracenote = require("./lib/Gracenote.js");
var clientId = "XXX";
var clientTag = "YYY";
var userId = "ZZZ";
var api = new Gracenote(clientId,clientTag,userId);
api.searchArtist("Kings of Leon", function(result) {
	// Search Result as array
});
```

h2. Search for Album

```
var Gracenote = require("./lib/Gracenote.js");
var clientId = "XXX";
var clientTag = "YYY";
var userId = "ZZZ";
var api = new Gracenote(clientId,clientTag,userId);
api.searchAlbum("Kings of Leon", "Only by the Night", function(result) {
	// Search Result as array
});
```
