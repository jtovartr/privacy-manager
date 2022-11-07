const {MongoClient, Binary} = require('mongodb');
const { ClientEncryption } = require('mongodb-client-encryption');
const http = require("http");
var https = require('https')
var express = require('express')
var helmet = require('helmet') // HSTS, necessary to add
var express = require('express')
var body_parser = require('body-parser') //necessary to add
const util = require('util') // To "promisify" the queries
const base64 = require('uuid-base64');
const fs = require('fs');
const crypto = require('crypto');

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

/* ===================================== Server Creation ===================================== */

const port = 8081
https.createServer(options, app).listen(port, () => console.log('HTTPS server listening on port ' + port))

// Database connection
const connectionString = 'mongodb://10.152.183.55:27017'
const keyVaultNamespace = 'encryption.__keyVault'
// client configuration
const client = new MongoClient(connectionString, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// kms specification
const provider = "gcp";

// TODO: put correct credentials
// Example:
const kmsProviders = {
  gcp: {
    email: "nicslab-958@privacymanager...", // IAM email
    privateKey: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...", // Privaty Key
  },
};


// TODO: put correct master key data
// master key creation example
const masterKey = {
  projectId: "privacymanager...",
  location: "europe...",
  keyRing: "keyring",
  keyName: "MasterKey",
};

// reading the json with the key name of the column
let rawdata = fs.readFileSync('scheme.json');
let scheme = JSON.parse(rawdata)

// controls that the key creation process is performed only once
var create_keys = new Boolean(true);

client.connect()

// Creation of the encrypted client
const encryption = new ClientEncryption(client, {
	keyVaultNamespace,
    kmsProviders,
});

// name of the database and collection where the generated keys are stored
const keyDB_encryption = client.db('encryption');
const keyColl = keyDB_encryption.collection('__keyVault');
// name of the database and collection where the data of the persons are stored
const keyDB_test = client.db('test');
const collection = keyDB_test.collection("patients");

// when the privacy manager is initialized the necessary keys are created
if (create_keys) {
	createKeys()
	create_keys = false
}

/* ===================================== GET ===================================== */

app.get('/', async function(req, res) {
	try {
		// if a name is not entered, all documents in the collection are returned
		if (req.query.stringQuery === '') {
			var data = [];
    		const cursor = await collection.find({});
    		// Each document is inserted into the array data
  			await cursor.forEach(doc => data.push(doc));
			
			// The array data is iterated and the documents are decrypted.
			for (var i = 0; i < data.length; i++){
				var obj = data[i]
				obj.name = await encryption.decrypt(obj.name);
    			obj.age = await encryption.decrypt(obj.age);
    			obj.lat = await encryption.decrypt(obj.lat);
    			obj.lon = await encryption.decrypt(obj.lon);
    			obj.job = await encryption.decrypt(obj.job);
    			obj.salary = await encryption.decrypt(obj.salary);
    			obj.pulse = await encryption.decrypt(obj.pulse);
    			obj.temperature = await encryption.decrypt(obj.temperature);
    			obj.disease = await encryption.decrypt(obj.disease);
			}
			
    			res.send(data)
		}
		// if a name is entered, the document belonging to that person is returned
		else {
			// the name entered by the user is read and encrypted with the key corresponding to the name column and the algorithm
			queryEncryptedName = await encryption.encrypt(req.query.stringQuery, {
      				algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
     				keyId: await getKey('name'),
    			});
    			// search for the person with the name entered by the user in encrypted form
			doc = await findPatient(queryEncryptedName)
		
			res.send(doc)
		}
	
   	} catch (e) {
        	console.error(e);
	}
})

/* ===================================== POST ===================================== */

app.post('/', async function(req, res) {

	// separate the data entered by the user
	var data_split = req.body.data.split(', ')
	// number of data entered must be 9
	if(data_split.length != 9) {
		res.send('Longitud: ' + data_split.length + ' Data entered incorrectly')
	}
	
	// the data entered by the user must be encrypted with the corresponding key
	encryptedName = await encryption.encrypt(data_split[0], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
      	keyId: await getKey('name'),
    });
    encryptedAge = await encryption.encrypt(data_split[1], {
     	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('age'),
    });
    encryptedLat = await encryption.encrypt(data_split[2], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('lat'),
    });
    encryptedLon = await encryption.encrypt(data_split[3], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
      	keyId: await getKey('lon'),
    });
    encryptedJob = await encryption.encrypt(data_split[4], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('job'),
    });
    encryptedSalary = await encryption.encrypt(data_split[5], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('salary'),
    });
    encryptedPulse= await encryption.encrypt(data_split[6], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
      	keyId: await getKey('pulse'),
    });
    encryptedTemperature = await encryption.encrypt(data_split[7], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('temperature'),
    });
    encryptedDisease = await encryption.encrypt(data_split[8], {
      	algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
      	keyId: await getKey('disease'),
    });
	
	// encrypted data is inserted into the database
	await insertPatient(encryptedName, encryptedAge, encryptedLat, encryptedLon, encryptedJob, encryptedSalary, encryptedPulse, encryptedTemperature, encryptedDisease)
	
	res.send('inserted data')
	
})

/* ===================================== DELETE ===================================== */

app.delete('/', async function(req, res) {
	
	// the name entered by the user is read and encrypted with the key corresponding to the name column and the algorithm
	queryEncryptedName = await encryption.encrypt(req.body.name, {
      		algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
     		keyId: await getKey('name'),
    	});
    	
    	// the query is launched with the encrypted name
    	const result = await collection.deleteOne({ name: queryEncryptedName });
    	res.send('deleted data')
})

/* ===================================== Functions ===================================== */

/**
 * createKeys: Method that generates the keys for each column of the collection
 */
async function createKeys() {
	// The json is iterated, the key names are read and these names are assigned to each key that is generated
	for(var attributename in scheme){
    		await encryption.createDataKey(provider, {
      			masterKey: masterKey,
      			keyAltNames: [ scheme[attributename] ]
    		});
	}
}

/**
 * getKey: Method that obtains a key whose keyAltName is passed by parameter
 * Return:
 * 	dataKey['_id']: key identifier
 */
async function getKey(keyAltName){
	// query to be launched
	const query = {keyAltNames: keyAltName};
	// result of the query
    const dataKey = await keyColl.findOne(query);
    // the identifier is returned
  	return dataKey['_id']
}

/**
 * findPatient: Method that searches for a person by name
 * Return:
 * 	 obj: person object
 */
async function findPatient(queryEncrypted) {
	try {
		// query to get a person by name 
    		const obj = await collection.findOne({ name: queryEncrypted });
    		// the fields obtained must be decrypted
    		obj.name = await encryption.decrypt(obj.name);
    		obj.age = await encryption.decrypt(obj.age);
    		obj.lat = await encryption.decrypt(obj.lat);
    		obj.lon = await encryption.decrypt(obj.lon);
    		obj.job = await encryption.decrypt(obj.job);
    		obj.salary = await encryption.decrypt(obj.salary);
    		obj.pulse = await encryption.decrypt(obj.pulse);
    		obj.temperature = await encryption.decrypt(obj.temperature);
    		obj.disease = await encryption.decrypt(obj.disease);
 		// the decrypted object is returned
 		return obj
 		
  	} catch (readError) {
    		console.error("readError occurred:", readError);
  	}
}

/**
 * Method that inserts a person in the data base
 */
async function insertPatient(name, age, lat, lon, job, salary, pulse, temperature, disease) {
	try {
		// query to insert a new document in the collection
    		const writeResult = await collection.insertOne({name,age,lat,lon,job,salary,pulse,temperature,disease});
	} catch (writeError) {
    		console.error('writeError occurred:', writeError);
  	}
}

