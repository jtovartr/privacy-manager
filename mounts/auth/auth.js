/* ===================================== Libraries ===================================== */

var https = require('https')
var http = require('http')
var fs = require('fs')
var helmet = require('helmet') //Para HSTS, necessary to add
var mysql = require('mysql')
var jwt = require('jsonwebtoken')
var express = require('express')
var body_parser = require('body-parser') //necessary to add
const util = require('util') // To "promisify" the queries
const bcrypt = require('bcrypt');

/* ===================================== Express Configuration ===================================== */
var app = express()
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(helmet())
app.disable('etag') //To disable caches (avoiding 304 Not Modified response)

/* ===================================== SSL Parameters ===================================== */
var options = { 
    key:     fs.readFileSync('ssl/hellfish.test.key'), 
    cert:    fs.readFileSync('ssl/hellfish.test.crt'), 
    ca:      fs.readFileSync('ssl/myCA.pem'), 
    dhparam: fs.readFileSync('ssl/dhparam.pem'), 
}; 

/* ================== Database connection (made with "factory function" warper to use await) ================== */
var dbConfig = {
	host     : 'mysql-master.default.svc.cluster.local',
	user     : 'root',
	password : '',
	database : 'test'
}

function makeDb(config) {
	const connection = mysql.createConnection(config)
	return {
		query(sql, args) {
			return util.promisify(connection.query).call(connection, sql, args)
		},
		close() {
			return util.promisify(connection.end).call(connection)
		}
	}
}

var con = makeDb(dbConfig)

/* ===================================== Server Creation ===================================== */

const port = 8081
https.createServer(options, app).listen(port, () => console.log('HTTPS server listening on port ' + port))

/* ===================================== GET ===================================== */

app.get('/', function(req, res) {
	res.send('To authenticate, you must send your "email" and your "password" via POST')
})

/* ===================================== POST ===================================== */

/**I receive a post with a username and password and return a token.*/

app.post('/', async function(req, res) {
	//A hash should be stored instead of the password.
	//We check if they send me email or user, token or nothing.
	if (typeof req.body.token !== 'undefined') {
		//token has been sent
		//I answer with the translation of the token
		//var payload = jwt.verify(req.body.token, 'shhhhh')
		jwt.verify(req.body.token, 'shhhhh', (err, decoded) => {
			payload = decoded
    			if(err) {
    				console.log("Session expired")
         			res.status(401).send('Session expired')
    			}
    			else {
    				console.log('A token has been sent to me')
				console.log('Payload: ' + JSON.stringify(payload))
				res.status(200).send({ id: payload.id, type: payload.type })
    			}
    		}) 
		return
	}
	else if (typeof req.body.email !== 'undefined' || typeof req.body.password !== 'undefined') {
		//email and password have been sent
		//We check if the password is correct
		var result = await checkPassword(req.body.email, req.body.password)
		if (result == 2) {
			//Incorrect password
			res.status(401).send('Incorrect password')
		}
		else if (result == 1) {
			//User does not exist
			res.status(401).send('User does not exist')
		}
		else {
			//Correct, I make the token (id, class) and return it 
			//console.log({ id: result.id, clase: result.type })
			var token = jwt.sign({ id: result.id, type: result.type }, 'shhhhh', {
				expiresIn: process.argv[2]
			})
			var object = new Object()
			object.token = token
			res.send(object)
		}
	}
	else {
		console.log('No email or password entered')
		console.log('req.body: ' + JSON.stringify(req.body))
		res.status(400).send('No email or password entered')
		return
	}
})

/* ===================================== Functions ===================================== */

/**checkPassword
 * Return:
 * object with id and type if the password is correct
 * 1 if the user is not found
 * 2 if the password is not correct
 */
async function checkPassword(email, password) {

	try {
		// We have to see if the authorization.
		var result = await con.query('SELECT password, salt, type, id FROM usuarios WHERE email=?', email)
		
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}


	//We see if the user exists
	console.log('result[0] ' + result[0]) //returns an array with a json inside

	if (typeof result[0] === 'undefined') {
		//no data returned from the database
		console.log('The user does not exist')
		return 1
	}
	
	const saltRounds = 10;

        hast_calculated = bcrypt.hash(password, result[0].salt, function(err, hash) {
        	// returns hash
        	//We check if the password is correct
        	console.log('hash_calculated: ' + hash)
  		console.log('password_sql: : ' + result[0].password)
		if (result[0].password != hash) {
			console.log('The password is incorrect')
			return 2
		}
  	});
  	
	//If I get this far, everything is OK. I return the result of the query
	console.log('type: ' + result[0].type)
	return result[0] //The json object of the query inside the array.
}
