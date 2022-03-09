/* ===================================== Librerias ===================================== */

const https = require('https')
const http = require('http');
const fs = require('fs')
const path = require('path')
const helmet = require('helmet') //Para HSTS, necesario anadir
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const express = require('express')
const body_parser = require('body-parser') //necesario anadir
const util = require('util') // Para "promisify" las querys
const Promise = require('bluebird') //Para numeros aleatorios
const randomNumber = require('random-number-csprng') //Para numeros aleatorios
const axios = require('axios') // probamos con axios para generar http
const QueryString = require('qs')
const { Console } = require('console')

/* ===================================== Configuramos Express ===================================== */
var app = express()
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(helmet())
app.disable('etag') //Para desactivar los caches (evitando respuesta 304 Not Modified)

/* ===================================== Parametros SSL ===================================== */

var options = { 
    key:     fs.readFileSync('ssl/hellfish.test.key'), 
    cert:    fs.readFileSync('ssl/hellfish.test.crt'), 
    ca:      fs.readFileSync('ssl/myCA.pem'), 
    dhparam: fs.readFileSync('ssl/dhparam.pem'), 
    //Condiciones para el cliente:
    //requestCert        : true,
    //rejectUnauthorized : true
}; 

/* ================================= Parametros SSL para parte cliente ================================= */

const agentSSL = new https.Agent({
	key                 : fs.readFileSync('ssl/hellfish.test.key'),
	cert                : fs.readFileSync('ssl/hellfish.test.crt'),
	ca		     : fs.readFileSync('ssl/myCA.pem'),
})

const agent = new https.Agent({})

/* ================== Conexion con la base de datos (hecha con "factory function" warper para usar await) ================== */
var dbConfig = {
	host     : '10.152.183.137', //mysql master
	//host   : 'mysql-master.default.svc.cluster.local',
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

/* ===================================== Direcciones de modulos ===================================== */
// -- HTTPS --
//var gen = 'https://10.152.183.203:8083'
//var gen = 'https://gen.default.svc.cluster.local:8083';

// -- HTTP --
var gen = 'http://10.152.183.203:8083'
var arx = 'http://10.152.183.205:8083'

/* ===================================== Creacion del servidor ===================================== */
const puerto = 8082
//app.listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor escuchando en puerto ' + puerto))

/* ===================================== Lectura configuracion ===================================== */
const configPath = path.join(__dirname, 'politicas')
var config = {}
//updateConfig()

/* ===================================== Lectura reglas privacidad ===================================== */

/**
 * Hacemos una lectura inicial de todas las politicas acutales y creamos una view de sql para cada regla get de cada usuario.
 * Luego en cada get que recibimos comprobamos si la query y el filter de las políticas han cambiado. Si han cambiado,
 * borramos la view que existe para ese usuario, y creamos una nuvea. Eso debería ser una función a parte.
 * 
 * SQL no puede hacer una query con columnas que no existen en la view. Por eso, cada vez que creemos una view necesitamos
 * almacenar en un array las columnas que tiene esa view, para luego poder hacer una comparación con las que solicita el usuario
 * y meter en la query que hacemos en la base de datos solo las que existan dentro de la view
 */

const privacyRulesPath = path.join(__dirname, 'politicas')
var politics = {} // Formato: politics[role].rules[i]
var politicsAsRead = {}
//updateRules()

/* ===================================== Conteo de peticiones ===================================== */

// Almacena json tipo {id, count}
var requestsCount = []

/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	try {
		console.log('req.query: \n' + JSON.stringify(req.query))

		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateConfig()
		await updateRules()

		//Comprobamos que no se ha superado el limite de consultas
		await updateRequestsCount(req.query.id, 'GET')
		if (await reachedMaxRequests(req.query.id, 'GET', req.query.clase)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//Comprobamos que esta dentro del horario permitido
		if (!await timePeriodAllowed(req.query.clase, 'GET')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//Comprobamos que es una sentencia SQL valida
		if (!await validSQL(req.query.stringQuery)) {
			res.send('SQL sentence not valid')
			return 0
		}

		//Despues realizamos las querys a las diferentes vistas que tenga el usuario disponibles
		var datos = await querysAVistas(req.query.clase, req.query.stringQuery)

		//Ahora enviamos los datos a cada funcion segun el metodo asignado
		var datosProcesados = await procesarDatos(datos)

		res.send(datosProcesados)
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== POST ===================================== */

app.post('/', async function(req, res) {
	try {
		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateConfig()
		await updateRules()

		//Ahora comprobamos que el usuario tiene permitido hacer mas requests
		await updateRequestsCount(req.body.id, 'PUSH')
		if (await reachedMaxRequests(req.body.id, 'PUSH', req.body.clase)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//Comprobamos que esta dentro del horario permitido
		if (!await timePeriodAllowed(req.body.clase, 'PUSH')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//Vemos si tenemos permiso para introducir los datos
		var acceso = await tipoAccesoAccion(req.body.clase, 'PUSH')

		if (acceso == 0) {
			var respQuery = await introduzcoDatos(req.body.datos)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('No puede introducir datos')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== DELETE ===================================== */

app.delete('/', async function(req, res) {
	try {
		//Tenemos que combrobar si las reglas de privacidad han cambiado, y si han cambiado actualizarlas
		await updateConfig()
		await updateRules()

		//Ahora comprobamos que el usuario tiene permitido hacer mas requests
		await updateRequestsCount(req.body.idUser, 'DELETE')
		if (await reachedMaxRequests(req.body.idUser, 'DELETE', req.body.clase)) {
			res.send('You are not allowed to make more requests')
			return 0
		}

		//Comprobamos que esta dentro del horario permitido
		if (!await timePeriodAllowed(req.body.clase, 'DELETE')) {
			res.send('You are not allowed to make requests now')
			return 0
		}

		//Vemos si tenemos permiso para introducir los datos
		var acceso = await tipoAccesoAccion(req.body.clase, 'DELETE')

		if (acceso == 0) {
			var respQuery = await borroDatos(req.body.idToDelete)
			console.log(respQuery)
			res.send(respQuery)
		}
		else {
			res.send('No puede eliminar datos')
		}
	} catch (error) {
		console.log(error)
	}
})

/* ===================================== Funciones ===================================== */

/**
 * 
 * @param {String} clase 
 * @param {String} accion 
 * 
 * Comprueba si hay alguna regla con la accion solicitada para la clase
 * 
 * Devuelve: 0 si hay acceso, 1 si no hay acceso
 */
async function tipoAccesoAccion(clase, accion) {
	//Comprobamos si tenemos permiso para hacer PUSH o DELETE

	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == accion) {
			//Si tenemos permiso, devolvemos 0
			return 0
		}
	}

	//Si no hemos encontrado ninguna regla con permiso, devolvemos 1
	return 1
}

/**
 * 
 * @param {String} datos 
 * 
 * Almacena los datos introducidos por el usuario mediante la API en la base de datos
 * 
 * Devuelve: La respuesta de la base de datos
 */
async function introduzcoDatos(datos) {
	var datosTroceados = datos.split(', ')

	try {
		var resultado = await con.query(
			'INSERT INTO personas (nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad) VALUES (?,?,?,?,?,?,?,?,?)',
			datosTroceados
		)
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + resultado)
	return resultado
}

/**
 * 
 * @param {String} ids 
 * 
 * Elimina la fila con los ids determinados por el usuario
 * 
 * Devuelve: La respuesta de la base de datos
 */
async function borroDatos(ids) {
	var idsArray = ids.split(', ')

	try {
		var resultado = await con.query('DELETE FROM personas WHERE id IN (?)', [ idsArray ])
	} catch (err) {
		console.log(err)
		console.log(query.sql)
	}

	console.log('fun query result: ' + JSON.stringify(resultado))
	return resultado
}

/**
 *
 * 
 * @param {json} queryJson
 * @param {string} tabla
 * @param {string} fator
 * 
 * Devuelve: objeto json modificado con ruido
 */
async function ruido(queryJson, tabla, factor) {
	// console.log('me meto en ruido');

	//Por cada fila de la consulta:
	for (i in queryJson) {
		//Eliminamos la fila de id porque no nos interesa
		//delete queryJson[i]['id']

		//Deberiamos leer la ontología, y dependiendo del tipo de variable que sea añadirle el ruido definido en la ontología

		//Leemos el json de la ontologia
		let rawdata = fs.readFileSync('ontologia/ontologia.json')
		let ontologia = JSON.parse(rawdata)

		//Hacemos un bucle por la fila de la tabla
		//Con for in iteramos sobre las claves de un json
		for (keyTabla in queryJson[0]) {
			//Busco esta key en la ontología. Recordemos que en la ontología hay niveles.
			//Buscamos dentro de perosnas porque es la tabla en la que estamos buscando
			for (key1 in ontologia[tabla]) {
				for (key2 in ontologia[tabla][key1]) {
					if (key2 == keyTabla) {
						//Si es un string, sustituimos el valor por "*"
						if (ontologia[tabla][key1][key2].type == 'string') {
							queryJson[i][keyTabla] = '*'
						}
						//Si es un numero, le anadimos el ruido
						if (ontologia[tabla][key1][key2].type == 'number') {
							//Generamos el número aleatorio seguro

							numberGenerator = Promise.try(function() {
								return randomNumber(
									ontologia[tabla][key1][key2].maxNoise * factor * -100,
									ontologia[tabla][key1][key2].maxNoise * factor * 100
								)
							})
								.then(function(number) {
									queryJson[i][keyTabla] = queryJson[i][keyTabla] + number / 100
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
 * @param {String} nombreArchivo 
 * @param {int} iteracion 
 * 
 * Crea una view en la base de datos con la regla pasada por parámetro.
 *  
 * Devuelve: el nombre de la vista creada
 */
async function createViewFromRule(rule, nombreArchivo, iteracion) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + nombreArchivo + '_' + iteracion + ' AS ' + rule.resource

	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//Realizamos las querys
	try {
		var resultado = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	return 'personas_' + nombreArchivo + '_' + iteracion
}

/**
 * 
 * @param {*} rule 
 * @param {String} clase 
 * @param {int} iteracion 
 * 
 * Crea una view en la base de datos con la regla pasada por parámetro.
 * Utiliza el campo "viewColumns" a la hora de crear las vistas.
 *  
 * Devuelve: el nombre de la vista creada
 */
async function createViewFromViewColumns(rule, clase, iteracion) {
	var stringQuery = 'CREATE OR REPLACE VIEW personas_' + clase + '_' + iteracion + ' AS '

	//Creamos la parte del SELECT
	var stringSelect = 'SELECT '

	//Añadimos las columnas
	for (var i = 0; i < rule.viewColumns.length; i++) {
		stringSelect = stringSelect + rule.viewColumns[i] + ', '
	}

	//Quitamos la ultima coma y espacio, y completamos
	stringSelect = stringSelect.slice(0, -2)
	stringSelect = stringSelect + ' FROM personas'

	//y añadimos
	stringQuery = stringQuery + stringSelect

	//Si tiene filtro, lo añadimos
	if (!(rule.filter === undefined)) {
		stringQuery = stringQuery + ' ' + rule.filter
	}

	//Realizamos las querys
	try {
		var resultado = await con.query(stringQuery)
	} catch (err) {
		console.log(err)
	}

	//Y devolvemos el nombre de la vista
	return 'personas_' + clase + '_' + iteracion
}

/**
 * 
 * @param {String} claseUsuario 
 * @param {String} queryUsuario 
 * 
 * Realiza las querys a las vistas que tiene disponibles el usuario,
 * en funcion del metodo de privacidad que puede utilizar. Cada metodo de privacidad (cada regla) tiene una vista
 * 
 * Devuelve: un array de jsons con formato {privacy_method:____, resultados:____}
 */
async function querysAVistas(claseUsuario, queryUsuario) {
	/**
	 * Vamos a dejar una vista por cada regla GET, y dentro de nuestro objeto regla introducimos un array
	 * de columnas que son las que se definen en esa regla.
	 * 
	 * A la hora de hacer las querys a las vistas, tenemos que controlas los * que representan a todas las columnas,
	 * tanto en el usuario como las que hay almacenadas en el campo reglas.columnas
	 */

	var resultadoFinal = []
	var queryUsuarioArray = queryUsuario.split(' ')

	//Por cada regla con GET
	for (var i = 0; i < politics[claseUsuario].rules.length; i++) {
		if (politics[claseUsuario].rules[i].action_type == 'GET') {
			//Monto la query

			var indexFrom = queryUsuarioArray.indexOf('FROM')
			var columnasArray = []
			var nombreTablaString = ''

			//Hacemos cosas distintas en funcion de la posición de la query en la que estemos
			//Algunas partes de la string las guardamos en string distintas para poder evitar SQL injection
			var j = 0

			// ----- SELECT ------
			//queryString = queryString + queryUsuarioArray[0] + ' '

			// ----- COLUMNAS -----
			//Tenemos que escapar las columnas que vienen del usuario
			if (politics[claseUsuario].rules[i].viewColumns[0] == '*') {
				//Si en las reglas hay un *, dejamos la query del usuario

				//Primero quitamos la , que pueda quedar en la query del usuario
				queryUsuarioArray[j] = queryUsuarioArray[j].replace(',', '')

				//Si en las reglas hay un *, podemos dejar la query del usuario como esta añadiendole la columna id
				for (j = 1; j < indexFrom; j++) {
					columnasArray.push(queryUsuarioArray[j])
				}
				columnasArray.push('id')
			}
			else if (queryUsuarioArray[1] == '*') {
				//Si en el usuario hay un *, podemos realizar esta query porque la vista esta filtrada ya
				columnasArray.push(queryUsuarioArray[1])
			}
			else {
				//Si hay columnas en el usuario y en las reglas, tenemos que hacer la comparacion
				for (j = 1; j < indexFrom; j++) {
					//Primero quitamos la , que pueda quedar en la query del usuario
					queryUsuarioArray[j] = queryUsuarioArray[j].replace(',', '')
					//Luego comparamos
					politics[claseUsuario].rules[i].viewColumns.forEach((element) => {
						if (element == queryUsuarioArray[j]) {
							//Si coincide alguna columna, la ponemos dentro de la query
							columnasArray.push(queryUsuarioArray[j])
						}
					})
				}
				//Añadimos id
				columnasArray.push('id')
			}

			// ----- FROM -----
			//queryString = queryString + queryUsuarioArray[indexFrom] + ' '

			// ----- NOMBRE DE LA TABLA -----
			//Hay que cambiarlo por el nombre de la vista
			nombreTablaString = nombreTablaString + politics[claseUsuario].rules[i].viewName

			// ----- WHERE Y CONDICIONES -----
			//Vamos a quitar el where porque es copmlicado escaparlo
			//Lo dejamos igual
			// for (j = indexFrom + 3; j < queryUsuarioArray.length; j++) {
			// 	whereString = whereString + queryUsuarioArray[j] + ' '
			// }

			//Realizamos varias comprobaciones
			var allow = true

			//Si en columnas array solo esta id, no enviamos la query
			if (columnasArray[0] == 'id') {
				allow = false
			}

			//Si es generalization y no es *, no enviamos la query
			if (politics[claseUsuario].rules[i].privacy_method == 'Generalization' && columnasArray[0] != '*') {
				allow = false
			}
			//Si es KAnonimity y no es *, no enviamos la query
			if (politics[claseUsuario].rules[i].privacy_method == 'KAnonimity' && columnasArray[0] != '*') {
				allow = false
			}
			if (allow) {
				console.log('querys que se mandan: ' + 'SELECT ' + columnasArray + ' FROM `' + nombreTablaString + '`')

				try {
					if (columnasArray[0] == '*') {
						var resultado = await con.query('SELECT * FROM ??', nombreTablaString)
						console.log(resultado)
						console.log('______________________________________')
					}
					else {
						var resultado = await con.query('SELECT ?? FROM ??', [ columnasArray, nombreTablaString ])
						console.log(resultado)
					}
				} catch (err) {
					console.log(err)
				}

				resultadoFinal.push({
					privacy_method : politics[claseUsuario].rules[i].privacy_method,
					datosSQL       : resultado
				})
			}
		}
	}

	return resultadoFinal
}

/**
 * 
 * @param {String} queryString //query almacenada en las reglas
 * 
 * Devuelve: un array con las columnas despues del SELECT
 */
async function obtainViewColumns(queryString) {
	var queryStringArray = queryString.split(' ')
	var resultado = []

	//Si la segunda palabra es un *, lo guardamos y lo devolvemos directamente
	if (queryStringArray[1] == '*') {
		resultado.push('*')
	}
	else {
		//Si no es un *, tenemos que quedarnos con las posiciones 1 hasta FROM

		var exit = 0
		var i = 1
		while (i < queryStringArray.length && exit == 0) {
			if (queryStringArray[i] == 'FROM') {
				exit = 1
			}
			else {
				resultado.push(queryStringArray[i].replace(',', ''))
				i++
			}
		}
	}

	//Añadimos la columna ID para poder juntar despues los datos de personas de diferentes metodos
	resultado.push('id')

	return resultado
}

/**
 * 
 * @param {Array} datos 
 * La estructura de datos es: [{privacy_method:________, datosSQL:_________}{}...]
 * 
 * Devuelve: los datos procesados
 */
async function procesarDatos(datos) {
	var datosProcesados = []
	var datosAux = [] //Array donde mezclaremos los datos
	var resultado = []

	for (var i = 0; i < datos.length; i++) {
		if (datos[i].privacy_method == 'Exact') {
			//No hacemos nada, los devolvemos tal cual
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : datos[i].datosSQL
			})
		}
		else if (datos[i].privacy_method == 'MinNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 0.1)
			})
		}
		else if (datos[i].privacy_method == 'MedNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 0.5)
			})
		}
		else if (datos[i].privacy_method == 'MaxNoise') {
			datosProcesados.push({
				privacy_method  : datos[i].privacy_method,
				datosProcesados : await ruido(datos[i].datosSQL, 'personas', 1)
			})
		}
		else if (datos[i].privacy_method == 'Generalization') {
			//Hacemos llamada al modulo de generalizar
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(gen)
				datosProcesados.push({
					privacy_method  : datos[i].privacy_method,
					datosProcesados : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		else if (datos[i].privacy_method == 'KAnonimity') {
			//Hacemos llamada al modulo de KAnonimity
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(arx, {
					params: {
						method: 'KAnonimity'
					}
				})
				datosProcesados.push({
					privacy_method  : datos[i].privacy_method,
					datosProcesados : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		else if (datos[i].privacy_method == 'LDiversity') {
			//Hacemos llamada al modulo de LDiversity
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(arx, {
					params: {
						method: 'LDiversity'
					}
				})
				datosProcesados.push({
					privacy_method  : datos[i].privacy_method,
					datosProcesados : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
		
		else if (datos[i].privacy_method == 'TCloseness') {
			//Hacemos llamada al modulo de KAnonimity
			try {
				//Dado que en un futuro quitaremos esta conexion, la dejamos sin ssl
				//var response = await axios.get(gen, { httpsAgent: agentSSL })
				var response = await axios.get(arx, {
					params: {
						method: 'TCloseness'
					}
				})
				datosProcesados.push({
					privacy_method  : datos[i].privacy_method,
					datosProcesados : response.data
				})
			} catch (error) {
				console.log(error)
			}
		}
	}

	return datosProcesados
}

/**
 * Lee las clases que existen del archivo config.json
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
 * Lee las politicas de privacidad. Comprueba si han cambiado, y si es asi las actualiza.
 */
async function updateRules() {
	/**
	 * Vamos a cambiar la forma de leer las politicas de privacidad.
	 * Lo que se hara es buscar el rol (la clase) a la que afecta la regla (si no tiene rol, podemos decir que se aplica
	 * a todas las clases) y separar las reglas por clases dento del json
	 * 
	 * Se leeran los ficheros politics*.json
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
			// files[i] es el nombre del archivo. leemos todos los "politics*.json"

			if (/^(politics)[0-9]*\.json$/.test(files[i])) {
				var fileNoExtension = files[i].slice(0, files[i].length - 5)

				//Leemos el archivo
				var auxPol = fs.readFileSync(path.join(privacyRulesPath, files[i]))

				//Y comparamos con lo que ya hay guardado

				if (JSON.stringify(politicsAsRead[fileNoExtension]) == JSON.stringify(JSON.parse(auxPol))) {
					//Si es igual, no tenemos que actualizar nada
				}
				else {
					//Si ha cambiado, guardamos el nuevo archivo y activamos un flag
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
 * Crea el objeto politics 
 */
async function restartPolitics() {
	//Primero creamos politics con todos los roles que hay
	await createPoliticsRoles()

	//Despues tenemos que añadir las reglas nuevas a politics
	await addRulesToPoliticsObject()

	//Creamos las views
	await createViews()
}

/**
 * Inicializa el objeto politics con todos los roles que existan en las reglas, mas uno de caracter general (all)
 */
async function createPoliticsRoles() {
	//Inicializo el objeto con los roles que hay en config

	for (var i = 0; i < config.roles.length; i++) {
		politics[config.roles[i]] = { rules: [] }
	}
}

/**
 * Añade las reglas al objeto politics
 */
async function addRulesToPoliticsObject() {
	//Bucle a traves de todas las reglas y las asino a politics con la clase que le pertenece
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
 * Anade una regla al objeto politics segun los roles a los que afecta.
 * Si no afecta a ningun rol, se anade a "all"
 */
async function addOneRuleToPoliticsObjects(rule) {
	//Compruebo si la regla tiene un rol asociado
	var haveRole = false

	if (rule.conditions !== undefined) {
		for (var i = 0; i < rule.conditions.length; i++) {
			if (rule.conditions[i].requester !== undefined) {
				if (rule.conditions[i].requester.role !== undefined) {
					//Si hay un rol, tengo que añadir la regla politics dentro de ese rol
					haveRole = true
					var role = rule.conditions[i].requester.role

					//Una vez creado, lo añadimos
					//Utilizamos parse/stringify para introducir una copia, y no un puntero.
					//Asi politicsAsRead no se modifica, y se utiliza para comparar cambios

					//Deberia crear una copia de la regla eliminando los otros roles, para facilitar tareas despues
					var auxRule = JSON.parse(JSON.stringify(rule))
					//Almacenamos solo la condicion en la que estamos
					auxRule.conditions = [ rule.conditions[i] ]
					politics[role].rules.push(JSON.parse(JSON.stringify(auxRule)))
				}
			}
		}
	}

	//Si se han leido las reglas y no tienen rol
	if (!haveRole) {
		//Añadimos la regla a todos los roles
		for (var role in politics) {
			politics[role].rules.push(rule)
		}
	}
}

/**
 * Crea las views del objeto politics
 */
async function createViews() {
	//Creamos las views para todo el objeto politics
	for (var clase in politics) {
		for (var j = 0; j < politics[clase].rules.length; j++) {
			if (politics[clase].rules[j].action_type == 'GET') {
				//En rule.viewName almacenamos el nombre de la vista, y en rule.columns las columnas que contiene la vista
				//Si en las reglas hay un *, no tenemos que crear una view, puede acceder a toda la tabla
				politics[clase].rules[j].viewColumns = await obtainViewColumns(politics[clase].rules[j].resource)

				if (politics[clase].rules[j].viewColumns[0] == '*') {
					politics[clase].rules[j].viewName = 'personas'
				}
				else {
					var viewName = await createViewFromViewColumns(politics[clase].rules[j], clase, j)
					politics[clase].rules[j].viewName = viewName
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
 * Actualiza el contador de peticiones de cada usuario
 * El contador tiene formato { id: userId, count: { GET: 0, PUSH: 0, DELETE: 0, GETRST: 0, PUSHRST: 0, DELETERST: 0 } }
 */
async function updateRequestsCount(userId, method) {
	//Buscamos si este usuario ha realiado peticiones anteriormente
	var index = await requestsCount.findIndex((element) => {
		return element.id == userId
	})

	if (index == -1) {
		//Este usuario no ha realizado peticiones antes. Creamos el usuario dentro del array
		requestsCount.push({ id: userId, count: { GET: 0, PUSH: 0, DELETE: 0, GETRST: 0, PUSHRST: 0, DELETERST: 0 } })
	}
	else {
		//El usuario ya habia realizado peticiones. Actualizamos su contador
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
async function reachedMaxRequests(userId, method, clase) {
	var exists = false

	//Primero comprobamos si el paramtero esta definido en alguna regla o no
	//Tenemos que hacer una cadena de comprobaciones para que no de error

	console.log('politics en error: ' + JSON.stringify(politics))
	console.log('clase en error: ' + clase)

	//Podemos dejar conditions[0] porque al crear politics nos hemos asegurado de que solo tendra una conditions, la de su clase o la general
	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == method) {
			if (politics[clase].rules[i].conditions !== undefined) {
				if (politics[clase].rules[i].conditions[0] !== undefined) {
					if (politics[clase].rules[i].conditions[0].requester !== undefined) {
						if (politics[clase].rules[i].conditions[0].requester.max_requests !== undefined) {
							//El parametro esta definido, hay que hacerle caso
							exists = true
						}
					}
				}
			}
		}
	}

	if (!exists) {
		//Puede seguir haciendo queries dado que el parametro no existe
		return false
	}

	//Buscamos al usuario en el array
	var index = await requestsCount.findIndex((element) => {
		return element.id == userId
	})

	//Comprobamos si ha superado el numero de intentos permitidos de su clase y su regla

	var max

	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == method) {
			//Buscamos la mas restrictiva

			if (politics[clase].rules[i].conditions !== undefined) {
				if (politics[clase].rules[i].conditions[0] !== undefined) {
					if (politics[clase].rules[i].conditions[0].requester !== undefined) {
						if (politics[clase].rules[i].conditions[0].requester.max_requests !== undefined) {
							//Si todo existe en esta regla, comprobamos

							if (parseFloat(max) > parseFloat(politics[clase].rules[i].conditions[0].requester.max_requests) || max == undefined) {
								max = politics[clase].rules[i].conditions[0].requester.max_requests
							}
						}
					}
				}
			}
		}
	}

	//Una vez que tenemos el menor, comprobamos

	if (max >= requestsCount[index].count[method]) {
		return false
	}
	else {
		if (requestsCount[index].count[method + 'RST'] == 0) {
			//Logica para resetear el contador
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
 * Reinicia los contadores de número de intentos del usuario
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
 * Compara el tiempo almacenado en las reglas.
 * Como el formato es HH:MM en 24h, se pueden comparar directamente las strings
 * 
 */
async function timePeriodAllowed(clase, method) {
	var exists = false

	console.log()

	//Primero comprobamos si el paramtero esta definido en alguna regla o no
	//Tenemos que hacer una cadena de comprobaciones para que no de error
	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == method) {
			if (politics[clase].rules[i].conditions !== undefined) {
				if (politics[clase].rules[i].conditions[0] !== undefined) {
					if (politics[clase].rules[i].conditions[0].context !== undefined) {
						if (politics[clase].rules[i].conditions[0].context.timeofday !== undefined) {
							//El parametro esta definido, hay que hacerle caso
							exists = true
						}
					}
				}
			}
		}
	}

	if (!exists) {
		//Puede seguir haciendo queries dado que el parametro no existe
		return true
	}

	//Comprobamos si la accion que intenta realizar esta dentro del horario permitido

	//Procesamos el tiempo actual
	var d = new Date()

	var currentTimeHHMM

	console.log(addZero(d.getHours() - 2))

	currentTimeHHMM = addZero(d.getHours() - 2) + ':' + addZero(d.getMinutes())

	for (var i = 0; i < politics[clase].rules.length; i++) {
		if (politics[clase].rules[i].action_type == method) {
			//Comprobamos que existe el parametro
			if (politics[clase].rules[i].conditions !== undefined) {
				if (politics[clase].rules[i].conditions[0] !== undefined) {
					if (politics[clase].rules[i].conditions[0].context !== undefined) {
						if (politics[clase].rules[i].conditions[0].context.timeofday !== undefined) {
							//Y procesamos el param timeofday
							var periodsArray = politics[clase].rules[i].conditions[0].context.timeofday.split(', ')

							for (var j = 0; j < periodsArray.length; j++) {
								periodsArray[j] = periodsArray[j].split(' - ')

								//Y comparamos los horarios
								console.log('currentTime: ' + currentTimeHHMM)
								console.log('first limit: ' + periodsArray[j][0])
								console.log('second limit: ' + periodsArray[j][1])

								if (currentTimeHHMM > periodsArray[j][0]) {
									console.log('Es mas tarde que el primer limite')
								}

								if (currentTimeHHMM < periodsArray[j][1]) {
									console.log('Es mas temprano que el segundo limite')
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

	console.log('Llego al final, return false')
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
 * Comprobamos que la query del usuario tiene un formato valido
 */
async function validSQL(stringSQL) {
	//Comprobamos que tenga SELECT como la primera palabra

	var result = false

	if (/^(SELECT)/.test(stringSQL) && /(FROM)/.test(stringSQL)) {
		result = true
	}

	return result
}
