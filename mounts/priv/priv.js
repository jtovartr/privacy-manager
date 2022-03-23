/* ===================================== Libreries ===================================== */

const https = require('https')
const http = require('http');
const fs = require('fs')
const path = require('path')
const helmet = require('helmet') //For HSTS, necessary to add
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const express = require('express')
const body_parser = require('body-parser') //necessary to add
const util = require('util') // To "promisify" the queries
const Promise = require('bluebird') //For random numbers
const randomNumber = require('random-number-csprng') //For random numbers
const axios = require('axios') 
const QueryString = require('qs')
const { Console } = require('console')

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
    //Condiciones para el cliente:
    //requestCert        : true,
    //rejectUnauthorized : true
}; 

/* ================================= SSL Client Parameters ================================= */

const agentSSL = new https.Agent({
	key                 : fs.readFileSync('ssl/hellfish.test.key'),
	cert                : fs.readFileSync('ssl/hellfish.test.crt'),
	ca		     : fs.readFileSync('ssl/myCA.pem'),
})

/* ================== Database connection (made with "factory function" warper to use await) ================== */
var dbConfig = {
	//host     : '10.152.183.137', //mysql master
	host   : 'mysql-master.default.svc.cluster.local',
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
//var gen = 'https://10.152.183.203:8083'
//var gen = 'https://gen.default.svc.cluster.local:8083';

// -- HTTP --
//var gen = 'http://10.152.183.203:8083'
//var arx = 'http://10.152.183.205:8083'

var gen = 'http://gen.default.svc.cluster.local:8083'
var arx = 'http://arx.default.svc.cluster.local:8083'

/* ===================================== Server creation ===================================== */
const port = 8082
//app.listen(port, () => console.log('HTTP server listening on port ' + port));
https.createServer(options, app).listen(port, () => console.log('HTTPS server listening on port ' + port))

/* ===================================== Lectura configuracion ===================================== */
const configPath = path.join(__dirname, 'politicas')
var config = {}
//updateConfig()

/* ===================================== Reading privacy rules ===================================== */

/**
 * We do an initial read of all current policies and create an sql view for each get rule for each user.
 * Then in each get we receive we check if the query and filter of the policies have changed. If they have changed, 
 *   we delete the view that exists for that user, and create a new one. That should be a separate function.
 * 
 * SQL cannot query with columns that do not exist in the view. For that reason, every time that we create a view we 
 * need to store in an array the columns that have that view, to be able to make a comparison with those that the user requests 
 * and to put in the query that we make in the database only those that exist inside the view.
 */

const privacyRulesPath = path.join(__dirname, 'politicas')
var politics = {} // Formato: politics[role].rules[i]
var politicsAsRead = {}
//updateRules()

/* ===================================== Counting requests ===================================== */

// json: {id, count}
var requestsCount = []

/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	try {
		console.log('req.query: \n' + JSON.stringify(req.query))

		//We need to check if the privacy rules have changed, and if they have changed, update them.
		await updateConfig()
		await updateRules()

		//We check that the limit of queries has not been exceeded.
		await updateRequestsCount(req.query.id, 'GET')
		if (await reachedMaxRequests(req.query.id, 'GET', req.query.type)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//We check that it is within the allowed hours
		if (!await timePeriodAllowed(req.query.type, 'GET')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//We check that it is a valid SQL statement
		if (!await validSQL(req.query.stringQuery)) {
			res.send('SQL sentence not valid')
			return 0
		}

		//Then we perform the queries to the different views available to the user.
		var data = await querysAVistas(req.query.type, req.query.stringQuery)
		
		//We now send the data to each function according to the assigned method
		var processed_data = await processData(data)

		res.send(processed_data)
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== POST ===================================== */

app.post('/', async function(req, res) {
	try {
		//We need to check if the privacy rules have changed, and if they have changed, update them.
		await updateConfig()
		await updateRules()

		//We check that the limit of queries has not been exceeded.
		await updateRequestsCount(req.body.id, 'PUSH')
		if (await reachedMaxRequests(req.body.id, 'PUSH', req.body.type)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//We check that it is within the allowed hours
		if (!await timePeriodAllowed(req.body.type, 'PUSH')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//We see if we have permission to enter the data
		var access = await typeAccessAction(req.body.type, 'PUSH')

		if (access == 0) {
			var respQuery = await enterData(req.body.data)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('Cannot enter data')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== DELETE ===================================== */

app.delete('/', async function(req, res) {
	try {
		//We need to check if the privacy rules have changed, and if they have changed, update them.
		await updateConfig()
		await updateRules()

		//We check that the limit of queries has not been exceeded.
		await updateRequestsCount(req.body.idUser, 'DELETE')
		if (await reachedMaxRequests(req.body.idUser, 'DELETE', req.body.type)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//We check that it is within the allowed hours
		if (!await timePeriodAllowed(req.body.type, 'DELETE')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//We see if we have permission to delete the data
		var access = await typeAccessAction(req.body.type, 'DELETE')

		if (access == 0) {
			var respQuery = await deleteData(req.body.idToDelete)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('Cannot delete data')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== Functions ===================================== */

/**
 * 
 * @param {String} type 
 * @param {String} action 
 * 
 * Checks if there is a rule with the requested action for the class
 * 
 * Returns: 0 if access is available, 1 if not available
 */
async function typeAccessAction(type, action) {
	//We check if we have permission to PUSH or DELETE

	for (var i = 0; i < politics[type].rules.length; i++) {
		if (politics[type].rules[i].action_type == accion) {
			//If we have permission, we return 0
			return 0
		}
	}

	//If we have not found any rule with permission, we return 1
	return 1
}

/**
 * 
 * @param {String} data
 * 
 * Stores the data entered by the user through the API in the database.
 * 
 * Returns: The response from the database.
 */
async function enterData(data) {
	var data_split = datos.split(', ')

	try {
		var result = await con.query(
			'INSERT INTO personas (nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad) VALUES (?,?,?,?,?,?,?,?,?)',
			data_split
		)
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + result)
	return result
}

/**
 * 
 * @param {String} ids 
 * 
 * Deletes the row with the ids sent by the user
 * 
 * Returns: The response from the database.
 */
async function deleteData(ids) {
	var idsArray = ids.split(', ')

	try {
		var result = await con.query('DELETE FROM personas WHERE id IN (?)', [ idsArray ])
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + JSON.stringify(result))
	return result
}

/**
 *
 * 
 * @param {json} queryJson
 * @param {string} table
 * @param {string} factor
 * 
 * Returns: json object modified with noise
 */
async function noise(queryJson, table, factor) {

	//For each row of the query:
	for (i in queryJson) {
		//Delete id row because we are not interested in it
		//delete queryJson[i]['id']

		//We should read the ontology, and depending on the type of variable it is, add the noise defined in the ontology

		let rawdata = fs.readFileSync('ontologia/ontologia.json')
		let ontology = JSON.parse(rawdata)

		//We loop through the table row
		//With for in we iterate over the keys of a json
		for (keyTable in queryJson[0]) {
			// I look for this key in ontology. Let's remember that in the ontology there are levels.
			//We search within persons because it is the table in which we are searching.
			for (key1 in ontology[table]) {
				for (key2 in ontology[table][key1]) {
					if (key2 == keyTable) {
						//If it is a string, replace the value with "*".
						if (ontology[table][key1][key2].type == 'string') {
							queryJson[i][keyTable] = '*'
						}
						//If it is a number, we add the noise
						if (ontology[table][key1][key2].type == 'number') {
							//Generate the safe random number

							numberGenerator = Promise.try(function() {
								return randomNumber(
									ontology[table][key1][key2].maxNoise * factor * -100,
									ontology[table][key1][key2].maxNoise * factor * 100
								)
							})
								.then(function(number) {
									queryJson[i][keyTable] = queryJson[i][keyTable] + number / 100
								})
								.catch({ code: 'RandomGenerationError' }, function(err) {
									console.log('Something went wrong!')
								})

							await numberGenerator
						}
					}
				}
			}
		}
	}

	return queryJson
}

/**
 * 
 * @param {*} rule 
 * @param {String} fileName 
 * @param {int} iteration 
 * 
 * Creates a view in the database with the rule passed as a parameter.
 *  
 * Returns: the name of the created view
 */
async function createViewFromRule(rule, fileName, iteration) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + fileName + '_' + iteration + ' AS ' + rule.resource

	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//querys
	try {
		var result = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	return 'personas_' + fileName + '_' + iteration
}

/**
 * 
 * @param {*} rule 
 * @param {String} type 
 * @param {int} iteration 
 * 
 * Create a view in the database with the rule passed as a parameter.
 * Use the "viewColumns" field when creating views.
 *  
 * Returns: the name of the created view
 */
async function createViewFromViewColumns(rule, type, iteration) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + type + '_' + iteration + ' AS '

	//We create the SELECT part
	var stringSelect = 'SELECT '

	//We add the columns
	for (var i = 0; i < rule.viewColumns.length; i++) {
		stringSelect = stringSelect + rule.viewColumns[i] + ', '
	}

	//We remove the last comma and space, and fill in
	stringSelect = stringSelect.slice(0, -2)
	stringSelect = stringSelect + ' FROM personas'

	stringQuery = stringQuery + stringSelect

	//If it has a filter, we add it
	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//querys
	try {
		var resultado = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	//And we return the name of the view
	return 'personas_' + type + '_' + iteration
}

/**
 * 
 * @param {String} typeUser
 * @param {String} queryUser
 * 
 * Performs queries to the views available to the user,
 * depending on the privacy method you can use. Each privacy method (each rule) has a view
 * 
 * Returns: an array of jsons with format {privacy_method:____, results:____}
 */
async function querysAVistas(typeUser, queryUser) {
	/**
	 * We are going to leave a view for each GET rule, and inside our rule object we introduce 
	 * an array of columns that are the ones defined in that rule.
	 * 
	 * When querying the views, we have to control the * that represent all the columns, 
	 * both in the user and those stored in the field rules.columns.
	 */

	var finalResult = []
	var queryUserArray = queryUser.split(' ')

	//For each rule with GET
	for (var i = 0; i < politics[typeUser].rules.length; i++) {
		if (politics[typeUser].rules[i].action_type == 'GET') {
			//query

			var indexFrom = queryUserArray.indexOf('FROM')
			var columnsArray = []
			var nameTableString = ''

			//We do different things depending on where we are in the query.
			//Some parts of the string are stored in separate strings in order to avoid SQL injection.
			var j = 0

			// ----- SELECT ------
			//queryString = queryString + queryUserArray[0] + ' '

			// ----- COLUMNAS -----
			//We have to format the columns coming from the user
			if (politics[typeUser].rules[i].viewColumns[0] == '*') {
				//If there is a * in the rules, we leave the user query

				//First we remove the "," that may remain in the user's query
				queryUserArray[j] = queryUserArray[j].replace(',', '')

				//If there is a '*' in the rules, we can leave the user query as it is but add the id column to it.
				for (j = 1; j < indexFrom; j++) {
					columnsArray.push(queryUserArray[j])
				}
				columnsArray.push('id')
			}
			else if (queryUserArray[1] == '*') {
				////If there is a '*' in the user, we can perform this query because the view is already filtered.
				columnsArray.push(queryUserArray[1])
			}
			else {
				//If there are columns in the user and in the rules, we have to compare
				for (j = 1; j < indexFrom; j++) {
					//First we remove the ',' that may remain in the user's query
					queryUserArray[j] = queryUserArray[j].replace(',', '')
					//We then compare
					politics[typeUser].rules[i].viewColumns.forEach((element) => {
						if (element == queryUserArray[j]) {
							//If any column matches, we put it inside the query
							columnsArray.push(queryUserArray[j])
						}
					})
				}
				//We add the id
				columnsArray.push('id')
			}

			// ----- FROM -----
			//queryString = queryString + queryUserArray[indexFrom] + ' '

			// ----- TABLE NAME -----
			nameTableString = nameTableString + politics[typeUser].rules[i].viewName

			// ----- WHERE Y CONDITIONS -----
			//Vamos a quitar el where porque es copmlicado escaparlo
			//Lo dejamos igual
			// for (j = indexFrom + 3; j < queryUserArray.length; j++) {
			// 	whereString = whereString + queryUserArray[j] + ' '
			// }

			
			var allow = true

			//If only the id is in the array columns, we do not send the query.
			if (columnsArray[0] == 'id') {
				allow = false
			}

			//If it is generalization and it is not '*', we do not send the query
			if (politics[typeUser].rules[i].privacy_method == 'Generalization' && columnsArray[0] != '*') {
				allow = false
			}
			//If it is KAnonimity and it is not '*', we don't send the query
			if (politics[typeUser].rules[i].privacy_method == 'KAnonimity' && columnsArray[0] != '*') {
				allow = false
			}
			if (allow) {
				console.log('queries that are sent: ' + 'SELECT ' + columnsArray + ' FROM `' + nameTableString + '`')

				try {
					if (columnsArray[0] == '*') {
						var result = await con.query('SELECT * FROM ??', nameTableString)
						console.log(result)
					}
					else {
						var result = await con.query('SELECT ?? FROM ??', [ columnsArray, nameTableString ])
						console.log(result)
					}
				} catch (err) {
					console.log(err)
				}

				finalResult.push({
					privacy_method : politics[typeUser].rules[i].privacy_method,
					attributes     : politics[typeUser].rules[i].attributes,
					dataSQL       : result
				})
			}
		}
	}

	return finalResult
}

/**
 * 
 * @param {String} queryString //query stored in the rules
 * 
 * Returns: an array with the columns after SELECT
 */
async function obtainViewColumns(queryString) {
	var queryStringArray = queryString.split(' ')
	var result = []

	//If the second word is an '*', we save it and return it directly
	if (queryStringArray[1] == '*') {
		result.push('*')
	}
	else {
		//If it is not an '*', we have to keep the positions from 1 to FROM

		var exit = 0
		var i = 1
		while (i < queryStringArray.length && exit == 0) {
			if (queryStringArray[i] == 'FROM') {
				exit = 1
			}
			else {
				result.push(queryStringArray[i].replace(',', ''))
				i++
			}
		}
	}

	//We add the ID column to be able to join later the data of people from different methods.
	result.push('id')

	return result
}

/**
 * 
 * @param {Array} datos 
 * La estructura de datos es: [{privacy_method:________, datosSQL:_________}{}...]
 * 
 * Devuelve: los datos procesados
 */
async function processData(data) {
	var processed_data = []
	var dataAux = [] 
	var result = []

	for (var i = 0; i < data.length; i++) {
		if (data[i].privacy_method == 'Exact') {
			////We do nothing, we return them as they are.
			processed_data.push({
				privacy_method  : data[i].privacy_method,
				processed_data : data[i].dataSQL
			})
		}
		else if (data[i].privacy_method == 'MinNoise') {
			processed_data.push({
				privacy_method  : data[i].privacy_method,
				processed_data : await noise(data[i].dataSQL, 'personas', 0.1)
			})
		}
		else if (data[i].privacy_method == 'MedNoise') {
			processed_data.push({
				privacy_method  : data[i].privacy_method,
				processed_data : await noise(data[i].dataSQL, 'personas', 0.5)
			})
		}
		else if (data[i].privacy_method == 'MaxNoise') {
			processed_data.push({
				privacy_method  : data[i].privacy_method,
				processed_data : await noise(data[i].dataSQL, 'personas', 1)
			})
		}
		else if (data[i].privacy_method == 'Generalization') {
			//We call the generalize module
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(gen)

				processed_data.push({
					privacy_method  : data[i].privacy_method,
					processed_data : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		else if (data[i].privacy_method == 'KAnonimity') {
			//We call the KAnonimity module
			try {	
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				
				//The privatization method and the data type are passed as parameters
				var response = await axios.get(arx, {
					params: {
						method: 'KAnonimity',
						attributes: data[i].attributes
					}
				})
				processed_data.push({
					privacy_method  : data[i].privacy_method,
					processed_data : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		else if (data[i].privacy_method == 'LDiversity') {
			//We call the LDiversity module
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				
				//The privatization method and the data type are passed as parameters
				var response = await axios.get(arx, {
					params: {
						method: 'LDiversity',
						attributes: data[i].attributes
					}
				})
				processed_data.push({
					privacy_method  : data[i].privacy_method,
					processed_data : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		
		else if (data[i].privacy_method == 'TCloseness') {
			//We call the TCloseness module
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				
				//The privatization method and the data type are passed as parameters
				var response = await axios.get(arx, {
					params: {
						method: 'TCloseness',
						attributes: data[i].attributes
					}
				})
				processed_data.push({
					privacy_method  : data[i].privacy_method,
					processed_data : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
	}

	return processed_data
}

/**
 * Reads existing types of roles from config.json file
 */
async function updateConfig() {
	try {
		var files = await fs.readdirSync(privacyRulesPath)

		//listing all files using forEach
		for (var i = 0; i < files.length; i++) {
			// files[i] es el nombre del archivo. leemos todos los "politics*.json"

			if (/^(config\.json)$/.test(files[i])) {
				//Leemos el archivo
				var auxJSON = fs.readFileSync(path.join(privacyRulesPath, files[i]))

				//Almacenamos en config los roles existentes
				config = JSON.parse(auxJSON)
			}
		}
	} catch (error) {}
}

/**
 * Read the privacy policy. Check if they have changed, and if so, update them.
 */
async function updateRules() {
	/**
	 * Let's change the way we read privacy policies.
	 * What will be done is to look for the role (the class) that the rule affects (if it has no role, 
	 * we can say that it applies to all classes) and separate the rules by classes within the json.
	 * 
	 * The politics*.json files will be read.
	 */

	// //passsing directoryPath and callback function
	// fs.readdir(privacyRulesPath, async function(err, files) {
	// 	//handling error
	// 	if (err) {
	// 		return console.log('Unable to scan directory: ' + err)
	// 	}
	// 	//listing all files using forEach
	// 	files.forEach(async function(file) {
	// 		// File es el nombre del archivo. leemos todos los "*.json"

	// 		if (/\.json$/.test(file)) {
	// 			var fileNoExtension = file.slice(0, file.length - 5)

	// 			//Leemos el archivo
	// 			var auxPol = fs.readFileSync(path.join(privacyRulesPath, file))

	// 			//Y comparamos con lo que ya hay guardado

	// 			if (JSON.stringify(politicsAsRead[fileNoExtension]) == JSON.stringify(JSON.parse(auxPol))) {
	// 				//Si es igual, no tenemos que crear views
	// 			}
	// 			else {
	// 				//Si es distinto, actualizamos el objeto
	// 				politicsAsRead[fileNoExtension] = JSON.parse(auxPol)
	// 				politics[fileNoExtension] = JSON.parse(auxPol)

	// 				// y creamos las nuevas views (modificamos politics)

	// 				for (var i = 0; i < politics[fileNoExtension].rules.length; i++) {
	// 					if (politics[fileNoExtension].rules[i].action_type == 'GET') {
	// 						//En rule.viewName almacenamos el nombre de la vista, y en rule.columns las columnas que contiene la vista
	// 						//Si en las reglas hay un *, no tenemos que crear una view, puede acceder a toda la tabla
	// 						politics[fileNoExtension].rules[i].viewColumns = await obtainViewColumns(politics[fileNoExtension].rules[i].resource)
	// 						if (politics[fileNoExtension].rules[i].viewColumns[0] == '*') {
	// 							politics[fileNoExtension].rules[i].viewName = 'personas'
	// 						}
	// 						else {
	// 							var viewName = await createViewFromViewColumns(politics[fileNoExtension].rules[i], fileNoExtension, i)
	// 							politics[fileNoExtension].rules[i].viewName = viewName
	// 						}
	// 					}
	// 				}
	// 			}
	// 		}
	// 	})
	// })
	var hasChanged = false

	//passsing directoryPath and callback function

	try {
		var files = await fs.readdirSync(privacyRulesPath)

		//listing all files using forEach
		for (var i = 0; i < files.length; i++) {
			// files[i] is the name of the file. we read all the "politics*.json".

			if (/^(politics)[0-9]*\.json$/.test(files[i])) {
				var fileNoExtension = files[i].slice(0, files[i].length - 5)

				//Read the file
				var auxPol = fs.readFileSync(path.join(privacyRulesPath, files[i]))

				//And we compare with what is already storage
				if (JSON.stringify(politicsAsRead[fileNoExtension]) == JSON.stringify(JSON.parse(auxPol))) {
					//If it is the same, we do not have to update anything
				}
				else {
					//If it has changed, we save the new file and activate a flag
					politicsAsRead[fileNoExtension] = JSON.parse(auxPol)
					hasChanged = true
				}
			}

			if (hasChanged) {
				await restartPolitics()
			}
		}
	} catch (error) {}
}

/**
 * Creates the politics object 
 */
async function restartPolitics() {
	//First, we create politics with all the roles that there are
	await createPoliticsRoles()

	//Then we have to add the new rules to politics
	await addRulesToPoliticsObject()

	//We create the views
	await createViews()
}

/**
 * Initializes the politics object with all the roles that exist in the rules, plus a general role (all).
 */
async function createPoliticsRoles() {
	//I initialize the object with the roles that are in config

	for (var i = 0; i < config.roles.length; i++) {
		politics[config.roles[i]] = { rules: [] }
	}
}

/**
 * Add the rules to the politics object
 */
async function addRulesToPoliticsObject() {
	//Loop through all the rules and assign them to politics with the class that belongs to it.
	for (var i in politicsAsRead) {
		for (var j = 0; j < politicsAsRead[i].rules.length; j++) {
			await addOneRuleToPoliticsObjects(politicsAsRead[i].rules[j])
		}
	}
}

/**
 * 
 * @param {Object} rule 
 * 
 * Add a rule to the politics object according to the roles it affects.
 * If it does not affect any role, it is added to "all".
 */
async function addOneRuleToPoliticsObjects(rule) {
	//I check if the rule has an associated role
	var haveRole = false

	if (rule.conditions !== undefined) {
		for (var i = 0; i < rule.conditions.length; i++) {
			if (rule.conditions[i].requester !== undefined) {
				if (rule.conditions[i].requester.role !== undefined) {
					//If there is a role, I have to add the politics rule within that role
					haveRole = true
					var role = rule.conditions[i].requester.role

					//Once created, we add
					//We use parse/stringify to enter a copy, not a pointer
					//So politicsAsRead is not modified, and is used for comparing changes

					//Deberia crear una copia de la regla eliminando los otros roles, para facilitar tareas despues
					var auxRule = JSON.parse(JSON.stringify(rule))
					//We store only the condition we are in.
					auxRule.conditions = [ rule.conditions[i] ]
					politics[role].rules.push(JSON.parse(JSON.stringify(auxRule)))
				}
			}
		}
	}

	//If you have read the rules and you do not have a role
	if (!haveRole) {
		//We add the rule to all roles
		for (var role in politics) {
			politics[role].rules.push(rule)
		}
	}
}

/**
 * Creates the views of the politics object
 */
async function createViews() {
	//We create the views for the entire politics object
	for (var type in politics) {
		for (var j = 0; j < politics[type].rules.length; j++) {
			if (politics[type].rules[j].action_type == 'GET') {
				//In rule.viewName we store the name of the view, and in rule.columns the columns contained in the view.
				//If there is a '*' in the rules, we do not have to create a view, you can access the whole table.
				politics[type].rules[j].viewColumns = await obtainViewColumns(politics[type].rules[j].resource)

				if (politics[type].rules[j].viewColumns[0] == '*') {
					politics[type].rules[j].viewName = 'personas'
				}
				else {
					var viewName = await createViewFromViewColumns(politics[type].rules[j], type, j)
					politics[type].rules[j].viewName = viewName
				}
			}
		}
	}
}

/**
 * 
 * @param {int} userId 
 * @param {String} method 
 * 
 * Updates the request counter for each user.
 * The counter is formatted { id: userId, count: { GET: 0, PUSH: 0, DELETE: 0, GETRST: 0, PUSHRST: 0, DELETERST: 0 } }
 */
async function updateRequestsCount(userId, method) {
	//We look to see if this user has made requests before.
	var index = await requestsCount.findIndex((element) => {
		return element.id == userId
	})

	if (index == -1) {
		//This user has not made requests before. We create the user inside the array
		requestsCount.push({ id: userId, count: { GET: 0, PUSH: 0, DELETE: 0, GETRST: 0, PUSHRST: 0, DELETERST: 0 } })
	}
	else {
		//The user had already made requests. We updated your counter
		requestsCount[index].count[method]++
	}
}

/**
 * 
 * @param {int} userId 
 * @param {String} method 
 * @param {String} clase 
 * 
 * Comprueba si el numero de intentos realizados por el usuario supera el número máximo permitido
 * 
 */
async function reachedMaxRequests(userId, method, type) {
	var exists = false

	//First we check if the parameter is defined in a rule or not.
	//We have to make a chain of checks so that it does not give an error.

	console.log('politics in error: ' + JSON.stringify(politics))
	console.log('type in error: ' + type)

	//We can leave conditions[0] because by creating politics we have ensured that it will only have one condition, that of its class or the general one.
	for (var i = 0; i < politics[type].rules.length; i++) {
		if (politics[type].rules[i].action_type == method) {
			if (politics[type].rules[i].conditions !== undefined) {
				if (politics[type].rules[i].conditions[0] !== undefined) {
					if (politics[type].rules[i].conditions[0].requester !== undefined) {
						if (politics[type].rules[i].conditions[0].requester.max_requests !== undefined) {
							//The parameter is defined, it is necessary to follow it
							exists = true
						}
					}
				}
			}
		}
	}

	if (!exists) {
		//continue making queries because the parameter does not exist.
		return false
	}

	//We look for the user in the array
	var index = await requestsCount.findIndex((element) => {
		return element.id == userId
	})

	//We check if the user has exceeded the number of attempts allowed for his class and rule.
	var max

	for (var i = 0; i < politics[type].rules.length; i++) {
		if (politics[type].rules[i].action_type == method) {
			//We are looking for the most restrictive

			if (politics[type].rules[i].conditions !== undefined) {
				if (politics[type].rules[i].conditions[0] !== undefined) {
					if (politics[type].rules[i].conditions[0].requester !== undefined) {
						if (politics[type].rules[i].conditions[0].requester.max_requests !== undefined) {
							//If everything exists in this rule, we check

							if (parseFloat(max) > parseFloat(politics[type].rules[i].conditions[0].requester.max_requests) || max == undefined) {
								max = politics[type].rules[i].conditions[0].requester.max_requests
							}
						}
					}
				}
			}
		}
	}

	//Once we have the maximum, we check

	if (max >= requestsCount[index].count[method]) {
		return false
	}
	else {
		if (requestsCount[index].count[method + 'RST'] == 0) {
			//Logic for resetting the counter
			requestsCount[index].count[method + 'RST'] = 1
			setTimeout(resetCount, 10000, index, method)
		}
		return true
	}
}

/**
 * 
 * @param {int} index 
 * @param {String} method 
 * 
 * Resets the user's number of attempts counters.
 * 
 */
async function resetCount(index, method) {
	requestsCount[index].count[method] = 0
	requestsCount[index].count[method + 'RST'] = 0
}

/**
 * 
 * @param {String} clase 
 * @param {String} method
 * 
 * Compares the time stored in the rules.
 * As the format is HH:MM in 24h, we can directly compare the strings
 * 
 */
async function timePeriodAllowed(type, method) {
	var exists = false

	console.log()

	//First we check if the parameter is defined in a rule or not.
	//We have to make a chain of checks so that it does not give an error.
	for (var i = 0; i < politics[type].rules.length; i++) {
		if (politics[type].rules[i].action_type == method) {
			if (politics[type].rules[i].conditions !== undefined) {
				if (politics[type].rules[i].conditions[0] !== undefined) {
					if (politics[type].rules[i].conditions[0].context !== undefined) {
						if (politics[type].rules[i].conditions[0].context.timeofday !== undefined) {
							//The parameter is defined, it is necessary to follow it
							exists = true
						}
					}
				}
			}
		}
	}

	if (!exists) {
		//continue making queries because the parameter does not exist.
		return true
	}

	//We check if the action the user is trying to perform is within the allowed timetable.

	//We process the current time
	var d = new Date()

	var currentTimeHHMM

	console.log(addZero(d.getHours() - 2))

	currentTimeHHMM = addZero(d.getHours() - 2) + ':' + addZero(d.getMinutes())

	for (var i = 0; i < politics[type].rules.length; i++) {
		if (politics[type].rules[i].action_type == method) {
			if (politics[type].rules[i].conditions !== undefined) {
				if (politics[type].rules[i].conditions[0] !== undefined) {
					if (politics[type].rules[i].conditions[0].context !== undefined) {
						if (politics[type].rules[i].conditions[0].context.timeofday !== undefined) {
							//The param timeofday is processed
							var periodsArray = politics[type].rules[i].conditions[0].context.timeofday.split(', ')

							for (var j = 0; j < periodsArray.length; j++) {
								periodsArray[j] = periodsArray[j].split(' - ')

								//We compare the time
								console.log('currentTime: ' + currentTimeHHMM)
								console.log('first limit: ' + periodsArray[j][0])
								console.log('second limit: ' + periodsArray[j][1])

								if (currentTimeHHMM > periodsArray[j][0]) {
									console.log('It is later than the first limit')
								}

								if (currentTimeHHMM < periodsArray[j][1]) {
									console.log('It is earlier than the second limit')
								}

								if (currentTimeHHMM > periodsArray[j][0] && currentTimeHHMM < periodsArray[j][1]) {
									return true
								}
							}
						}
					}
				}
			}
		}
	}

	return false
}

function addZero(i) {
	if (i < 10) {
		i = '0' + i
	}
	return i
}

/**
 * 
 * @param {String} stringSQL 
 * 
 * We check that the user's query is in a valid format
 */
async function validSQL(stringSQL) {
	//We check that it has SELECT as the first word

	var result = false

	if (/^(SELECT)/.test(stringSQL) && /(FROM)/.test(stringSQL)) {
		result = true
	}

	return result
}
