const twitter = require('twitter');

var users = {};
var clients = {};
var streams = {};

var manager = {
    connect: function(id, accessToken, accessTokenExtra, callback) {
        if (users[id]) {
            setTimeout(function() {
                callback(streams[id]);
            }, 0);
        } else {
            users[id] = {
                accessToken: accessToken,
                accessTokenExtra: accessTokenExtra
            }
            
            clients[id] = new twitter({
                consumer_key: process.env.TWITTER_CONSUMER_KEY,
                consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
                access_token_key: accessToken,
                access_token_secret: accessTokenExtra
            });

            clients[id].stream('user', {}, function(stream) {
                console.log('start streaming from ' + id);
                streams[id] = stream;
                if (typeof callback == 'function') {
                    callback(stream);
                }
                
                stream.on('data', function (data) {
                    console.log(sys.inspect(data));
                });
            });
        }
    },
    disconnect: function(id) {
        console.log('stop streaming from ' + id);
        streams[id].destroy();
        delete users[id];
        delete clients[id];
        delete streams[id];
    }
};

module.exports = manager;
