/* ===================================== Librerias ===================================== */

var https = require('https')
var http = require('http')
var fs = require('fs')
var helmet = require('helmet') //Para HSTS, necesario anadir
var mysql = require('mysql')
var jwt = require('jsonwebtoken')
var express = require('express')
var body_parser = require('body-parser') //necesario anadir
const axios = require('axios') // probamos con axios para generar http

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
}; 

/* ================================= Parametros SSL para parte cliente ================================= */

const agentSSL = new https.Agent({
	key                 : fs.readFileSync('ssl/hellfish.test.key'),
	cert                : fs.readFileSync('ssl/hellfish.test.crt'),
	ca		     : fs.readFileSync('ssl/myCA.pem'), 
	//For disabling host ip doesn't match. Remove in production
	checkServerIdentity : () => undefined
})

/* ================== Conexion con la base de datos (hecha con "factory function" warper para usar await) ================== */

var con = mysql.createConnection({
	//host     : '10.152.183.137',
	host     : 'mysql-master.default.svc.cluster.local',
	user     : 'root',
	password : '',
	database : 'test'
})

/* ===================================== Direcciones de modulos ===================================== */
// -- HTTPS --

//var auth = 'https://10.152.183.201:8081';
var auth = 'https://auth.default.svc.cluster.local:8081'

//var priv = 'http://10.152.183.202:8082';
var priv = 'https://priv.default.svc.cluster.local:8082'

//Para desarrollar desde local
//var priv = 'https://192.168.0.193:8082'
//Para desarrollar en trabajo
//var priv = 'https://172.16.153.233:8082'

/* ===================================== Creacion del servidor ===================================== */
const puerto = 8080
//app.listen(puerto, () => console.log('Servidor http escuchando en puerto ' + puerto));
//https.createServer(options, app).listen(puerto, () => console.log('Servidor https escuchando en puerto ' + puerto))
https.createServer(options, app).listen(puerto, () => console.log('Servidor https escuchando en puerto ' + puerto))


/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	console.log('req.query.token: ' + req.query.token)
	console.log('req.query.stringQuery: ' + req.query.stringQuery)

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.query.token === 'undefined' || typeof req.query.stringQuery === 'undefined') {
		res.send('No se ha introducido token o stringQuery')
		return
	}

	//Obtenemos la clase del token que nos han enviado
	var resultado = await comprobarToken(req.query.token)

	console.log(JSON.stringify(resultado))
	console.log('resultado.id: ' + resultado.id, ' resultado.clase: ' + resultado.clase)

	//Enviamos el id de usuario, la clase y la solicitud a priv
	var dato = await envioGETPriv(resultado.id, resultado.clase, req.query.stringQuery)

	//Cuando recibimos el dato deseado, lo mostramos por pantalla
	res.send(dato)
	return
})

/* ===================================== POST ===================================== */

app.post('/', function(req, res) {
	console.log('req.body.token: ' + req.body.token)
	console.log('req.body.datos: ' + req.body.datos)

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.body.token === 'undefined' || typeof req.body.datos === 'undefined') {
		res.send('No se ha introducido token o datos')
		return
	}

	//Comprobamos que la longitud de los datos es correcta
	if (req.body.datos.split(', ').length != 9) {
		res.send('Longitud: ' + req.body.datos.split(', ').length + 'No se han introducido bien los datos')
		return
	}

	//Obtenemos la clase del token que nos han enviado
	comprobarToken(req.body.token)
		.then((resultado) => {
			console.log('resultado: ' + resultado)
			//Enviamos la clase a priv junto con los datos
			return envioPOSTPriv(resultado.clase, resultado.id, req.body.datos)
		})
		.then((respuesta) => {
			//Cuando recibimos la respuesta la enviamos
			res.send(respuesta)
			return
		})
})

/* ===================================== DELETE ===================================== */

app.delete('/', function(req, res) {
	//Borraremos los datos en base al id

	console.log('req.body.token: ' + req.body.token)
	console.log('req.body.id: ' + req.body.id)

	//Comprobamos que se han introducido los datos necesarios
	if (typeof req.body.token === 'undefined' || typeof req.body.id === 'undefined') {
		res.send('No se ha introducido token o id')
		return
	}

	//Obtenemos la clase del token que nos han enviado
	comprobarToken(req.body.token)
		.then((resultado) => {
			console.log('resultado: ' + resultado)
			//Enviamos la clase a priv junto con los datos
			return envioDELETEPriv(resultado.clase, resultado.id, req.body.id)
		})
		.then((respuesta) => {
			//Cuando recibimos la respuesta la enviamos
			res.send(respuesta)
			return
		})
})


/* ===================================== Funciones ===================================== */

/**comprobarToken
 * Devuelve:
 * json {clase, id} si todo va bien
 * 1 si el token no es valido (hay que implementarlo en auth)
 */
async function comprobarToken(token) {
	//Hacemos una petición a auth, y le pasamos el mensaje.

	var respuesta = ''

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
			respuesta = response.data
		})
		.catch(function(error) {
			console.log(error)
		})
	return respuesta
}

async function envioGETPriv(id, clase, stringQuery) {
	//Hay que implementar los distintos metodos segun la funcion que este usando.
	//Por ahora implementamos el GET

	var respuesta = ''
	//var priv = 'http://10.152.183.202:8082';
	//var priv = 'http://priv.default.svc.cluster.local:8082';
	var params = {
		id          : id,
		clase       : clase,
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
			respuesta = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return respuesta
}

async function envioPOSTPriv(clase, id, datos) {
	//Por ahora implementamos el POST

	var respuesta = ''
	//var priv = 'https://10.152.183.202:8082';
	//var priv = 'https://priv.default.svc.cluster.local:8082';
	var params = {
		clase : clase,
		id    : id,
		datos : datos
	}

	console.log('Params: ' + JSON.stringify(params))

	await axios
		.post(priv, params, {
			httpsAgent : agentSSL
		})
		.then(function(response) {
			console.log(response.data)
			respuesta = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return respuesta
}

async function envioDELETEPriv(clase, idUser, idToDelete) {
	//Por ahora implementamos el DELETE

	var respuesta = ''
	//var priv = 'https://10.152.183.202:8082';
	//var priv = 'https://priv.default.svc.cluster.local:8082';
	var data = {
		clase      : clase,
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
			respuesta = response.data
		})
		.catch(function(error) {
			console.log(error)
		})

	return respuesta
}
