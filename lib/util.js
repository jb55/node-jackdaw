(function() {
  var async, crypto, fs, url, util, _;

  async = require('async');

  fs = require('fs');

  url = require('url');

  crypto = require('crypto');

  _ = require('underscore')._;

  util = module.exports;

  util.parseDsn = function(dsn) {
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
      public: publicKey,
      secret: secretKey,
      projectId: projectId
    };
  };

  util.getLineContext = function(file, lineno, cb, numContext) {
    var ln;
    if (numContext == null) numContext = 2;
    ln = function(l) {
      return l - 1;
    };
    return fs.readFile(file, function(err, data) {
      var contextLine, lines;
      if (err) return cb(err);
      lines = data.toString().split('\n');
      contextLine = ln(lineno);
      return cb(null, {
        pre_context: lines.slice(lineno - numContext - 2, (lineno - 2) + 1 || 9e9),
        context_line: lines[lineno - 1],
        post_context: lines.slice(lineno, (lineno + numContext) + 1 || 9e9)
      });
    });
  };

  util.parseStackTraceLine = function(line) {
    var frame, matched;
    matched = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)$/);
    if (matched === null) return null;
    frame = {
      filename: filename,
      lineno: lineno
    };
    frame["function"] = fn;
    return frame;
  };

  util.parseStackTrace = function(stack, cb) {
    var lines;
    lines = stack.split('\n').slice(1);
    return async.map(lines, function(line, done) {
      var frame;
      frame = util.parseStackTraceLine(line);
      if (util.cantGetLineContext(frame.filename)) return done(null, frame);
      return util.getLineContext(frame.filename, frame.lineno, function(err, context) {
        frame = _.extend(frame, context);
        return done(err, frame);
      });
    }, function(err, frames) {
      return cb(err, frames);
    });
  };

  util.cantGetLineContext = function(f) {
    return f && f.length > 0 && f[0] !== '/';
  };

  util.buildStackFrame = function(opts, done) {
    var callsite, context, frame;
    callsite = opts.callsite, context = opts.context;
    callsite = callsite || opts;
    context = context || true;
    frame = {
      filename: callsite.file,
      abs_path: callsite.path,
      lineno: callsite.line
    };
    frame["function"] = callsite.name;
    if (context) {
      if (util.cantGetLineContext(frame.abs_path)) return done(null, frame);
      return util.getLineContext(frame.abs_path, frame.lineno, function(err, ctx) {
        frame = _.extend(frame, ctx);
        return done(err, frame);
      });
    } else {
      return done(null, frame);
    }
  };

  util.buildStackTrace = function(opts, cb) {
    var context, err, ret, s;
    err = opts.err, context = opts.context;
    err = err || opts;
    context = context || true;
    s = err.stack;
    ret = function(err, frames) {
      if (err) return cb(err);
      return cb(err, {
        frames: frames
      });
    };
    if (err.callsites) {
      return async.map(err.callsites, function(callsite, done) {
        return util.buildStackFrame({
          callsite: callsite,
          context: context
        }, function(err, frame) {
          return done(err, frame);
        });
      }, ret);
    } else {
      return ret(new Error("Stack trace not found"));
    }
  };

  util.buildException = function(err) {
    return {
      type: err.name,
      value: err.message
    };
  };

  util.buildCulprit = function(frame) {
    return "" + frame.filename + " - " + frame["function"];
  };

  util.makeSignature = function(timestamp, message, secretKey) {
    var data, hmac;
    hmac = crypto.createHmac('sha1', secretKey);
    data = "" + timestamp + " " + message;
    hmac.update(data);
    return hmac.digest('hex');
  };

  util.makeAuthHeader = function(sig, timestamp, publicKey, p) {
    var header;
    header = ["Sentry sentry_signature=" + sig];
    header.push("sentry_version=2.0");
    header.push("sentry_timestamp=" + timestamp);
    header.push("sentry_client=node-jackdaw/0.1");
    header.push("sentry_key=" + publicKey);
    header.push("project_id=" + p);
    return header.join(', ');
  };

}).call(this);
