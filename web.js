const path = require('path');

const everyauth = require('everyauth');
const express = require('express');
const FacebookClient = require('facebook-client').FacebookClient;

everyauth.twitter
    .consumerKey(process.env.TWITTER_CONSUMER_KEY)
    .consumerSecret(process.env.TWITTER_CONSUMER_SECRET)
    //.apiHost(process.env.APIGEE_TWITTER_API_ENDPOINT)
    .entryPath('/connect/twitter')
    .redirectPath('/home')
    .findOrCreateUser(function (session, accessToken, accessTokenSecret, twitterUserMetadata) {
        console.log('twitter connected');
        console.log(accessToken);
        console.log(accessTokenSecret);
        console.log(twitterUserMetadata);
        return({});
    })

everyauth.facebook
    .appId(process.env.FACEBOOK_APP_ID)
    .appSecret(process.env.FACEBOOK_SECRET)
    //.apiHost(process.env.APIGEE_FACEBOOK_API_ENDPOINT)
    .scope('email,publish_actions'/* + ',user_likes,user_photos,user_photo_video_tags'*/)
    .entryPath('/connect/facebook')
    .redirectPath('/home')
    .findOrCreateUser(function(session, accessToken, accessTokenExtra, fbUserMetadata) {
        console.log('facebook connected');
        console.log(accessToken);
        console.log(accessTokenExtra);
        console.log(fbUserMetadata);
        return({});
    })

var facebook = new FacebookClient();

var app = express.createServer(
    express.logger(),
    express.static(__dirname + '/public'),
    express.cookieParser(),
    express.bodyParser(),
    express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
    function(request, response, next) {
        var method = request.headers['x-forwarded-proto'] || 'http';
        everyauth.twitter.myHostname(method + '://' + request.headers.host);
        everyauth.facebook.myHostname(method + '://' + request.headers.host);
        next();
    },
    everyauth.middleware(),
    require('facebook').Facebook()
);

app.set("view engine", "mustache");
app.set("views", path.join(__dirname, 'views'));
app.register(".mustache", require('stache'));

var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

app.get('/', function(request, response) {
    response.render('index');
});

app.get('/home', function(request, response) {
    if (request.session.auth) {
        response.render('home', {
            json: JSON.stringify(request.session.auth)
        });
    } else {
        response.redirect('/');
    }
});
