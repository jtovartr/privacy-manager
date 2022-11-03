/* ===================================== Libreries ===================================== */

var https = require('https')
var http = require('http')
var fs = require('fs')
var helmet = require('helmet') //For HSTS, necessary to add
var mysql = require('mysql')
var jwt = require('jsonwebtoken')
var express = require('express')
var body_parser = require('body-parser') //necessary to add
const util = require('util') // To "promisify" the queries
const axios = require('axios')

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

/* ================================= SSL Client Parameters ================================= */

const agentSSL = new https.Agent({
	key                 : fs.readFileSync('ssl/hellfish.test.key'),
	cert                : fs.readFileSync('ssl/hellfish.test.crt'),
	ca		     : fs.readFileSync('ssl/myCA.pem'), 
	//For disabling host ip doesn't match. Remove in production
	checkServerIdentity : () => undefined
})

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

/* ===================================== Module addresses ===================================== */
// -- HTTPS --

var auth = 'https://auth.default.svc.cluster.local:8081'

var priv = 'https://priv.default.svc.cluster.local:8082'

/* ===================================== Server creation ===================================== */
const port = 8080
https.createServer(options, app).listen(port, () => console.log('HTTPS server listening on port ' + port))


/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	console.log('req.query.token: ' + req.query.token)
	console.log('req.query.stringQuery: ' + req.query.stringQuery)

	//We check that the required data have been entered
	if (typeof req.query.token === 'undefined' || typeof req.query.stringQuery === 'undefined') {
		res.send('No token or stringQuery entered')
		return
	}

	//Obtain the type of token sent to us
	var result = await checkToken(req.query.token)
	console.log(JSON.stringify(result))
	console.log('result.id: ' + result.id, ' result.type: ' + result.type)
	
	if(result.id === undefined) {
		res.send('Token expired')
		return
	}
	//We send the user id, the class and the query to priv
	var data = await sendGETPriv(result.id, result.type, req.query.stringQuery)

	//When we receive the desired data, we display it on the screen.
	res.send(data)
	return
})

/* ===================================== POST ===================================== */

app.post('/', async function(req, res) {
	console.log('req.body.token: ' + req.body.token)
	console.log('req.body.data: ' + req.body.data)

	//We check that the required data have been entered
	if (typeof req.body.token === 'undefined' || typeof req.body.data === 'undefined') {
		res.send('No token or stringQuery entered')
		return
	}
	
	try {
		// the number of columns is obtained from the database
		var number_columns = await con.query('SELECT count(*) AS number FROM information_schema.columns WHERE table_name=?', 'personas')
		
		//Check that the length of the data is correct. 
		if (req.body.data.split(', ').length != number_columns[0].number-1) {
			res.send('Lenght: ' + req.body.data.split(', ').length + 'Data entered incorrectly')
			return
		}
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	//Obtain the type of token sent to us
	checkToken(req.body.token)
		.then((result) => {
			if(result.id === undefined) {
				res.send('Token expired')
				return
			}
			else {
				console.log('result: ' + result)
				//send the token class to priv together with the data
				return sendPOSTPriv(result.type, result.id, req.body.data)
			}
		})
		.then((response) => {
			//When we receive the answer we send it
			res.send(response)
			return
		})
})

/* ===================================== DELETE ===================================== */

app.delete('/', function(req, res) {
	//Delete the data based on the id

	console.log('req.body.token: ' + req.body.token)
	console.log('req.body.id: ' + req.body.id)

	//We check that the required data have been entered
	if (typeof req.body.token === 'undefined' || typeof req.body.id === 'undefined') {
		res.send('No token or id entered')
		return
	}

	//Obtain the type of token sent to us
	checkToken(req.body.token)
		.then((result) => {
			if(result.id === undefined) {
				res.send('Token expired')
				return
			}
			else {
				console.log('result: ' + result)
				//send the token class to priv together with the data
				return sendDELETEPriv(result.type, result.id, req.body.id)
			}
		})
		.then((response) => {
			//When we receive the answer we send it
			res.send(response)
			return
		})
})


/* ===================================== Funciones ===================================== */

/**checkToken
 * Return:
 * json {type, id} if the token is valid
 * 1 if the token is not valid
 */
async function checkToken(token) {
	//We make a request to auth, and pass the message to him.

	var response_checkToken = ''

	await axios
		.post(
			auth,
			{
				token : token
			},
			{
				httpsAgent : agentSSL
			}
		)
		.then(function(response) {
			console.log('response.data: \n' + JSON.stringify(response.data))
			response_checkToken = response.data
		})
		.catch(function(error) {
			console.log(error)
		})
	return response_checkToken
}

async function sendGETPriv(id, type, stringQuery) {
	//The different methods are implemented according to the function to be used.
	//For now we implement the GET

	var response_sendGETPriv = ''
	var params = {
		id          : id,
		type        : type,
		stringQuery : stringQuery
	}

	console.log('Params: ' + JSON.stringify(params))

	await axios
		.get(priv, {
			params     : params,
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data)
			response_sendGETPriv = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return response_sendGETPriv
}

async function sendPOSTPriv(type, id, data) {

	var response_sendPOSTPriv = ''
	var params = {
		type  : type,
		id    : id,
		data : data
	}

	console.log('Params: ' + JSON.stringify(params))

	await axios
		.post(priv, params, {
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data)
			response_sendPOSTPriv = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return response_sendPOSTPriv
}

async function sendDELETEPriv(type, idUser, idToDelete) {

	var response_sendDELETEPriv = ''
	var data = {
		type       : type,
		idUser     : idUser,
		idToDelete : idToDelete
	}

	console.log('Params: ' + JSON.stringify(data))

	await axios
		.delete(priv, {
			data       : data,
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data)
			response_sendDELETEPriv = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return response_sendDELETEPriv
}
