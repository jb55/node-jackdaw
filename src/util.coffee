
async = require 'async'
fs    = require 'fs'
url   = require 'url'
crypto = require 'crypto'
{ _ } = require 'underscore'

util = module.exports

#
# Parses a dsn string:
#
#   https://public:secret@example.com/sentry/1
# 
# ... into a javascript object in the form:
#
#   uri: 'https://example.com/sentry'
#   publicKey: public
#   secretSecret: secret
#   projectId: 1
#
# This function throws exceptions if the parse fails in any way
#
util.parseDsn = (dsn) ->
  { hostname, pathname, protocol, auth } = url.parse dsn
  [ publicKey, secretKey ] = auth.split ':'
  parsedPath            = pathname.split '/'

  if parsedPath.length is 0
    throw new Error 'Project id missing from dsn'

  projectId = +parsedPath.pop()

  if isNaN projectId
    throw new Error 'Project id is not a number'

  path         = parsedPath.join '/'
  hasProjectId = projectId?

  path      = ""   unless hasProjectId
  projectId = path unless hasProjectId

  uri: "#{ protocol or 'http' }//#{ hostname }/#{ path }"
  public: publicKey
  secret: secretKey
  projectId: projectId

#
# read line contexts from errors
#
util.getLineContext = (file, lineno, cb, numContext=2) ->
  ln = (l) -> l - 1

  fs.readFile file, (err, data) ->
    return cb err if err
    lines = data.toString().split('\n')
    contextLine = ln lineno
    cb null,
      pre_context:  lines[lineno - numContext - 2 .. lineno - 2]
      context_line: lines[lineno - 1]
      post_context: lines[lineno .. lineno + numContext]

#
# parse a line from a string stack frame
#
util.parseStackTraceLine = (line) ->
  matched = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)$/)
  return null if matched is null
  #[fn, filename, lineno] = [1..]
  frame =
    filename: filename
    lineno: lineno
  frame["function"] = fn
  frame


#
# parse a string stack trace
#
util.parseStackTrace = (stack, cb) ->
  lines = stack.split('\n')[1..]

  async.map lines, (line, done) ->
    frame = util.parseStackTraceLine line
    return done null, frame if not util.canGetLineContext frame.filename
    util.getLineContext frame.filename, frame.lineno, (err, context) ->
      frame = _.extend frame, context
      done err, frame
  , (err, frames) ->
    cb err, frames

util.canGetLineContext = (f) ->
  f and f.length > 0 and f[0] is '/'

#
# build a sentry stack frame from a raw stack frame
#
util.buildStackFrame = (opts, done) ->
  { callsite, context } = opts
  callsite = callsite or opts
  context = context or true

  frame =
    filename: callsite.file + (if callsite.isEval then " (eval)" else "")
    abs_path: callsite.path
    lineno: callsite.line
  frame["function"] = callsite.name

  if context
    return done null, frame if not util.canGetLineContext frame.abs_path
    util.getLineContext frame.abs_path, frame.lineno, (err, ctx) ->
      frame = _.extend frame, ctx
      done err, frame
  else
    done null, frame

#
# turn an error into a sentry stacktrace interface
#
util.buildStackTrace = (opts, cb) ->
  { err, context } = opts
  err = err or opts
  context = context or true

  # reading the stack string should trigger the prepare
  s = err.stack

  ret = (err, frames) ->
    return cb err if err
    cb err, frames: frames

  if err.callsites
    async.map err.callsites, (callsite, done) ->
      util.buildStackFrame
        callsite: callsite
        context: context
      , (err, frame) ->
        done err, frame
    , ret
  else
    # fall back to parsing a string stack trace if we dont have the raw
    # stacktrace for some reason
    ret new Error("Stack trace not found")
    #util.parseStackTrace err.stack, ret


#
# build and exception
#
util.buildException = (err) ->
  type: err.name
  value: err.message


util.buildCulprit = (frame) ->
  "#{ frame.filename } - #{ frame["function"] }"


util.makeSignature = (timestamp, message, secretKey) ->
    hmac = crypto.createHmac 'sha1', secretKey
    data = "#{ timestamp } #{ message }"
    hmac.update data
    hmac.digest 'hex'

util.makeAuthHeader = (sig, timestamp, publicKey, p) ->
    header = ["Sentry sentry_signature=#{ sig }"]
    header.push "sentry_version=2.0"
    header.push "sentry_timestamp=#{ timestamp }"
    header.push "sentry_client=node-jackdaw/0.1"
    header.push "sentry_key=#{ publicKey }"
    header.push "project_id=#{ p }"
    header.join ', '

