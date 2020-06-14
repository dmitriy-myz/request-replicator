/*
 Request replicator.
 node replicator.js /path/to/config.json
 config should contain:
      {"listen_port":8080, "clear_host_header": true, recipients":[{"host":"127.0.0.1","port":80, "is_secure": false}],"requestTimeout":5, "return_policy": "success|fail"}
*/

const http = require('http');
const https = require('https');


try {
    config = require(process.argv[2]);
} catch (e) {
    console.log(e)
    process.exit(-1);
}

var replicate = function(method, url, headers, done) {
    console.log("replicating " + method + " " + url);
    var queue = 0,
        errors = 0,
        answer = null;

   const sendRequest = function(recipient) {
        onSuccess = function() {
                console.log("success " + method + " request to " + recipient.host + ":" + recipient.port + url);
                always();
            },
            onError = function(e) {
                console.log("failed " + method + " request to " + recipient.host + ":" + recipient.port + url);
                console.log(e.message);
                errors++;
                always();
            },
            always = function() {
                if (--queue === 0) {
                    done(answer);
                }
            };

        var callback = function(response) {
            // parse body and send as error
            response.setEncoding('utf8');
            var body = "";
            response.on('data', function(chunk) {
                body += chunk;
            });
            response.on('end', function() {
                if (response.statusCode >= 200 && response.statusCode < 400) {
                    if (!answer) {
                        answer = {
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body: body
                        };
                    } else if (answer.body !== body || answer.statusCode !== response.statusCode) {
                        console.log("Responses not equal, compare it: one: \n" + JSON.stringify(answer) + "\nsecond: \n" + JSON.stringify({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body: body
                        }));
                    }
                    onSuccess();
                } else if (config.return_policy !== "success" || !answer) {
                    // return error
                    answer = {
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: body
                    };
                    onError(new Error(body));
                }
            });
        };

        var options = {
            path: url,
            headers: headers,
            method: method,
            host: recipient.host,
            port: recipient.port,
            setHost: true,
            rejectUnauthorized: false
        };
        if (recipient.is_secure) {
            var req = https.request(options, callback);
        } else {
            var req = http.request(options, callback);
        }
        req.on('error', function(e) {
            answer = {
                body: e.message,
                statusCode: 500,
                headers: {}
            };
            onError(e);
        });
        req.on('socket', function(socket) {
            socket.setTimeout(config.requestTimeout * 1000);
            socket.on('timeout', function() {
                req.abort();
            });
        });
        req.end();
    };

    config.recipients.forEach(function(recipient) {
        queue++;
        sendRequest(recipient);
    });
};


var server = function(req, res) {
    if(config.clear_host_header)
        delete req.headers.host
    replicate(req.method, req.url, req.headers, function(response) {
        if (req.method === "HEAD") {
            response.headers["Content-Length"] = 0;
        }
        res.writeHead(response.statusCode, response.headers);
        if (req.method === "HEAD") {
            res.end();
        } else {
            res.end(response.body);
        }
    });
};

http.createServer(server).listen(config.listen_port, function() {
    console.info('replicator on ' + config.listen_port);
});
