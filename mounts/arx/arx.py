import mysql.connector
import pandas as pd
import matplotlib.pylab as pl
import matplotlib.patches as patches

from pyarxaas import ARXaaS, Dataset, AttributeType
from pyarxaas.privacy_models import KAnonymity, LDiversityDistinct, TClosenessEqualDistance
from pyarxaas.hierarchy import RedactionHierarchyBuilder, OrderHierarchyBuilder, IntervalHierarchyBuilder

from flask import Flask, request
from flask_restful import Resource, Api
from json import dumps
from flask import jsonify

import json

#Flask
app = Flask(__name__)
api = Api(app)

def script(method, attributes):
	
	flag_identifying = False
	flag_quasiidentifying = False
	flag_insensitive = False
	flag_sensitive = False
	
	count = 0 # Numero de atributos 

	# ----------------------------------------------------#
	#		CONEXIÓN CON LA BASE DE DATOS		#
	# ----------------------------------------------------#

	mydb = mysql.connector.connect(
	host="10.152.183.232", #mysql read
	#host="mysql-master.default.svc.cluster.local",
	port="3306",
	user="root",
	passwd="",
	database="test"
	)

	# Consulta a la base de datos
	df = pd.read_sql("select * from personas", mydb)

	# Transformación de los datos obtenidos a Dataset
	dataset = Dataset.from_pandas(df)


	# ----------------------------------------------------#
	#    SEPARACIÓN Y ASIGNACIÓN DE ATRIBUTOS POR TIPO	#
	# ----------------------------------------------------#

	attributes = json.loads(attributes)
	
	# Se recorren todos los atributos que existen en la estructura attributes 
	# para poder identificar que tipos existen
	for key in attributes:
	
		# Si el atributo es identiying, se separan todos estos en una nueva 
		# estructura que se recorre para asignarle dicho tipo dentro del Dataset
		if key == 'identifying':
			flag_identifying = True
			identifying = attributes['identifying'].split(sep=", ")
			for i in identifying:
				dataset.set_attribute_type(AttributeType.IDENTIFYING, i)
				count+=1
				
		# Si el atributo es quasiidentifying, se separan todos estos en una nueva 
		# estructura que se recorre para asignarle dicho tipo dentro del Dataset
		elif key == 'quasiidentifying':
			flag_quasiidentifying = True
			quasiidentifying = attributes['quasiidentifying'].split(sep=", ")
			for i in quasiidentifying:
				dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, i)
				count+=1
				
		# Si el atributo es insensitive, se separan todos estos en una nueva 
		# estructura que se recorre para asignarle dicho tipo dentro del Dataset		
		elif key == 'insensitive':
			flag_insensitive = True
			insensitive = attributes['insensitive'].split(sep=", ")
			for i in insensitive:
				dataset.set_attribute_type(AttributeType.INSENSITIVE, i)
				count+=1
				
		# Si el atributo es sensitive, se separan todos estos en una nueva 
		# estructura que se recorre para asignarle dicho tipo dentro del Dataset	
		elif key == 'sensitive':
			flag_sensitive = True
			sensitive = attributes['sensitive'].split(sep=", ")
			for i in sensitive:
				dataset.set_attribute_type(AttributeType.SENSITIVE, i)
				count+=1
		

	# Conexión con el servicio de ARXaaS
	arxaas = ARXaaS("http://10.152.183.204:8080")

	# Comprobamos que el número de atributos pasado como parámetros no sea menor al número de atributos
	# de la base de datos, ya que esto lanzará un error. Por defecto, si no se especifica el tipo de 
	# un atributo este será QUASIIDENTIFYING, por lo que al no tener jerarquía creada generará un error
	# a la hora de privatizar el dataset
	if count != 10:
		return '{ "Error":"No se ha podido privatizar los datos: Has introducido un número de atributos que no se corresponde con los de la base de datos"}'
	
	# Comprobamos que existen atributos quasiidentifying. Si estos no existen acaba la ejecucion
	if flag_quasiidentifying == False:
		return '{ "Error":"No se ha podido privatizar los datos: Se necesita especificar al menos un atributo quasiidentificativo"}'


	# ----------------------------------------------------#
	#    CREACIÓN DE JERARQUÍAS PARA CADA ATRIBUTO	#
	# ----------------------------------------------------#
	
	# Se van a crear jerarquías para todos los atributos ya que se desconoce que 
	# atributos tendrá el usuario de tipo quasiidentifying. Para ello, se 
	# recorrerá la lista de atributos de dicho tipo y dependiendo de cual sea
	# se creará la jerarquía de un tipo u otro.
	for i in quasiidentifying:
		# --------------------- EDAD -------------------------#
		if i == 'edad':
			# Creación del tipo de jerarquia
			interval_based_edad = IntervalHierarchyBuilder()
			# Insercción de intervalos
			interval_based_edad.add_interval(0,5, "0-5")
			interval_based_edad.add_interval(5,10, "5-10")
			interval_based_edad.add_interval(10,15, "10-15")
			interval_based_edad.add_interval(15,20, "15-20")
			interval_based_edad.add_interval(20,25, "20-25")
			interval_based_edad.add_interval(25,30, "25-30")
			interval_based_edad.add_interval(30,35, "30-35")
			interval_based_edad.add_interval(35,40, "35-40")
			interval_based_edad.add_interval(40,45, "40-45")
			interval_based_edad.add_interval(45,50, "45-50")
			interval_based_edad.add_interval(50,55, "50-55")
			interval_based_edad.add_interval(55,60, "55-60")
			interval_based_edad.add_interval(60,65, "60-65")
			interval_based_edad.add_interval(65,70, "65-70")
			interval_based_edad.add_interval(70,75, "70-75")
			interval_based_edad.add_interval(75,80, "75-80")
			interval_based_edad.add_interval(80,85, "80-85")
			interval_based_edad.add_interval(85,90, "85-90")
			interval_based_edad.add_interval(90,95, "90-95")
			interval_based_edad.add_interval(95,100, "95-100")

			# Inserción de nuevo nivel de intervalos
			interval_based_edad.level(0).add_group(2, "0-10").add_group(2, "10-20").add_group(2, "20-30").add_group(2, "30-40").add_group(2, "40-50").add_group(2, "50-60").add_group(2, "60-70").add_group(2, "adulto").add_group(2, "70-80").add_group(2, "80-90").add_group(2, "90-100");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_edad.level(1).add_group(2, "0-20").add_group(2, "20-40").add_group(2, "40-60").add_group(2, "60-80").add_group(2, "80-100");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_edad.level(2).add_group(2, "0-40").add_group(2, "40-80").add_group(1, ">=80");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_edad.level(3).add_group(2, "0-80").add_group(1, ">=80");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_edad.level(4).add_group(1, "0-100");
	
			# Se aplica a los valores de la edad la jerarquia anteriormente creada
			edades = df["edad"].tolist()
			interval_hierarchy_edad = arxaas.hierarchy(interval_based_edad, edades)
			dataset.set_hierarchy("edad", interval_hierarchy_edad)
			
		elif i == 'sueldo':
			# --------------------- SUELDO -------------------------#
			
			# Creación del tipo de jerarquia
			interval_based_sueldo = IntervalHierarchyBuilder()
			
			# Insercción de intervalos
			interval_based_sueldo.add_interval(0,5000, "0-5K")
			interval_based_sueldo.add_interval(5000,10000, "[5K-10K)")
			interval_based_sueldo.add_interval(10000,15000, "[10K-15K)")
			interval_based_sueldo.add_interval(15000,20000, "[15K-20K)")
			interval_based_sueldo.add_interval(20000,25000, "[20K-25K)")
			interval_based_sueldo.add_interval(25000,30000, "[25K-30K)")
			interval_based_sueldo.add_interval(30000,35000, "[30K-35K)")
			interval_based_sueldo.add_interval(35000,40000, "[35K-40K)")
			interval_based_sueldo.add_interval(40000,45000, "[40K-45K)")
			interval_based_sueldo.add_interval(45000,50000, "[45K-50K)")
			interval_based_sueldo.add_interval(50000,55000, "[50K-55K)")
			interval_based_sueldo.add_interval(55000,60000, "[55K-60K)")
			interval_based_sueldo.add_interval(60000,65000, "[60K-65K)")
			interval_based_sueldo.add_interval(65000,70000, "[65K-70K)")
			interval_based_sueldo.add_interval(70000,75000, "[70K-75K)")
			interval_based_sueldo.add_interval(75000,80000, "[75K-80K)")
			interval_based_sueldo.add_interval(80000,85000, "[80K-85K)")
			interval_based_sueldo.add_interval(85000,90000, "[85K-90K)")
			interval_based_sueldo.add_interval(90000,95000, "[90K-95K)")
			interval_based_sueldo.add_interval(95000,100000, "[95K-100K)")
	
			# Inserción de nuevo nivel de intervalos
			interval_based_sueldo.level(0).add_group(2, "[0-10K)").add_group(2, "[10K-20K)").add_group(2, "[20K-30K)").add_group(2, "[30K-40K)").add_group(2, "[40K-50K)").add_group(2, "[50K-60K)").add_group(2, "[60K-70K)").add_group(2, "[70K-80K)").add_group(2, "[80K-90K)").add_group(2, "[90K-100K)");
		
			# Inserción de nuevo nivel de intervalos
			interval_based_sueldo.level(1).add_group(2, "[0-20K)").add_group(2, "[20K-40K)").add_group(2, "[40K-60K)").add_group(2, "[60-80K)").add_group(2, "[80K-100K)");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_sueldo.level(2).add_group(2, "[0-40K)").add_group(2, "[40K-80K)").add_group(1, ">=80K");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_sueldo.level(3).add_group(2, "[0-80K)").add_group(1, ">=80K");
	
			# Inserción de nuevo nivel de intervalos
			interval_based_sueldo.level(4).add_group(1, "[0-100K)");
		
			# Se aplica a los valores de sueldo la jerarquia anteriormente creada
			sueldos = df["sueldo"].tolist()
			interval_hierarchy_sueldos = arxaas.hierarchy(interval_based_sueldo, sueldos)
			dataset.set_hierarchy("sueldo", interval_hierarchy_sueldos)

		elif i == 'lat':
			# --------------------- LATITUD -------------------------#
			
			# Creación del tipo de jerarquia
			redaction_builder_lat = RedactionHierarchyBuilder()
			
			# Se aplica a los valores de latitud la jerarquia anteriormente creada
			lats = df["lat"].tolist()
			redaction_hierarchy_lat = arxaas.hierarchy(redaction_builder_lat, lats) 
			dataset.set_hierarchy("lat", redaction_hierarchy_lat)

		elif i=='lon':
			# --------------------- LONGITUD -------------------------#	
			
			# Creación del tipo de jerarquia
			redaction_builder_lon = RedactionHierarchyBuilder()
			
			# Se aplica a los valores de longitud la jerarquia anteriormente creada
			longs = df["lon"].tolist()
			redaction_hierarchy_lon = arxaas.hierarchy(redaction_builder_lon, longs) 
			dataset.set_hierarchy("lon", redaction_hierarchy_lon)
	
		elif i=='nombre':
			# --------------------- NOMBRE -------------------------#	
		
		elif i=='profesion':
			# -------------------- PROFESION -----------------------#	
		
		elif i=='pulso':
			# --------------------- PULSO --------------------------#
		
		elif i=='id':
			# ----------------------- ID ---------------------------#
		
		elif i=='enfermedad':
			# ------------------- ENFERMEDAD -----------------------#
			
		elif i=='temperatura':
			# ------------------- TEMPERATURA ----------------------#
	

	# ----------------------------------------------------#
	#    	ELECCIÓN DE MÉTODO DE PRIVATIZACIÓN		#
	# ----------------------------------------------------#
	
	# Se debe comprobar que al usar KAnonimity no existan atributos sensibles
	if method == "KAnonimity":
		if flag_sensitive == True:
			return '{ "Error":"No se ha podido privatizar los datos: El método KAnonimity no soporta atributos sensibles"}'
			#return "No se ha podido privatizar los datos: El método KAnonimity no soporta atributos sensibles"
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[KAnonymity(attributes['level'])])	
	
	# Se debe comprobar que al usar LDiversity existan atributos sensibles
	elif method == "LDiversity":
		if flag_sensitive == False:
			#return "No se ha podido privatizar los datos: El método LDiversity necesita un atributo sensible"
			return '{ "Error":"No se ha podido privatizar los datos: El método LDiversity necesita un atributo sensible"}'
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[LDiversityDistinct(int(attributes['level']), attributes['sensitive'])])
	
	# Se debe comprobar que al usar TCloseness existan atributos sensibles
	elif method == "TCloseness":
		if flag_sensitive == False:
			#return "No se ha podido privatizar los datos: El método TCloseness necesita un atributo sensible"
			return '{ "Error":"No se ha podido privatizar los datos: El método TCloseness necesita un atributo sensible"}'
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[TClosenessEqualDistance(float(attributes['level']), attributes['sensitive'])])
	
	# Transformación del resultado de la privatización a Dataframe
	df = anon_result.dataset.to_dataframe()

	# Transformación del Dataframe a JSON
	out = df.to_json(orient='index')
	
	return out



# -- API REST --

class General(Resource):
	def get(self):
	
		# Se obtiene el valor del método de privatización
		method = request.args.get('method')
		# Se obtienen los valores de los tipos de atributos
		attributes = request.args.get('attributes[]')
		
		# Se comprueba si tanto "method" como "attributes[]" tienen valor
		if not method:
			return "No se ha especificado método de privatización"
		elif not attributes:
			return "No se han especificado el tipo de los atributos"
		else:
			# Si la llamada devuelve un string quiere decir que algo ha fallado y se devuelve el string
			# Si todo ha ido bien, se debe realizar la función json.loads para devolver los datos
			jsonstring = script(method, attributes)
			return json.loads(jsonstring)
			"""
			if type(jsonstring)==str:
				return jsonstring
			else:
				return json.loads(jsonstring)
			"""

# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
	app.run(host='0.0.0.0',port='8083')
