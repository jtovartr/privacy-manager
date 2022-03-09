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

def script(method):
	#Nos conectamos a la base de datos
	#Este no tendría por que conectarse al master porque solo lee datos
	mydb = mysql.connector.connect(
	host="10.152.183.232", #mysql read
	#host="mysql-master.default.svc.cluster.local",
	port="3306",
	user="root",
	passwd="",
	database="test"
	)

	#Intentamos recoger los datos de mysql en vez del csv
	#df = pd.read_csv("./data/k-anonymity/my-adult.all.txt", sep=", ", header=None, names=names, index_col=False, engine='python');
	df = pd.read_sql("select * from personas", mydb)

	dataset = Dataset.from_pandas(df)

	dataset.set_attribute_type(AttributeType.IDENTIFYING, 'nombre')
	dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, 'edad')
	dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, 'sueldo')
	dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, 'lat')
	dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, 'lon')
	
	if method == "KAnonimity":
		dataset.set_attribute_type(AttributeType.INSENSITIVE, 'enfermedad')
	else:
		dataset.set_attribute_type(AttributeType.SENSITIVE, 'enfermedad')
		
	dataset.set_attribute_type(AttributeType.INSENSITIVE, 'profesion')
	dataset.set_attribute_type(AttributeType.INSENSITIVE, 'pulso')
	dataset.set_attribute_type(AttributeType.INSENSITIVE, 'temperatura')
	dataset.set_attribute_type(AttributeType.INSENSITIVE, 'id')

	arxaas = ARXaaS("http://10.152.183.204:8080") # connecting to online service

	interval_based = IntervalHierarchyBuilder()
	interval_based.add_interval(0,18, "niño")
	interval_based.add_interval(18,30, "joven")
	interval_based.add_interval(30,60, "adulto")
	interval_based.add_interval(60,120, "viejo")

	edades = df["edad"].tolist()
	interval_based.level(0)\
		.add_group(2, "joven")\
		.add_group(2, "adulto");

	interval_hierarchy = arxaas.hierarchy(interval_based, edades)
	
	interval_based2 = IntervalHierarchyBuilder()
	interval_based2.add_interval(0,10000, "[0-10K)")
	interval_based2.add_interval(10000,20000, "[10K-20K)")
	interval_based2.add_interval(20000,30000, "[20K-30K)")
	interval_based2.add_interval(30000,40000, "[30K-40K)")
	interval_based2.add_interval(40000,50000, "[40K-50K)")
	interval_based2.add_interval(50000,60000, "[50K-60K)")
	interval_based2.add_interval(60000,70000, "[60K-70K)")
	interval_based2.add_interval(70000,80000, "[70K-80K)")
	interval_based2.add_interval(80000,90000, "[80K-90K)")
	interval_based2.add_interval(90000,100000, "[90K-100K)")
	
	sueldos = df["sueldo"].tolist()
	interval_based2.level(0)\
		.add_group(2, "[0-20K)")\
		.add_group(2, "[20K-40K)")\
		.add_group(2, "[40K-60K)")\
		.add_group(2, "[60K-80K)")\
		.add_group(2, "[80K-100K)");
	
		
	interval_based2.level(1)\
		.add_group(2, "[0-40K)")\
		.add_group(2, "[40K-80K)")\
		.add_group(1, ">=80K");
	
	interval_based2.level(2)\
		.add_group(2, "[0-80K)")\
		.add_group(1, ">=80K");
		
	interval_hierarchy2 = arxaas.hierarchy(interval_based2, sueldos)

	redaction_builder = RedactionHierarchyBuilder() # Create builder
	lats = df["lat"].tolist()
	redaction_hierarchy = arxaas.hierarchy(redaction_builder, lats) # pass builder and column to arxaas

	longs = df["lon"].tolist()
	redaction_hierarchy2 = arxaas.hierarchy(redaction_builder, longs) # pass builder and column to arxaas

	dataset.set_hierarchy("sueldo", interval_hierarchy2)
	dataset.set_hierarchy("edad", interval_hierarchy)
	dataset.set_hierarchy("lat", redaction_hierarchy)
	dataset.set_hierarchy("lon", redaction_hierarchy2)
	
	if method == "KAnonimity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[KAnonymity(2)])
	elif method == "LDiversity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[LDiversityDistinct(2, "enfermedad")])
	elif method == "TCloseness":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[TClosenessEqualDistance(0.000005, "enfermedad")])
	
	df = anon_result.dataset.to_dataframe()

	out = df.to_json(orient='index')
	
	return out





# -- API REST --

class General(Resource):
	def get(self):
		method = request.args.get('method')
		jsonstring = script(method)
		return json.loads(jsonstring)



# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	app.run(host='0.0.0.0',port='8083')
