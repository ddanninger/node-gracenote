var GraceError = require('./GraceError'),
	request = require('request'),
	qs = require('querystring'),
	parseString = require('xml2js').parseString,
	cache = require('memory-cache'),
	extend = require('util')._extend,
	API_URL = 'https://c[[CLID]].web.cddbp.net/webapi/xml/1.0/';

module.exports = Gracenote;

function Gracenote(clientId, clientTag, userId, requestDefaults) {
	if (requestDefaults)
		request = request.defaults(requestDefaults);
	var me = this;
	if (clientId === null || typeof clientId === 'undefined' || clientId === '')
		throw new GraceError(GraceError.INVALID_INPUT_SPECIFIED, 'clientId');
    if (clientTag === null || typeof clientTag === 'undefined' || clientTag === '')
    	throw new Error(GraceError.INVALID_INPUT_SPECIFIED, 'clientTag');
    if (typeof userId === 'undefined' || userId === '') {
    	if (cache.get('Gracenote.userId')) {
    		userId = cache.get('Gracenote.userId');
    	}
    	else
    		userId = null;
    }

	this.clientId = clientId;
	this.clientTag = clientTag;
	this.userId = userId;
	this.apiURL = API_URL.replace('[[CLID]]', this.clientId);
	
	this._coverSize = 'MEDIUM';
	this._extendedData = 'COVER,REVIEW,ARTIST_BIOGRAPHY,ARTIST_IMAGE,ARTIST_OET,MOOD,TEMPO'; //COVER,REVIEW,ARTIST_BIOGRAPHY,ARTIST_IMAGE,ARTIST_OET,MOOD,TEMPO
	this._lang = null;
	
	this._execute = function(data, cb) {
		this._performRequest(data, function(error, response, body) {
			if (error) return cb(error);
			var xml = me._parseResponse(body, function(err, xml) {
				if (err) return cb(err);
				cb(null, xml);
			});
		});
	};
	
	this._constructQueryRequest = function(body, command) {
		if (command === null || typeof command === 'undefined' || command === '')
			command = 'ALBUM_SEARCH';
		
		return '<QUERIES>'+
            '<AUTH>'+
                '<CLIENT>' + this.clientId + '-' + this.clientTag + '</CLIENT>'+
                '<USER>' + this.userId + '</USER>'+
            '</AUTH>'+
            (this._lang ? '<LANG>'+this._lang+'</LANG>' : '') +
            '<QUERY CMD="' + command + '">'+
                body +
            '</QUERY>'+
        '</QUERIES>';
	};
	
	this._constructQueryBody = function(artist, album, track, gn_id, command, options) {
		if (command === null || typeof command === 'undefined' || command === '')
			command = 'ALBUM_SEARCH';
		
		if (typeof options === 'undefined' || options === null)
			options = {matchMode: Gracenote.ALL_RESULTS};
		else if (!options.hasOwnProperty('matchMode'))
			options = extend(options, {matchMode: Gracenote.ALL_RESULTS});

		var body = "";

        if (command === 'ALBUM_FETCH') {
            body += '<GN_ID>' + gn_id + '</GN_ID>';
        }
        else {
            if (options.matchMode === Gracenote.BEST_MATCH_ONLY) { body += '<MODE>SINGLE_BEST_COVER</MODE>'; }
            if (options.hasOwnProperty('range')) {
            	var range = options.range;
            	if (!range.hasOwnProperty('start') || !range.hasOwnProperty('end'))
            		throw new Error(GraceError.RANGE_NOT_VALID, 'clientTag');
            	body += '<RANGE><START>'+options.range.start+'</START><END>'+options.range.end+'</END></RANGE>'; 
            }
            	
            if (artist != "") { body += '<TEXT TYPE="ARTIST">' + artist + '</TEXT>'; }
            if (track != "")  { body += '<TEXT TYPE="TRACK_TITLE">' + track + '</TEXT>'; }
            if (album != "")  { body += '<TEXT TYPE="ALBUM_TITLE">' + album + '</TEXT>'; }
        }

        body += '<OPTION>'+
                      '<PARAMETER>SELECT_EXTENDED</PARAMETER>'+
                      '<VALUE>'+this._extendedData+'</VALUE>'+
                  '</OPTION>';

        body += '<OPTION>'+
                      '<PARAMETER>SELECT_DETAIL</PARAMETER>'+
                      '<VALUE>GENRE:3LEVEL,ARTIST_ORIGIN:4LEVEL,ARTIST_ERA:2LEVEL,ARTIST_TYPE:2LEVEL</VALUE>'+
                  '</OPTION>';

		// (LARGE,XLARGE,SMALL,MEDIUM,THUMBNAIL)
        body += '<OPTION>'+
                      '<PARAMETER>COVER_SIZE</PARAMETER>'+
                      '<VALUE>'+this._coverSize+'</VALUE>'+
                  '</OPTION>';

        return body;
	}
	
	this._checkResponse = function(response, cb) {
		response = this._formatXML(response);
		parseString(response, function (err, xml) {
			
			if (err !== null)
				throw new GraceError(GraceError.UNABLE_TO_PARSE_RESPONSE);
			
			var status = xml.RESPONSES.RESPONSE[0].$.STATUS;
			switch (status) {
	            case "ERROR":    throw new GraceError(GraceError.API_RESPONSE_ERROR, xml.RESPONSES.MESSAGE[0]); break;
	            case "NO_MATCH": throw new GraceError(GraceError.API_NO_MATCH); break;
	            default:
	                if (status !== "OK") { throw new GraceError(GraceError.API_NON_OK_RESPONSE, status); }
	        }
			
			cb(xml.RESPONSES);
		});
	}
	
	this._parseResponse = function(response, cb) {
		response = this._formatXML(response);
		parseString(response, function (err, xml) {
			if (err !== null)
				throw new GraceError(GraceError.UNABLE_TO_PARSE_RESPONSE);
			
			try {
				me._checkResponse(response, function() {
					var output = [],
						entries = xml.RESPONSES.RESPONSE[0].ALBUM;
					for (var i = 0; i < entries.length; i++) {
						var entry = entries[i];

						var obj = {
							"album_gnid": entry.GN_ID[0],
							'album_artist_name': entry.ARTIST[0],
				            'album_title': entry.TITLE[0],
							'album_year': '',
				            'genre': me._getOETElem(entry.GENRE),
				            'album_art_url': '',
				            'artist_image_url': '',
				            'artist_bio_url': '',
				            'review_url': ''
						};
						
						if (entry.DATE) {
							obj.album_year = entry.DATE[0]; 
						}
						
						if (entry.URL) {
				            obj.album_art_url = me._getAttribElem(entry.URL, "TYPE", "COVERART"),
				            obj.artist_image_url = me._getAttribElem(entry.URL, "TYPE", "ARTIST_IMAGE"),
				            obj.artist_bio_url = me._getAttribElem(entry.URL, "TYPE", "ARTIST_BIOGRAPHY"),
				            obj.review_url = me._getAttribElem(entry.URL, "TYPE", "REVIEW")
						}
						
						if (entry.ARTIST_ORIGIN) {
			                obj.artist_era = me._getOETElem(entry.ARTIST_ERA);
			                obj.artist_type = me._getOETElem(entry.ARTIST_TYPE);
			                obj.artist_origin = me._getOETElem(entry.ARTIST_ORIGIN);
			            }
						else {
							// NOT A GOOD APROACH TO ASK AN ASYNC CALL
							//me.fetchOETData(entry.GN_ID[0], function(data) {
							//	console.log("CALLBACK",data);
							//})
						}
						
						var tracks = [];
						if (entry.TRACK) {
							for (var x = 0; x < entry.TRACK.length; x++) {
				            	var t = entry.TRACK[x];
				                var track = {
			                		'track_number': t.TRACK_NUM[0],
					                'track_gnid': t.GN_ID[0],
					                'track_title': t.TITLE[0],
					                'mood': '',
					                'tempo': ''
				                };
				                
				                if (t.MOOD)
				                	track.mood = me._getOETElem(t.MOOD);
				                if (t.TEMPO)
				                	track.tempo = me._getOETElem(t.TEMPO)
	

				                if (!t.ARTIST) { 
				                	track.track_artist_name = obj.album_artist_name;
				                }
				                else {
				                	track.track_artist_name = t.ARTIST[0];
				                }
	
				                if (t.GENRE)
				                	obj.genre = me._getOETElem(t.GENRE);
				                if (t.ARTIST_ERA)
				                	obj.artist_era = me._getOETElem(t.ARTIST_ERA);
				                if (t.ARTIST_TYPE)
				                	obj.artist_type = me._getOETElem(t.ARTIST_TYPE);
				                if (t.ARTIST_ORIGIN)
				                	obj.artist_origin = me._getOETElem(t.ARTIST_ORIGIN);
	
				                tracks.push(track);
				            }
						}
						obj.tracks = tracks;
						output.push(obj);
					}
					
					cb(null, output);
				});
			}
			catch (err) {
				if (err.statusCode == GraceError.API_NO_MATCH)
					return cb(null, []);
				cb(err.message);
			}
		});
	}
	
	this._getAttribElem = function(root, attribute, value) {
		for (var i = 0; i < root.length; i++) {
			var r = root[i];
			
            if (r.$[attribute] == value) { return r._; }
        }
		return "";
	}
	
	this._getOETElem = function(root||{}) {
		if (root) {
			var out = [];
			for (var i = 0; i < root.length; i++) {
				var r = root[i];
				out.push({
					'id': r.$.ID,
	        		'text': r._,
	            });
	        }
	        return out;
		}
		return '';
	}
	
	this._performRequest = function(body, cb) {
		request({
		    url: this.apiURL,
		    body: body,
		    method: 'POST',
		    headers: {
		        'User-Agent': 'nodejs-gracenote'
		    }
		}, cb)
	},
	
	this._formatXML = function(response) {
		response = response.replace(/\r\n+|\r\n|\n+|\n|\s+|\s$/, '');
		return response;
	}
};


Gracenote.prototype.register = function(cb) {
	var me = this;
	
	if (this.userId !== null) {
        console.warn('Warning: You already have a userId, no need to register another. Using current ID.');
        return this.userId;
    }
	
	var data = '<QUERIES>'+
        '<QUERY CMD="REGISTER">'+
           '<CLIENT>' + this.clientId + '-' + this.clientTag + '</CLIENT>'+
        '</QUERY>'+
     '</QUERIES>';
	
	this._performRequest(data, function(error, response, body) {
		if (error) return cb(error);
		var xml = me._checkResponse(body, function(xml) {
			me.userId = xml.RESPONSE[0].USER[0];
			cache.put('Gracenote.userId',me.userId);
			cb(null, me.userId);
		});
	});
};

Gracenote.prototype.searchTrack = function(artistName, albumTitle, trackTitle, cb, options) {
	var body = this._constructQueryBody(artistName, albumTitle, trackTitle, "", "ALBUM_SEARCH", options),
    	data = this._constructQueryRequest(body);
    this._execute(data, cb);
};

Gracenote.prototype.searchArtist = function(artistName, cb, options) {
	this.searchTrack(artistName, "", "", cb, options);
};

Gracenote.prototype.searchAlbum = function(artistName, albumTitle, cb, options) {
	this.searchTrack(artistName, albumTitle, "", cb, options);
};

Gracenote.prototype.fetchAlbum = function(gn_id, cb) {
	var body = this._constructQueryBody("", "", "", gn_id, "ALBUM_FETCH");
    var data = this._constructQueryRequest(body, "ALBUM_FETCH");
    this._execute(data, cb);
};

Gracenote.prototype.setExtended = function(str) {
	this._extendedData = str; 
};

Gracenote.prototype.setLanguage = function(iso) {
	this._lang = iso; 
};

Gracenote.prototype.setCoverSize = function(size) {
	this._coverSize = size; 
};

Gracenote.prototype.fetchOETData = function(gn_id, cb) {
	var me = this;
    var body = '<GN_ID>' + gn_id +'</GN_ID>'+
             '<OPTION>'+
                 '<PARAMETER>SELECT_EXTENDED</PARAMETER>'+
                 '<VALUE>'+this._extendedData+'</VALUE>'+
             '</OPTION>'+
             '<OPTION>'+
                 '<PARAMETER>SELECT_DETAIL</PARAMETER>'+
                 '<VALUE>ARTIST_ORIGIN:4LEVEL,ARTIST_ERA:2LEVEL,ARTIST_TYPE:2LEVEL</VALUE>'+
             '</OPTION>';

    var data = this._constructQueryRequest(body, 'ALBUM_FETCH');
    this._performRequest(data, function(error, response, body) {
		if (error) return cb(error);
	    me._checkResponse(body, function(xml) {
			var output = {
	    		'artist_origin': (xml.RESPONSE[0].ALBUM[0].ARTIST_ORIGIN[0]) ? me._getOETElem(xml.RESPONSE[0].ALBUM[0].ARTIST_ORIGIN[0]) : "",
				'artist_era': (xml.RESPONSE[0].ALBUM[0].ARTIST_ERA[0]) ? me._getOETElem(xml.RESPONSE[0].ALBUM[0].ARTIST_ERA[0]) : "",
	    	    'artist_type': (xml.RESPONSE[0].ALBUM[0].ARTIST_TYPE[0]) ? me._getOETElem(xml.RESPONSE[0].ALBUM[0].ARTIST_TYPE[0]) : ""
	    	}
			cb(null, output);
	    });
    });
};

Gracenote.prototype.albumToc = function(toc, cb) {
	var body = '<TOC><OFFSETS>' + toc + '</OFFSETS></TOC>';
    var data = this._constructQueryRequest(body, "ALBUM_TOC");
    this._execute(data, cb);
};


Gracenote.BEST_MATCH_ONLY = 0;
Gracenote.ALL_RESULTS = 1;
