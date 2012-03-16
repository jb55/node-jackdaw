(function() {
  var Client, Event, ex, os, raw, request, url, util, uuid, zlib, _;

  url = require('url');

  _ = require('underscore')._;

  uuid = require('node-uuid').v4;

  raw = require('raw-stacktrace');

  os = require('os');

  request = require('request');

  util = require('./util');

  zlib = require('zlib');

  (function() {
    var st;
    st = raw();
    return st.on('trace', function(err, callsites) {
      return err.callsites = callsites;
    });
  })();

  ex = module.exports;

  Event = (function() {

    function Event(opts) {
      if (opts == null) opts = {};
      this.event_id = opts.event_id || uuid().replace(/\-/g, "");
      if (opts.culprit) this.culprit = opts.culprit;
      if (opts.message) this.message = opts.message;
      if (opts.logger) this.logger = opts.logger;
      if (opts.level) this.level = opts.level;
      this.server_name = opts.serverName || os.hostname();
      this.timestamp = new Date().toISOString().split('.')[0];
    }

    Event.fromError = function(err, message, cb) {
      var event;
      event = new Event;
      if (!cb) {
        cb = message;
        message = null;
      }
      return event.error(err, function(e, frames) {
        if (frames && frames.length > 0) {
          event.culprit = util.buildCulprit(frames[0]);
        } else {
          if (!frames) event.culprit = "Unknown";
        }
        event.message = message || err.message;
        return cb && cb(null, event);
      });
    };

    Event.prototype.error = function(err, cb) {
      this.exception(err);
      this.stacktrace(err, cb);
      return this;
    };

    Event.prototype.stacktrace = function(err, cb) {
      var _this = this;
      util.buildStackTrace(err, function(err, frames) {
        if (err) return cb(err);
        _this.interface("Stacktrace", frames);
        return cb(null, frames);
      });
      return this;
    };

    Event.prototype.exception = function(err) {
      this.interface("Exception", util.buildException(err));
      return this;
    };

    Event.prototype.interface = function(name, data) {
      this["sentry.interfaces." + name] = data;
      return this;
    };

    return Event;

  })();

  Client = (function() {

    function Client(opts) {
      var projectId, public, secret, uri;
      if (opts == null) opts = {};
      if (typeof opts === 'string') {
        if (opts === "") throw new Error("Invalid DSN");
        opts = util.parseDsn(opts);
      }
      uri = opts.uri, public = opts.public, secret = opts.secret, projectId = opts.projectId;
      this.uri = uri;
      this.public = public;
      this.secret = secret;
      this.projectId = projectId;
      if (!this.uri || !this.public || !this.secret || !this.projectId) {
        throw new Error("Invalid configuration");
      }
    }

    Client.prototype.send = function(event, cb) {
      var json,
        _this = this;
      event.project = event.project || this.projectId;
      json = JSON.stringify(event);
      return zlib.deflate(json, function(err, buff) {
        var authHead, encoded, headers, sig, timestamp, uri;
        if (err) return cb(err);
        encoded = buff.toString('base64');
        timestamp = new Date().getTime();
        sig = util.makeSignature(timestamp, encoded, _this.secret);
        authHead = util.makeAuthHeader(sig, timestamp, _this.public, _this.projectId);
        headers = {
          'X-Sentry-Auth': authHead,
          'Content-Type': 'application/octet-stream',
          'Content-Length': encoded.length
        };
        uri = "" + _this.uri + "api/store/";
        return request({
          uri: uri,
          headers: headers,
          method: "POST",
          body: encoded
        }, function(err, resp, body) {
          return cb && cb(err, resp, body);
        });
      });
    };

    return Client;

  })();

  ex.Client = Client;

  ex.Event = Event;

  ex.util = util;

}).call(this);
