
{ parseStack } = require './raven-utils'
async = require 'async'

util = module.exports

util.parseDsn = (dsn) ->
  { hostname, pathname, protocol, auth } = url.parse dsn
  [ publicKey, secret ] = auth.split ':'
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
  secret: secret
  projectId: projectId


#
# read line contexts from errors
#
util.getLineContext = (file, lineno, cb, numContext=2) ->
  ln = (l) -> l - 1

  fs.readFile file, (err, data) ->
    return cb err if err
    lines = data.toString().split('\n')
    contextLine = ln linenno
    cb null,
      pre_context:  lines[contextLine - numContext .. contextLine]
      context_line: lines[contextLine]
      post_context: lines[contextLine .. contextLine + numContext]

#
# parse a line from a string stack frame
#
util.parseStackTraceLine = (line) ->
  [fn, filename, lineno] = line.match(/^\s*at (.+?) \((.+?):(\d+):(\d+)\)$/)[1..]
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
    util.getLineContext frame.filename, frame.lineno, (err, context) ->
      frame = _.extend frame, context
      done err, frame
  , (err, frames) ->
    cb err, frames

#
# build a sentry stack frame from a raw stack frame
#
util.buildStackFrame = (opts, done) ->
  { callsite, context } = opts
  callsite = callsite or opts
  context = context or true

  frame =
    filename: file
    abs_path: callsite.path
    lineno: callsite.line
  frame["function"] = callsite.name

  if context
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
    util.parseStackTrace err.stack, ret


#
# build and exception
#
util.buildException = (err) ->
  type: err.name
  value: err.message


util.buildCulprit = (frame) ->
  "#{ frame.filename } - #{ frame["function"] }"


util.makeSignature = (timestamp, message) ->
    hmac = crypto.createHmac 'sha1', key
    hmac.update "#{ timestamp } #{ message }"
    hmac.digest 'hex'

util.makeAuthHeader = (sig, timestamp, apiKey) ->
    header = ["Sentry sentry_signature=#{ signature }"]
    header.push "sentry_timestamp=#{ timestamp }"
    header.push "sentry_client=node-jackdaw/0.1"
    header.push "sentry_key=#{ apiKey }" if apiKey
    header.join ', '
