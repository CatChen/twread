const path = require('path');

const mongo = require('mongoskin');
const everyauth = require('everyauth');
const express = require('express');
const FacebookClient = require('facebook-client').FacebookClient;

var db = mongo.db(process.env.MONGOLAB_URI);

everyauth.twitter
    .consumerKey(process.env.TWITTER_CONSUMER_KEY)
    .consumerSecret(process.env.TWITTER_CONSUMER_SECRET)
    //.apiHost(process.env.APIGEE_TWITTER_API_ENDPOINT)
    .entryPath('/connect/twitter')
    .redirectPath('/home')
    .findOrCreateUser(function (session, accessToken, accessTokenSecret, twitterUserMetadata) {
        console.log('Twitter connected for @' + twitterUserMetadata.screen_name);
        var twitter = db.collection('twitter');
        twitter.findOne({ id: twitterUserMetadata.id }, function(error, user) {
            if (!user) {
                user = twitterUserMetadata;
            }
            user.accessToken = accessToken;
            user.accessTokenSecret = accessTokenSecret;
            twitter.save(user);
        });
        return(twitterUserMetadata);
    })

everyauth.facebook
    .appId(process.env.FACEBOOK_APP_ID)
    .appSecret(process.env.FACEBOOK_SECRET)
    //.apiHost(process.env.APIGEE_FACEBOOK_API_ENDPOINT)
    .scope('email,publish_actions'/* + ',user_likes,user_photos,user_photo_video_tags'*/)
    .entryPath('/connect/facebook')
    .redirectPath('/home')
    .findOrCreateUser(function(session, accessToken, accessTokenExtra, fbUserMetadata) {
        console.log('Facebook connected for /' + fbUserMetadata.username);
        var facebook = db.collection('facebook');
        facebook.findOne({ id: fbUserMetadata.id }, function(error, user) {
            if (!user) {
                user = fbUserMetadata;
            }
            user.accessToken = accessToken;
            user.accessTokenExtra = accessTokenExtra;
            facebook.save(user);
        });
        return(fbUserMetadata);
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
    require('facebook').Facebook(),
    express.errorHandler({ showStack: true, dumpExceptions: true })
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
    if (request.session.auth && request.session.auth.twitter) {
        response.render('home', {
            auth: request.session.auth
        });
    } else {
        response.redirect('/');
    }
});
