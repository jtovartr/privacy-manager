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

	df = pd.read_sql("select * from personas", mydb)

	dataset = Dataset.from_pandas(df)


	# ----------------------------------------------------#
	#    SEPARACIÓN Y ASIGNACIÓN DE ATRIBUTOS POR TIPO	#
	# ----------------------------------------------------#

	attributes = json.loads(attributes)
	for key in attributes:
		if key == 'identifying':
			identifying = attributes['identifying'].split(sep=", ")
			for i in identifying:
				dataset.set_attribute_type(AttributeType.IDENTIFYING, i)
		elif key == 'quasiidentifying':
			quasiidentifying = attributes['quasiidentifying'].split(sep=", ")
			for i in quasiidentifying:
				dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, i)
		elif key == 'insensitive':
			insensitive = attributes['insensitive'].split(sep=", ")
			for i in insensitive:
				dataset.set_attribute_type(AttributeType.INSENSITIVE, i)
		elif key == 'sensitive':
			sensitive = attributes['sensitive'].split(sep=", ")
			for i in sensitive:
				dataset.set_attribute_type(AttributeType.SENSITIVE, i)
		


	arxaas = ARXaaS("http://10.152.183.204:8080") # connecting to online service


	# ----------------------------------------------------#
	#    CREACIÓN DE JERARQUÍAS PARA CADA ATRIBUTO	#
	# ----------------------------------------------------#
	
	
	# --------------------- EDAD -------------------------#

	interval_based_edad = IntervalHierarchyBuilder()
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

	interval_based_edad.level(0).add_group(2, "0-10").add_group(2, "10-20").add_group(2, "20-30").add_group(2, "30-40").add_group(2, "40-50").add_group(2, "50-60").add_group(2, "60-70").add_group(2, "adulto").add_group(2, "70-80").add_group(2, "80-90").add_group(2, "90-100");
	
	interval_based_edad.level(1).add_group(2, "0-20").add_group(2, "20-40").add_group(2, "40-60").add_group(2, "60-80").add_group(2, "80-100");
	
	interval_based_edad.level(2).add_group(2, "0-40").add_group(2, "40-80").add_group(1, ">=80");
	
	interval_based_edad.level(3).add_group(2, "0-80").add_group(1, ">=80");
	
	interval_based_edad.level(4).add_group(1, "0-100");
	
	edades = df["edad"].tolist()
	interval_hierarchy_edad = arxaas.hierarchy(interval_based_edad, edades)
	
	
	# --------------------- SUELDO -------------------------#
	
	interval_based_sueldo = IntervalHierarchyBuilder()
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
	
	interval_based_sueldo.level(0).add_group(2, "[0-10K)").add_group(2, "[10K-20K)").add_group(2, "[20K-30K)").add_group(2, "[30K-40K)").add_group(2, "[40K-50K)").add_group(2, "[50K-60K)").add_group(2, "[60K-70K)").add_group(2, "[70K-80K)").add_group(2, "[80K-90K)").add_group(2, "[90K-100K)");
		
	interval_based_sueldo.level(1).add_group(2, "[0-20K)").add_group(2, "[20K-40K)").add_group(2, "[40K-60K)").add_group(2, "[60-80K)").add_group(2, "[80K-100K)");
	
	interval_based_sueldo.level(2).add_group(2, "[0-40K)").add_group(2, "[40K-80K)").add_group(1, ">=80K");
	
	interval_based_sueldo.level(3).add_group(2, "[0-80K)").add_group(1, ">=80K");
	
	interval_based_sueldo.level(4).add_group(1, "[0-100K)");
		
	sueldos = df["sueldo"].tolist()
	interval_hierarchy_sueldos = arxaas.hierarchy(interval_based_sueldo, sueldos)


	# --------------------- LATITUD -------------------------#	
	
	redaction_builder_lat = RedactionHierarchyBuilder() # Create builder
	lats = df["lat"].tolist()
	redaction_hierarchy_lat = arxaas.hierarchy(redaction_builder_lat, lats) # pass builder and column to arxaas


	# --------------------- LONGITUD -------------------------#	
		
	redaction_builder_lon = RedactionHierarchyBuilder() # Create builder
	longs = df["lon"].tolist()
	redaction_hierarchy_lon = arxaas.hierarchy(redaction_builder_lon, longs) # pass builder and column to arxaas
	
	
	
	# ----------------------------------------------------#
	#    		ASIGNACIÓN DE JERARQUIAS		#
	# ----------------------------------------------------#

	dataset.set_hierarchy("sueldo", interval_hierarchy_sueldos)
	dataset.set_hierarchy("edad", interval_hierarchy_edad)
	dataset.set_hierarchy("lat", redaction_hierarchy_lat)
	dataset.set_hierarchy("lon", redaction_hierarchy_lon)
	
	# ----------------------------------------------------#
	#    	ELECCIÓN DE MÉTODO DE PRIVATIZACIÓN		#
	# ----------------------------------------------------#
	
	if method == "KAnonimity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[KAnonymity(attributes['level'])])
	elif method == "LDiversity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[LDiversityDistinct(int(attributes['level']), attributes['sensitive'])])
	elif method == "TCloseness":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[TClosenessEqualDistance(float(attributes['level']), attributes['sensitive'])])
	
	df = anon_result.dataset.to_dataframe()

	out = df.to_json(orient='index')
	
	return out



# -- API REST --

class General(Resource):
	def get(self):
		method = request.args.get('method')
		attributes = request.args.get('attributes[]')
		
		"""
		attributes = json.loads(attributes)
		sensitive = attributes['sensitive']
			
			
		return sensitive
		
		"""
		if not method:
			return "No has especificado método de privatización"
		else:
			jsonstring = script(method, attributes)
			return json.loads(jsonstring)


# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
	app.run(host='0.0.0.0',port='8083')
