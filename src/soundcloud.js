(function(root, factory) {
    'use strict';

    /* CommonJS */
    if (typeof exports !== 'undefined') {
        module.exports = factory();

        var $ = require('jquery');
        factory(root, $);
    }

    /* AMD module */
    else if (typeof define === 'function' && define.amd) {
        define(['jquery'], function($) {
            return factory(root, $);
        });
    }

    /* Browser global */
    else {
        root.soundCloudPlayer = factory(root, (root.jQuery || root.$));
    }
}(this, function(root, $) {
    'use strict';

    return (function(root, $) {
        /**
         * Playlist url to get tracks, output in json
         * @const {string}
         */
        var PLAYLIST_URL = 'http://api.soundcloud.com/resolve?url=https://soundcloud.com/{username}/sets/{playlist}&format=json&consumer_key={consumerKey}&callback=?';

        /**
         * Transparent pixel
         * @type {string}
         */
        var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

        /**
         * Active or not debugging
         * @type {boolean}
         */
        var debug = false;

        /**
         * Stack all instantiate players
         * @type {Object}
         */
        var players = {};

        /**
         * Keep players total number
         * @type {number}
         */
        var playersLength = 0;

        /**
         * Add a new player
         * @param options {Object}
         */
        var addPlayer = function(options) {
            if (debug) {
                console.log('soundCloudPlayer.addPlayer', options);
            }

            options.id = 'player-' + playersLength;

            utils.domExtend();

            utils.getTracks(options, function(err, json) {
                if (debug) {
                    console.log('soundCloudPlayer.scp:err', err);
                    console.log('soundCloudPlayer.scp:json', json);
                }

                if (err) {
                    throw new Error('Error on loading playlist : ' + err);
                }

                if (json.tracks.length === 0) {
                    throw new Error('No tracks in your playlist');
                }

                playersLength++;
                players[options.id] = new Scp(options, json);
            });

            return options.id;
        };

        /**
         * @constructor
         */
        var Scp = function(options, json) {
            if (debug) {
                console.log('soundCloudPlayer.scp', options);
            }

            this.player = new Player(this, options, json);
        };

        /**
         * Player internal vars
         * @type {Object}
         */
        var Player = function(parent, options, json) {
            this.nativeHTML5 = new NativeHTML5(this);
            this.flash = new Flash(this);
            this.parent = parent;
            this.create(options, json);
        };

        Player.prototype = {
            parent: null,
            options: {
                allowFullscreen: true,
                showSoundCloudLogo: false,
                showProgressIndicator: true
            },
            tracks: [],
            audioHTML5: false,
            isFullscreen: false,
            audio: null,
            $body: $(),
            $audioFlash: $(),
            $container: $(),
            $title: $(),
            $picture: $(),
            $timeLine: $(),
            $progressBar: $(),
            $progressBarText: $(),
            $play: $(),
            $prev: $(),
            $next: $(),
            $shuffle: $(),
            $fullScreen: $(),
            $playerFullScreen: $(),
            action: null, // playing | paused
            type: '', // NativeHTML5 | Flash
            oldTrack: 0,
            currentTrack: 0,
            status: 'closed'
        };

        Player.prototype.actions = {
            PLAYING: 'playing',
            PAUSED: 'paused'
        };

        /**
         * Create the player
         */
        Player.prototype.create = function(options, json) {
            if (debug) {
                console.log('soundCloudPlayer.player.create');
            }

            var self = this;
            this.$body = $('body');
            this.options = $.extend(this.options, options);
            this.tracks = json.tracks;
            this.id = options.id;
            this.audioHTML5 = this.testMP3();
            this.buildHTML();
            this.isFullscreen = this.testFullscreen();
            this.bind();

            if (this.audioHTML5) {
                this.type = 'nativeHTML5';

                this.audio = document.createElement('audio');

                if(this.options.showProgressIndicator) {
                    $(this.audio).on('timeupdate', function() {
                        self.progressBar(this.currentTime, this.duration);
                    });
                }

                $(this.audio).on('ended', function() {
                    self.next();
                });

                var $parentPicture = this.$picture.parent();

                $(this.audio).on('play', function() {
                    $parentPicture.addClass('loading');
                });

                $(this.audio).on('pause', function() {
                    $parentPicture.removeClass('loading');
                });

                $(this.audio).on('playing', function() {
                    $parentPicture.removeClass('loading');
                });

                this.setNewTrack(this.currentTrack);

                this.$body.append(this.audio);

                if (debug) {
                    console.log('soundCloudPlayer.player.audio', this.audio);
                }
            } else {
                this.type = 'flash';

                var div = document.createElement('div');
                this.$audioFlash = $(div);
                this.$audioFlash.prop('id', 'jplayer-' + this.id);
                this.$body.append(this.$audioFlash);

                utils.handleJplayer(this.options.jPlayer, function() {
                    self.$audioFlash.jPlayer({
                        ready: function() {
                            self.$audioFlash.on($.jPlayer.event.timeupdate, function(e) {
                                self.progressBar(e.jPlayer.status.currentTime, e.jPlayer.status.duration);
                            });
                            self.$audioFlash.on($.jPlayer.event.ended, function() {
                                self.next();
                            });
                            self.setNewTrack(self.currentTrack);
                        },
                        swfPath: options.swfPath || '/swf/'
                    });
                });
            }
        };

        Player.prototype.buildHTML = function() {
            var html = '<div id="' + this.id + '" class="scp">' +
                '<div class="scp-picture"><img src="" width="100" height="100" class=""></div>' +
                '<div class="scp-content">' +
                '<p class="scp-content-title"></p>' +
                '<div class="scp-content-commands">' +
                '<a href="#" class="scp-prev">prev</a>' +
                '<a href="#" class="scp-play">play</a>' +
                '<a href="#" class="scp-next">next</a>' +
                '<a href="#" class="scp-shuffle">shuffle</a>' +
                '</div>';

            if(this.options.showProgressIndicator) {
                html += '<span class="scp-content-timeline">' +
                        '<span class="scp-content-timeline-bar"></span>' +
                        '<span class="scp-content-timeline-text"></span>' +
                        '</span>';
            }

            if(this.options.allowFullscreen) {
                html += '<a href="#" class="scp-fullscreen">fullscreen</a>';
            }

            if(this.options.showSoundCloudLogo) {
                html += '<a class="scp-content-logo" href="#" title="Listen on SoundCloud" target="_blank">SoundCloud.com</a>';
            }

            html += '</div></div>';

            this.$container = $(html);
            this.$body.append(this.$container);

            // create fullscreen
            if (this.options.allowFullscreen) {
                var $FS = $('#player-fullscreen');

                if (!$FS.length) {
                    this.$body.append('<div id="player-fullscreen"><div class="player-fullscreen-inner"><p class="player-fullscreen-title"></p><img src="' + PIXEL + '" class="player-fullscreen-picture"><p class="player-fullscreen-commands"><a href="#" class="player-fullscreen-prev">Prev</a><a href="#" class="player-fullscreen-next">Next</a></p><a href="#" class="player-fullscreen-close">Close</a></div></div>');
                    this.$playerFullScreen = $('#player-fullscreen');
                } else {
                    this.$playerFullScreen = $FS;
                }
            }
        };

        /**
         * Test if audio tag with MP3 is supported
         * @returns {boolean}
         */
        Player.prototype.testMP3 = function() {
            var testAudio = document.createElement('audio');
            var canPlayMp3 = !!testAudio.canPlayType && '' !== testAudio.canPlayType('audio/mpeg');

            if (debug) {
                console.log('soundCloudPlayer.player.testMP3', canPlayMp3);
            }

            return canPlayMp3;
        };

        /**
         * Test if fullscreen API is supported
         * @returns {boolean}
         */
        Player.prototype.testFullscreen = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.testFullscreen');
            }

            if (!this.options.allowFullscreen) {
                return false;
            }

            return !!this.$body[0].requestFullScreen || !!this.$body[0].webkitRequestFullScreen || !!this.$body[0].mozRequestFullScreen || !!this.$body[0].msRequestFullScreen || !!this.$body[0].oRequestFullScreen;
        };

        /**
         * Bind HTML tags
         */
        Player.prototype.bind = function() {
            var self = this;

            if (debug) {
                console.log('soundCloudPlayer.player.bind', this.$container);
            }

            // Title
            this.$title = this.$container.find('.scp-content-title');

            // Picture
            this.$picture = this.$container.find('.scp-picture img');

            // Progress bar
            this.$timeLine = this.$container.find('.scp-content-timeline');
            this.$progressBar = this.$container.find('.scp-content-timeline-bar');
            this.$progressBarText = this.$container.find('.scp-content-timeline-text');

            // Logo
            this.$logo = this.$container.find('.scp-content-logo');

            // Commands
            this.$play = this.$container.find('.scp-play');
            this.$prev = this.$container.find('.scp-prev');
            this.$next = this.$container.find('.scp-next');
            this.$shuffle = this.$container.find('.scp-shuffle');
            this.$fullScreen = this.$container.find('.scp-fullscreen');

            // Bind play button
            this.$play.on('click', function(e) {
                e.preventDefault();

                self.toggle();
            });

            // Bind prev button
            this.$prev.on('click', function(e) {
                e.preventDefault();

                self.prev();
            });

            // Bind next button
            this.$next.on('click', function(e) {
                e.preventDefault();

                self.next();
            });

            // Bind shuffle button
            this.$shuffle.on('click', function(e) {
                e.preventDefault();

                self.shuffle();
            });

            // Bind fullscreen button
            this.$fullScreen.on('click', function(e) {
                e.preventDefault();

                self.fullscreen();
            });

            // Bind click on timeline
            this.$timeLine.on('click', function(e) {
                e.preventDefault();

                var containerWidth = jQuery(this).outerWidth();
                var containerLeft = jQuery(this).offset().left;
                var mouseLeft = e.pageX;
                var newPosition = self.getDuration() * (mouseLeft - containerLeft) / containerWidth;
                self.setCurrentTime(newPosition);
            });

            // Bind fullscreen events
            if (this.options.allowFullscreen) {
                (function installFullscreenEvents() {
                    var e, change;

                    // Determine event name
                    e = document;
                    if (e.webkitCancelFullScreen) {
                        change = 'webkitfullscreenchange';
                    } else if (e.mozCancelFullScreen) {
                        change = 'mozfullscreenchange';
                    } else {
                        change = 'fullscreenchange';
                    }

                    // Install the event handlers
                    jQuery(document).on(change, function(e) {
                        self.fullscreenExit(e);
                    });
                })();

                // Bind fullscreen commands
                this.$playerFullScreen.find('.player-fullscreen-prev').on('click', function(e) {
                    e.preventDefault();

                    self.prev();
                });

                this.$playerFullScreen.find('.player-fullscreen-next').on('click', function(e) {
                    e.preventDefault();

                    self.next();
                });

                this.$playerFullScreen.find('.player-fullscreen-playpause').on('click', function(e) {
                    e.preventDefault();

                    self.toggle();
                });

                this.$playerFullScreen.find('.player-fullscreen-close').on('click', function(e) {
                    e.preventDefault();

                    self.exitFullscreen();
                });
            }
        };

        /**
         * Load a new playlist
         * @param playList {String}
         * @param callback {Function}
         */
        Player.prototype.loadPlaylist = function(playList, callback) {
            if (debug) {
                console.log('soundCloudPlayer.player.loadPlaylist', playList);
            }

            var self = this;

            this.options.playlist = playList;

            utils.getTracks(this.options, function(err, json) {
                if (debug) {
                    console.log('soundCloudPlayer.scp:err', err);
                    console.log('soundCloudPlayer.scp:json', json);
                }

                if (err) {
                    throw new Error('Error on loading playlist : ' + err);
                }

                if (json.tracks.length === 0) {
                    throw new Error('No tracks in your playlist');
                }

                self.tracks = json.tracks;
                self.oldTrack = self.currentTrack = 0;
                self.setNewTrack(self.currentTrack, false);

                return (callback) ? callback() : true;
            });
        };

        /**
         * Set new time
         * @param time {int}
         * @returns {*}
         */
        Player.prototype.setCurrentTime = function(time) {
            if (debug) {
                console.log('soundCloudPlayer.player.setCurrentTime', time);
            }

            return this[this.type].setCurrentTime(time);
        };

        /**
         * Get total duration
         * @returns {*}
         */
        Player.prototype.getDuration = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.getDuration');
            }

            return this[this.type].getDuration();
        };

        /**
         * Set new track on audio tag
         * @param index {int}
         */
        Player.prototype.setSound = function(index) {
            if (debug) {
                console.log('soundCloudPlayer.player.setSound', index);
            }

            return this[this.type].setSound(index);
        };

        /**
         * Play the sound
         * @returns {*|void}
         */
        Player.prototype.play = function(forcePlay, index, playlist) {
            if (debug) {
                console.log('soundCloudPlayer.player.play', index);
            }

            var self = this;

            var doPlay = function() {
                if (typeof index !== 'undefined' && index !== null && self.currentTrack !== index) {
                    self.currentTrack = index;
                    self.setNewTrack(self.currentTrack, false);
                }

                self.action = self.actions.PLAYING;

                self.$play.addClass('scp-pause');
                self.$playerFullScreen.find('.player-fullscreen-playpause').removeClass('player-fullscreen-play player-fullscreen-pause').addClass('player-fullscreen-pause');

                return self[self.type].play();
            };

            if (playlist && this.options.playlist !== playlist) {
                this.loadPlaylist(playlist, function() {
                    doPlay();
                });
            } else {
                doPlay();
            }
        };

        /**
         * Pause the sound
         * @returns {*|void}
         */
        Player.prototype.pause = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.pause');
            }

            this.action = this.actions.PAUSED;

            this.$play.removeClass('scp-pause');
            this.$playerFullScreen.find('.player-fullscreen-playpause').removeClass('player-fullscreen-play player-fullscreen-pause').addClass('player-fullscreen-play');

            return this[this.type].pause();
        };

        /**
         * Play or pause the sound
         * @returns {*|void}
         */
        Player.prototype.toggle = function(index, playlist) {
            if (debug) {
                console.log('soundCloudPlayer.player.toggle', playlist);
            }

            if ((this.action === this.actions.PAUSED) || (index && (this.currentTrack !== index)) || (playlist && (this.options.playlist !== playlist))) {
                // Play
                this.play(false, index, playlist);
            } else if (this.action === this.actions.PLAYING) {
                // Pause
                this.pause();
            }
        };

        /**
         * Go to the next track
         */
        Player.prototype.next = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.next');
            }

            this.currentTrack = this.currentTrack + 1;

            // If we reach the last track, go to the first
            if (this.currentTrack >= this.tracks.length) {
                this.currentTrack = 0;
            }

            this.setNewTrack(this.currentTrack, true);
        };

        /**
         * Go to the previous track
         */
        Player.prototype.prev = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.prev');
            }

            this.currentTrack = this.currentTrack - 1;

            // If we reach the first track, go to the last
            if (this.currentTrack < 0) {
                this.currentTrack = this.tracks.length - 1;
            }

            this.setNewTrack(this.currentTrack, true);
        };

        /**
         * Play new track
         * @param index {int}
         * @param play {boolean}
         */
        Player.prototype.setNewTrack = function(index, play) {
            if (debug) {
                console.log('soundCloudPlayer.player.setNewTrack', index, play);
            }

            var self = this;

            this.pause();
            this.setSound(index);

            var soundcloudFormatsIndex = 0;
            var soundcloudFormats = ['-t500x500', '-crop', '-t300x300'];

            var checkPicture = function(_picture, callback) {
                if (debug) {
                    console.log('soundCloudPlayer.player.setNewTrack.checkPicture', _picture);
                }

                soundcloudFormatsIndex++;

                var load = new Image();
                $(load).on('load error', function(e) {
                    return callback(e.type, _picture);
                });
                load.src = _picture;
            };

            // Update title
            var title = self.tracks[index].title;
            if (title) {
                self.$title.html(title);

                if (this.options.allowFullscreen) {
                    this.$playerFullScreen.find('.player-fullscreen-title').html(title);
                }
            }

            // Update picture
            var picture = this.tracks[index].artwork_url;
            var avatar;
            if (!picture) {
                // If no picture, get avatar user
                avatar = this.tracks[index].user.avatar_url;
                if (avatar) {
                    this.setNoPicture(false);
                    this.$picture.prop('src', avatar);

                    if (this.options.allowFullscreen) {
                        this.$playerFullScreen.find('.player-fullscreen-picture').prop('src', avatar);
                    }
                } else {
                    // If no avatar either
                    this.setNoPicture(true);
                }
            } else {
                self.setNoPicture(false);
                self.$picture.prop('src', picture);

                var done = function(_picture) {
                    self.$playerFullScreen.find('.player-fullscreen-picture').prop('src', _picture);
                };

                var process = function(type, _picture) {
                    if (type === 'load') {
                        done(_picture);
                    } else {
                        // Load picture error, try another format
                        if (soundcloudFormatsIndex < soundcloudFormats.length) {
                            var testPicture = picture.replace('-large', soundcloudFormats[soundcloudFormatsIndex]);
                            checkPicture(testPicture, process);
                        } else {
                            // No big pictures availables, use default
                            done(picture);
                        }
                    }
                };

                // Try to load the 500x500 for fullscreen view
                if (self.options.allowFullscreen) {
                    var picture500 = picture.replace('-large', soundcloudFormats[soundcloudFormatsIndex]);
                    checkPicture(picture500, process);
                }
            }

            // Update link
            var link = this.tracks[index].permalink_url;
            if (link) {
                this.$logo.prop('href', link);
            }

            if (play) {
                this.play(true);
            }
        };

        /**
         * Change player layout if no picture
         * @param action {boolean}
         */
        Player.prototype.setNoPicture = function(action) {
            if (debug) {
                console.log('soundCloudPlayer.player.setNoPicture', action);
            }

            if (action) {
                this.$container.addClass('scp-no-picture');
                this.$picture.prop('src', PIXEL);
            } else {
                this.$container.removeClass('scp-no-picture');
            }
        };

        /**
         * Play sound randomly
         */
        Player.prototype.shuffle = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.shuffle');
            }

            var random = Math.random2(0, this.tracks.length-1);

            if (random === this.currentTrack) {
                return this.shuffle();
            }

            this.oldTrack = this.currentTrack;
            this.currentTrack = random;

            this.setNewTrack(random, true);
        };

        /**
         * Launch fullscreen
         */
        Player.prototype.fullscreen = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.fullscreen');
            }

            if (this.isFullscreen) {
                this.$playerFullScreen.show();
                this.enterFullscreen.call(this.$playerFullScreen[0]);
            } else {
                this.$playerFullScreen.fadeIn();
            }
        };

        /**
         * Function call on exit fullscreen
         */
        Player.prototype.fullscreenExit = function(e) {
            if (debug) {
                console.log('soundCloudPlayer.player.fullscreenExit', e);
            }

            var isFullscreen = function() {
                return document.webkitIsFullScreen || document.mozFullScreen || document.fullScreen;
            };

            if (!isFullscreen()) {
                this.$playerFullScreen.hide();
            }
        };

        /**
         * Enter fullscreen mode
         */
        Player.prototype.enterFullscreen = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.enterFullscreen');
            }

            if (this.requestFullScreen) {
                this.requestFullScreen();
            } else if (this.webkitRequestFullScreen) {
                this.webkitRequestFullScreen();
            } else if (this.mozRequestFullScreen) {
                this.mozRequestFullScreen();
            }
        };

        /**
         * Exit fullscreen mode
         */
        Player.prototype.exitFullscreen = function() {
            if (debug) {
                console.log('soundCloudPlayer.player.exitFullscreen');
            }

            if (this.isFullscreen) {
                if (document.cancelFullScreen) {
                    document.cancelFullScreen();
                } else if (document.webkitCancelFullScreen) {
                    document.webkitCancelFullScreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                }
            } else {
                this.$playerFullScreen.fadeOut();
            }
        };

        /**
         * Update the progress bar
         * @param currentTime {int}
         * @param totalTime {int}
         */
        Player.prototype.progressBar = function(currentTime, totalTime) {
            if (debug) {
                console.log('soundCloudPlayer.player.progressBar');
            }

            if (!this.options.showProgressIndicator) {
                return false;
            }

            var timeFormatted = utils.formatSecondsAsTime(Math.floor(currentTime));

            this.$progressBar.width((100 * currentTime / totalTime) + '%');
            this.$progressBarText.html(timeFormatted);
        };

        /**
         * NativeHTML5 (html5) audio support
         * @type {Object}
         */
        var NativeHTML5 = function(parent) {
            this.parent = parent;
        };

        NativeHTML5.prototype = {
            parent: null
        };

        /**
         * Native HTML5 audio play
         * @returns {*|void}
         */
        NativeHTML5.prototype.play = function() {
            if (debug) {
                console.log('soundCloudPlayer.nativeHTML5.play');
            }

            return this.parent.audio.play();
        };

        /**
         * Native HTML5 audio pause
         * @returns {*}
         */
        NativeHTML5.prototype.pause = function() {
            if (debug) {
                console.log('soundCloudPlayer.nativeHTML5.pause');
            }

            return this.parent.audio.pause();
        };

        /**
         * Native HTML5 Set new track on audio tag
         * @param index {int}
         */
        NativeHTML5.prototype.setSound = function(index) {
            if (debug) {
                console.log('soundCloudPlayer.nativeHTML5.setSound', index);
            }

            $(this.parent.audio).prop('src', this.parent.tracks[this.parent.currentTrack].stream_url + '?client_id=' + this.parent.options.consumerKey);
        };

        /**
         * Native HTML5 Set new time
         * @param time {int}
         */
        NativeHTML5.prototype.setCurrentTime = function(time) {
            if (debug) {
                console.log('soundCloudPlayer.nativeHTML5.setCurrentTime', time);
            }

            this.parent.audio.currentTime = time;
        };

        /**
         * Native HTML5 Get total duration
         * @returns {int}
         */
        NativeHTML5.prototype.getDuration = function() {
            if (debug) {
                console.log('soundCloudPlayer.nativeHTML5.getDuration');
            }

            return this.parent.audio.duration;
        };

        /**
         * Flash audio support
         * @type {Object}
         */
        var Flash = function(parent) {
            this.parent = parent;
        };

        Flash.prototype = {
            parent: null
        };

        /**
         * Flash audio play
         */
        Flash.prototype.play = function() {
            if (debug) {
                console.log('soundCloudPlayer.flash.play');
            }

            this.parent.$audioFlash.jPlayer('play');
        };

        /**
         * Flash audio pause
         */
        Flash.prototype.pause = function() {
            if (debug) {
                console.log('soundCloudPlayer.flash.pause');
            }

            this.parent.$audioFlash.jPlayer('pause');
        };

        /**
         * Set new track jPlayer
         * @param index {int}
         */
        Flash.prototype.setSound = function(index) {
            if (debug) {
                console.log('soundCloudPlayer.flash.setSound', index);
            }

            this.parent.$audioFlash.jPlayer('setMedia', {
                mp3: this.parent.tracks[this.parent.currentTrack].stream_url + '?client_id=' + this.parent.options.consumerKey
            });
        };

        /**
         * Native HTML5 Set new time
         * @param time {int}
         */
        Flash.prototype.setCurrentTime = function(time) {
            if (debug) {
                console.log('soundCloudPlayer.flash.setCurrentTime', time);
            }

            this.parent.$audioFlash.jPlayer('play', time);
        };

        /**
         * Native HTML5 Get total duration
         * @returns {int}
         */
        Flash.prototype.getDuration = function() {
            if (debug) {
                console.log('soundCloudPlayer.flash.getDuration');
            }

            return this.parent.$audioFlash.data('jPlayer').status.duration;
        };

        /**
         * Utils methods
         * @type {Object}
         */
        var utils = {
            /**
             * Load a javascript file the return callback if exist
             * @param url {String}
             * @param callback {Function}
             * @returns {Function}
             */
            loadScript: function(url, callback) {
                if (debug) {
                    console.log('soundCloudPlayer.utils.loadScript', url);
                }

                var r = false;
                var script = document.createElement('script');
                script.src = url;
                script.onload = script.onreadystatechange = function() {
                    if (!r && (!this.readyState || this.readyState === 'complete' || this.readyState === 'loaded')) {
                        r = true;
                        return (callback) ? callback() : true;
                    }
                };

                var scripts = document.getElementsByTagName('script')[0];
                scripts.parentNode.insertBefore(script, scripts);
            },
            /**
             * Check if jPlayer is loaded
             * @param url {String}
             * @param callback {Function}
             * @returns {Function}
             */
            handleJplayer: function(url, callback) {
                if (debug) {
                    console.log('soundCloudPlayer.utils.handleJplayer');
                }

                if (typeof jPlayer === 'undefined') {
                    this.loadScript(url, function() {
                        if (debug) {
                            console.log('soundCloudPlayer.utils.handleJplayer:jPlayer loaded');
                        }

                        return (callback) ? callback() : true;
                    });
                } else {
                    if (debug) {
                        console.log('soundCloudPlayer.utils.handleJplayer:jPlayer is already loaded');
                    }

                    return (callback) ? callback() : true;
                }
            },
            /**
             * Build the playlist url according user name, playlist name and consumerKey (http://soundcloud.com/you/apps > 'Client ID')
             * @returns {String}
             */
            buildPlaylistURL: function(options) {
                if (debug) {
                    console.log('soundCloudPlayer.utils.buildPlaylistURL');
                }

                var ret;

                ret = PLAYLIST_URL.replace('{username}', options.username);
                ret = ret.replace('{playlist}', options.playlist);
                ret = ret.replace('{consumerKey}', options.consumerKey);

                if (debug) {
                    console.log('soundCloudPlayer.utils.buildPlaylistURL:url builded', ret);
                }

                return ret;
            },
            /**
             * Get tracks from PLAYLIST_URL
             * @param options {Object}
             * @param callback {Function}
             * @returns {Function}
             */
            getTracks: function(options, callback) {
                if (debug) {
                    console.log('soundCloudPlayer.utils.getTracks', options);
                }

                var url = this.buildPlaylistURL(options);

                $.ajax({
                    dataType: 'json',
                    url: url,
                    success: function(data) {
                        // test if tracks are streamable
                        for (var i = 0; i < data.tracks.length; i++) {
                            if (!data.tracks[i].streamable) {
                                if (debug) {
                                    console.log('soundCloudPlayer.utils.getTracks:warning - tracks number "' + i + '", title "' + data.tracks[i].title + '" is not streamable: removed');
                                }

                                data.tracks.splice(i, 1);
                                data.track_count--;
                            }
                        }
                        // test number of tracks
                        if (data.tracks.length === 0) {
                            if (debug) {
                                console.log('soundCloudPlayer.utils.getTracks:error - no track in this playlist');
                                return (callback) ? callback('no track in this playlist', null) : true;
                            }
                        }

                        if (debug) {
                            console.log('soundCloudPlayer.utils.getTracks:success');
                        }

                        return (callback) ? callback(null, data) : true;
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        if (debug) {
                            console.log('soundCloudPlayer.utils.getTracks:error', textStatus, errorThrown);
                        }

                        return (callback) ? callback(errorThrown, null) : true;
                    }
                });
            },
            /**
             * We extend the DOM for useful function
             */
            domExtend: function(){
                if (!Array.prototype.random) {
                    Array.prototype.random = function() {
                        return this[Math.random2(0, this.length - 1)];
                    };
                }

                if (!Math.random2) {
                    Math.random2 = function(min, max) {
                        return Math.floor(Math.random() * (max - min + 1)) + min;
                    };
                }
            },
            /**
             * Return min:sec from seconds
             * @param secs
             * @returns {string}
             */
            formatSecondsAsTime: function(secs) {
                var hr = Math.floor(secs / 3600);
                var min = Math.floor((secs - (hr * 3600)) / 60);
                var sec = Math.floor(secs - (hr * 3600) - (min * 60));

                if (min < 10) {
                    min = '0' + min;
                }
                if (sec < 10) {
                    sec = '0' + sec;
                }

                return min + ':' + sec;
            }
        };

        return {
            addPlayer: addPlayer
        };
    })(root, $);
}));