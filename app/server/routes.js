
var CT = require('./modules/country-list');
var AM = require('./modules/account-manager');
var EM = require('./modules/email-dispatcher');

module.exports = function(app) {

// main login page //
	app.get('/', function(req, res){
	// check if the user's credentials are saved in a cookie //
		if (req.cookies.user == undefined || req.cookies.pass == undefined){
			res.render('login', { title: 'Hello - Please Login To Your Account' });
		}	else{
	// attempt automatic login //
			AM.autoLogin(req.cookies.user, req.cookies.pass, function(o){
				if (o != null){
				    req.session.user = o;
					res.redirect('/home');
				}	else{
					res.render('login', { title: 'Hello - Please Login To Your Account' });
				}
			});
		}
	});
	
	app.post('/', function(req, res){
		AM.manualLogin(req.body['user'], req.body['pass'], function(e, o){
			if (!o){
				res.status(400).send(e);
			}	else{
				req.session.user = o;
				if (req.body['remember-me'] == 'true'){
					res.cookie('user', o.user, { maxAge: 900000 });
					res.cookie('pass', o.pass, { maxAge: 900000 });
				}
				res.status(200).send(o);
			}
		});
	});

	app.get('/pakey', function(req, res){
		res.status(200).send(req.session.user);
	});
	
// logged-in user homepage //
	
	app.get('/home', function(req, res) {
		if (req.session.user == null){
	// if user is not logged-in redirect back to login page //
			res.redirect('/');
		}	else{
			res.render('home', {
				title : 'Control Panel',
				countries : CT,
				udata : req.session.user
			});
		}
	});
	
	app.post('/home', function(req, res){
		if (req.session.user == null){
			res.redirect('/');
		}	else{
			AM.updateAccount({
				id		: req.session.user._id,
				name	: req.body['name'],
				email	: req.body['email'],
				pass	: req.body['pass'],
				country	: req.body['country']
			}, function(e, o){
				if (e){
					res.status(400).send('error-updating-account');
				}	else{
					req.session.user = o;
			// update the user's login cookies if they exists //
					if (req.cookies.user != undefined && req.cookies.pass != undefined){
						res.cookie('user', o.user, { maxAge: 900000 });
						res.cookie('pass', o.pass, { maxAge: 900000 });	
					}
					res.status(200).send('ok');
				}
			});
		}
	});

	app.post('/logout', function(req, res){
		res.clearCookie('user');
		res.clearCookie('pass');
		req.session.destroy(function(e){ res.status(200).send('ok'); });
	})
	
// creating new accounts //
	
	app.get('/signup', function(req, res) {
		res.render('signup', {  title: 'Signup', countries : CT });
	});
	
	app.post('/signup', function(req, res){
		AM.addNewAccount({
			name 	: req.body['name'],
			email 	: req.body['email'],
			user 	: req.body['user'],
			pass	: req.body['pass'],
			country : req.body['country']
		}, function(e){
			if (e){
				res.status(400).send(e);
			}	else{
				res.status(200).send('ok');
			}
		});
	});

// password reset //

	app.post('/lost-password', function(req, res){
	// look up the user's account via their email //
		AM.getAccountByEmail(req.body['email'], function(o){
			if (o){
				EM.dispatchResetPasswordLink(o, function(e, m){
				// this callback takes a moment to return //
				// TODO add an ajax loader to give user feedback //
					if (!e){
						res.status(200).send('ok');
					}	else{
						for (k in e) console.log('ERROR : ', k, e[k]);
						res.status(400).send('unable to dispatch password reset');
					}
				});
			}	else{
				res.status(400).send('email-not-found');
			}
		});
	});

	app.get('/reset-password', function(req, res) {
		var email = req.query["e"];
		var passH = req.query["p"];
		AM.validateResetLink(email, passH, function(e){
			if (e != 'ok'){
				res.redirect('/');
			} else{
	// save the user's email in a session instead of sending to the client //
				req.session.reset = { email:email, passHash:passH };
				res.render('reset', { title : 'Reset Password' });
			}
		})
	});
	
	app.post('/reset-password', function(req, res) {
		var nPass = req.body['pass'];
	// retrieve the user's email from the session to lookup their account and reset password //
		var email = req.session.reset.email;
	// destory the session immediately after retrieving the stored email //
		req.session.destroy();
		AM.updatePassword(email, nPass, function(e, o){
			if (o){
				res.status(200).send('ok');
			}	else{
				res.status(400).send('unable to update password');
			}
		})
	});
	
// view & delete accounts //
	
	app.get('/print', function(req, res) {
		AM.getAllRecords( function(e, accounts){
			res.render('print', { title : 'Account List', accts : accounts });
		})
	});
	
	app.post('/delete', function(req, res){
		AM.deleteAccount(req.body.id, function(e, obj){
			if (!e){
				res.clearCookie('user');
				res.clearCookie('pass');
				req.session.destroy(function(e){ res.status(200).send('ok'); });
			}	else{
				res.status(400).send('record not found');
			}
	    });
	});
	
	app.get('/reset', function(req, res) {
		AM.delAllRecords(function(){
			res.redirect('/print');	
		});
	});

// link with PayPal

	app.get('/paypal', function(req, res){
		console.log("hit paypal endpoint\n");

		var https = require('https');

		var querystring = require('querystring');
		var data = querystring.stringify({
			"cancelUrl": "https://payment-portal.herokuapp.com/home",
			"currencyCode": "USD",
			"endingDate": "2017-10-17T07:00:00.000Z",
			"maxAmountPerPayment": "2.00",
			"maxNumberOfPayments": "100",
			"maxTotalAmountOfAllPayments": "200.00",
			"pinType": "NOT_REQUIRED",
			"requestEnvelope.errorLanguage": "en_US",
			"returnUrl": "https://payment-portal.herokuapp.com/home",
			"startingDate": "2016-12-04T05:39:00.000Z",
			"senderEmail": "samvit.jain@gmail.com"
		});
		console.log("POST payload:", data);

		var options = {
			method: "POST",
			host: "svcs.sandbox.paypal.com",
			path: "/AdaptivePayments/Preapproval",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Content-Length": Buffer.byteLength(data, 'utf8'),
				"X-PAYPAL-SECURITY-USERID": "samvit.jain_api1.gmail.com",
				"X-PAYPAL-SECURITY-PASSWORD": "VJL2NXNEZXFQY3CB",
				"X-PAYPAL-SECURITY-SIGNATURE": "An5ns1Kso7MWUdW4ErQKJJJ4qi4-AVGcZQd33mPK.B0RMlCTgGYW-gOk",
				"X-PAYPAL-REQUEST-DATA-FORMAT": "NV",
				"X-PAYPAL-RESPONSE-DATA-FORMAT": "JSON",
				"X-PAYPAL-APPLICATION-ID": "APP-80W284485P519543T"
			}
		};

		var request = https.request(options, function(response) {
			response.on('data', function (chunk) {
				console.log('Response: ' + chunk);
				var paKey = JSON.parse(chunk)["preapprovalKey"];
				res.redirect("https://www.sandbox.paypal.com/cgi-bin/webscr?" +
					"cmd=_ap-preapproval&preapprovalkey=" + paKey);
				AM.addPreapprovalKey({
					id: 				req.session.user._id,
					preapprovalKey: 	paKey
				}, function(e){
					if (e){
						console.log('Error saving preapproval key - ' + e);
					}	else{
						console.log('Saved preapproval key! - ' + paKey);
					}
				});
			});

			console.log('status code:', response.statusCode);
			console.log('headers:', response.headers);
		});

		request.write(data);
		request.end();
	});

	app.get('*', function(req, res) { res.render('404', { title: 'Page Not Found'}); });
};
