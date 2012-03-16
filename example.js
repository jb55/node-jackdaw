
var jd = require('./lib/index');

var dsn = process.env.SENTRY_DSN;
var client = new jd.Client(dsn);

try {
  (function someFunction(){
    throw new Error("ahh something went wrong");
  })();
} catch (e) {
  jd.Event.fromError(e, function(err, event){
    console.log(client);
    client.send(event, function(serr, resp, body) {
      console.log(serr, resp.statusCode, body);
    });
  });
}
