(function() {
  var async, parseStack, util;

  parseStack = require('./raven-utils').parseStack;

  async = require('async');

  util = module.exports;

  util.parseDsn = function(dsn) {
    var auth, hasProjectId, hostname, parsedPath, path, pathname, projectId, protocol, publicKey, secret, _ref, _ref2;
    _ref = url.parse(dsn), hostname = _ref.hostname, pathname = _ref.pathname, protocol = _ref.protocol, auth = _ref.auth;
    _ref2 = auth.split(':'), publicKey = _ref2[0], secret = _ref2[1];
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
      secret: secret,
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
      contextLine = ln(linenno);
      return cb(null, {
        pre_context: lines.slice(contextLine - numContext, contextLine + 1 || 9e9),
        context_line: lines[contextLine],
        post_context: lines.slice(contextLine, (contextLine + numContext) + 1 || 9e9)
      });
    });
  };

  util.parseStackTraceLine = function(line) {
    var filename, fn, frame, lineno, _ref;
    _ref = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)$/).slice(1), fn = _ref[0], filename = _ref[1], lineno = _ref[2];
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
      return util.getLineContext(frame.filename, frame.lineno, function(err, context) {
        frame = _.extend(frame, context);
        return done(err, frame);
      });
    }, function(err, frames) {
      return cb(err, frames);
    });
  };

  util.buildStackFrame = function(opts, done) {
    var callsite, context, frame;
    callsite = opts.callsite, context = opts.context;
    callsite = callsite || opts;
    context = context || true;
    frame = {
      filename: file,
      abs_path: callsite.path,
      lineno: callsite.line
    };
    frame["function"] = callsite.name;
    if (context) {
      return util.getLineContext(frame.abs_path, frame.lineno, function(err, ctx) {
        frame = _.extend(frame, ctx);
        return done(err, frame);
      });
    } else {
      return done(null, frame);
    }
  };

  util.buildStackTrace = function(opts, cb) {
    var context, err, ret;
    err = opts.err, context = opts.context;
    err = err || opts;
    context = context || true;
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
      return util.parseStackTrace(err.stack, ret);
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

  util.makeSignature = function(timestamp, message) {
    var hmac;
    hmac = crypto.createHmac('sha1', key);
    hmac.update("" + timestamp + " " + message);
    return hmac.digest('hex');
  };

  util.makeAuthHeader = function(sig, timestamp, apiKey) {
    var header;
    header = ["Sentry sentry_signature=" + signature];
    header.push("sentry_timestamp=" + timestamp);
    header.push("sentry_client=node-jackdaw/0.1");
    if (apiKey) header.push("sentry_key=" + apiKey);
    return header.join(', ');
  };

}).call(this);
