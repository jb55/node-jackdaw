
url   = require 'url'
{ _ } = require 'underscore'

ex = module.exports

# Parses a dsn string to a javascript object into the form:
#
#   uri: string, eg. 'https://example.com/sentry'
#   publicKey: string
#   secret: string
#   projectId: integer
#
# This function throws exceptions if the parse fails in any way
ex.parseDsn = (dsn) ->
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
  publicKey: publicKey
  secret: secret
  projectId: projectId


class RavenClient
  constructor: (@opts={}) ->
    if typeof opts is 'string'
      opts = parseDsn opts
