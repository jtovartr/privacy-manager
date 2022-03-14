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
	interval_based.add_interval(0,5, "0-5")
	interval_based.add_interval(5,10, "5-10")
	interval_based.add_interval(10,15, "10-15")
	interval_based.add_interval(15,20, "15-20")
	interval_based.add_interval(20,25, "20-25")
	interval_based.add_interval(25,30, "25-30")
	interval_based.add_interval(30,35, "30-35")
	interval_based.add_interval(35,40, "35-40")
	interval_based.add_interval(40,45, "40-45")
	interval_based.add_interval(45,50, "45-50")
	interval_based.add_interval(50,55, "50-55")
	interval_based.add_interval(55,60, "55-60")
	interval_based.add_interval(60,65, "60-65")
	interval_based.add_interval(65,70, "65-70")
	interval_based.add_interval(70,75, "70-75")
	interval_based.add_interval(75,80, "75-80")
	interval_based.add_interval(80,85, "80-85")
	interval_based.add_interval(85,90, "85-90")
	interval_based.add_interval(90,95, "90-95")
	interval_based.add_interval(95,100, "95-100")

	interval_based.level(0).add_group(2, "0-10").add_group(2, "10-20").add_group(2, "20-30").add_group(2, "30-40").add_group(2, "40-50").add_group(2, "50-60").add_group(2, "60-70").add_group(2, "adulto").add_group(2, "70-80").add_group(2, "80-90").add_group(2, "90-100");
	
	interval_based.level(1).add_group(2, "0-20").add_group(2, "20-40").add_group(2, "40-60").add_group(2, "60-80").add_group(2, "80-100");
	
	interval_based.level(2).add_group(2, "0-40").add_group(2, "40-80").add_group(1, ">=80");
	
	interval_based.level(3).add_group(2, "0-80").add_group(1, ">=80");
	
	interval_based.level(4).add_group(1, "0-100");
	
	edades = df["edad"].tolist()
	interval_hierarchy = arxaas.hierarchy(interval_based, edades)
	
	interval_based2 = IntervalHierarchyBuilder()
	interval_based2.add_interval(0,5000, "0-5K")
	interval_based2.add_interval(5000,10000, "[5K-10K)")
	interval_based2.add_interval(10000,15000, "[10K-15K)")
	interval_based2.add_interval(15000,20000, "[15K-20K)")
	interval_based2.add_interval(20000,25000, "[20K-25K)")
	interval_based2.add_interval(25000,30000, "[25K-30K)")
	interval_based2.add_interval(30000,35000, "[30K-35K)")
	interval_based2.add_interval(35000,40000, "[35K-40K)")
	interval_based2.add_interval(40000,45000, "[40K-45K)")
	interval_based2.add_interval(45000,50000, "[45K-50K)")
	interval_based2.add_interval(50000,55000, "[50K-55K)")
	interval_based2.add_interval(55000,60000, "[55K-60K)")
	interval_based2.add_interval(60000,65000, "[60K-65K)")
	interval_based2.add_interval(65000,70000, "[65K-70K)")
	interval_based2.add_interval(70000,75000, "[70K-75K)")
	interval_based2.add_interval(75000,80000, "[75K-80K)")
	interval_based2.add_interval(80000,85000, "[80K-85K)")
	interval_based2.add_interval(85000,90000, "[85K-90K)")
	interval_based2.add_interval(90000,95000, "[90K-95K)")
	interval_based2.add_interval(95000,100000, "[95K-100K)")
	
	interval_based2.level(0).add_group(2, "[0-10K)").add_group(2, "[10K-20K)").add_group(2, "[20K-30K)").add_group(2, "[30K-40K)").add_group(2, "[40K-50K)").add_group(2, "[50K-60K)").add_group(2, "[60K-70K)").add_group(2, "[70K-80K)").add_group(2, "[80K-90K)").add_group(2, "[90K-100K)");
		
	interval_based2.level(1).add_group(2, "[0-20K)").add_group(2, "[20K-40K)").add_group(2, "[40K-60K)").add_group(2, "[60-80K)").add_group(2, "[80K-100K)");
	
	interval_based2.level(2).add_group(2, "[0-40K)").add_group(2, "[40K-80K)").add_group(1, ">=80K");
	
	interval_based2.level(3).add_group(2, "[0-80K)").add_group(1, ">=80K");
	
	interval_based2.level(4).add_group(1, "[0-100K)");
		
	sueldos = df["sueldo"].tolist()
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
		attributes = request.args.get('attributes').split(sep=', ')
		
		#for i in attributes:
		#	dataset.set_attribute_type(AttributeType.SENSITIVE, i)
			
		
		if not method:
			return "No has especificado método de privatización"
		else:
			jsonstring = script(method)
			return json.loads(jsonstring)


# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
	app.run(host='0.0.0.0',port='8083')
