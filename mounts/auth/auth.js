/* ===================================== Librerias ===================================== */

var https = require('https')
var http = require('http')
var fs = require('fs')
var helmet = require('helmet') //Para HSTS, necesario anadir
var mysql = require('mysql')
var jwt = require('jsonwebtoken')
var express = require('express')
var body_parser = require('body-parser') //necesario anadir
const util = require('util') // Para "promisify" las querys

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

/* ================== Conexion con la base de datos (hecha con "factory function" warper para usar await) ================== */
var dbConfig = {
	//host     : '10.152.183.232', //mysql read
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

/* ===================================== Creacion del servidor ===================================== */

const puerto = 8081
//app.listen(puerto, () => console.log('Servidor http escuchando en puerto ' + puerto));
https.createServer(options, app).listen(puerto, () => console.log('Servidor https escuchando en puerto ' + puerto))

/* ===================================== GET ===================================== */

app.get('/', function(req, res) {
	res.send('Para autenticarte, debes mandar tu "email" y tu "contrasena" mediante POST')
})

/* ===================================== POST ===================================== */

/**Yo recibo un post con un usuario y contrasena
 * y le devuelvo un token */

app.post('/', async function(req, res) {
	//Habria que almacenar un hash en vez de la contraseña

	//Comprobamos si me mandan email o usuario, token o nada
	if (typeof req.body.token !== 'undefined') {
		//se ha enviado token
		//respondo con la traduccion del token
		var payload = jwt.verify(req.body.token, 'shhhhh')
		console.log('Me han enviado un token')
		console.log('Payload: ' + JSON.stringify(payload))
		res.status(200).send({ id: payload.id, clase: payload.clase })
		return
	}
	else if (typeof req.body.email !== 'undefined' || typeof req.body.contrasena !== 'undefined') {
		//se ha enviado correo y contraseña
		//Comprobamos si la contrasena es correcta
		var resultado = await comprobarContrasena(req.body.email, req.body.contrasena)
		if (resultado == 2) {
			//Contraseña incorrecta
			res.status(401).send('Contraseña incorrecta')
		}
		else if (resultado == 1) {
			//Usuario no existe
			res.status(401).send('El usuario no existe')
		}
		else {
			//Correcta, le hago el token (id, clase) y lo devuelvo
			//console.log({ id: resultado.id, clase: resultado.clase })
			var token = jwt.sign({ id: resultado.id, clase: resultado.clase }, 'shhhhh')
			var object = new Object()
			object.token = token
			res.send(object)
		}
	}
	else {
		console.log('No se ha introducido email o contrasena')
		console.log('req.body: ' + JSON.stringify(req.body))
		res.status(400).send('No se ha introducido email o contrasena')
		return
	}
})

/* ===================================== Funciones ===================================== */

/**comprobarContrasena
 * Devuelve:
 * objeto con id y clase si la contraseña es correcta
 * 1 si no se encuentra el usuario
 * 2 si la contrasena no es correcta
 */
async function comprobarContrasena(email, contrasena) {
	//Hay que ver si tiene autorizacion:
	var result = await con.query('SELECT contrasena, clase, id FROM usuarios WHERE email=?', email)

	//Vemos si existe el usuario:
	console.log('result[0] ' + result[0]) //devuelve un array con un json dentro

	if (typeof result[0] === 'undefined') {
		//no se han devuelto datos desde la bbdd
		console.log('El usuario no existe')
		return 1
	}

	console.log('contrasenaQuery: : ' + result[0].contrasena + '.')
	console.log('contrasena proporcionada: ' + contrasena + '.')

	//Vemos si la contrasena es correcta
	if (result[0].contrasena != contrasena) {
		//Si no tengo acceso, no borro el mensaje
		console.log('La contraseña es incorrecta')
		return 2
	}

	//Si llego hasta aqui, todo correcto. Devuelvo el resultado de la query
	console.log('clase: ' + result[0].clase)
	return result[0] //El objeto json de la query que hay dentro del array.
}
