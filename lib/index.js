(function() {
  var Client, Event, ex, os, raw, url, uuid, _;

  url = require('url');

  _ = require('underscore')._;

  uuid = require('node-uuid').v4;

  raw = require('raw-stacktrace');

  os = require('os');

  (function() {
    var trace;
    trace = raw();
    return trace.on('trace', function(err, callsites) {
      return err.callsites = callsites;
    });
  })();

  ex = module.exports;

  ex.parseDsn = function(dsn) {
    var auth, hasProjectId, hostname, parsedPath, path, pathname, projectId, protocol, publicKey, secretKey, _ref, _ref2;
    _ref = url.parse(dsn), hostname = _ref.hostname, pathname = _ref.pathname, protocol = _ref.protocol, auth = _ref.auth;
    _ref2 = auth.split(':'), publicKey = _ref2[0], secretKey = _ref2[1];
    parsedPath = pathname.split('/');
    if (parsedPath.length === 0) throw new Error('Project id missing from dsn');
    projectId = +parsedPath.pop();
    if (isNaN(projectId)) throw new Error('Project id is not a number');
    path = parsedPath.join('/');
    hasProjectId = projectId != null;
    if (!hasProjectId) path = "";
    if (!hasProjectId) projectId = path;
    return {
      uri: "" + (protocol || 'http') + "//" + hostname + "/" + path,
      publicKey: publicKey,
      secretKey: secretKey,
      projectId: projectId
    };
  };

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
        if (e) return cb(e);
        event.culprit = util.buildCulprit(frames[0]);
        event.message = message || e.message;
        return cb(null, event);
      });
    };

    Event.prototype.error = function(err, cb) {
      this.exception(err);
      this.stacktrace(err, cb);
      return this;
    };

    Event.prototype.stacktrace = function(err, cb) {
      util.buildStackTrace(err, function(err, frames) {
        if (err) return cb(err);
        this.interface("Stacktrace", frames);
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
      if (typeof opts === 'string') opts = parseDsn(opts);
      uri = opts.uri, public = opts.public, secret = opts.secret, projectId = opts.projectId;
      this.uri = uri;
      this.public = public;
      this.secret = secret;
      this.projectId = projectId;
    }

    Client.send = function(event) {};

    return Client;

  })();

  ex.Client = Client;

  ex.Event = Event;

}).call(this);
