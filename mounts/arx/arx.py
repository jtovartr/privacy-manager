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

def script(method, attributes, sql_query):
	
	flag_identifying = False #To find out if there is an identifying attribute
	flag_quasiidentifying = False #To find out if there is an quasiidentifying attribute
	flag_insensitive = False #To find out if there is an insensitive attribute
	flag_sensitive = False #To find out if there is an sensitive attribute
	
	count = 0 # Number of attributes 

	# ----------------------------------------------------#
	#		CONNECTION TO THE DATABASE			
	# ----------------------------------------------------#

	mydb = mysql.connector.connect(
	#host="10.152.183.232", #mysql read
	host="mysql-master.default.svc.cluster.local",
	port="3306",
	user="root",
	passwd="",
	database="test"
	)

	# Database query
	df = pd.read_sql(sql_query, mydb)

	# Transformation of the obtained data into Dataset
	dataset = Dataset.from_pandas(df)


	# ----------------------------------------------------#
	#    SEPARATION AND ASSIGNMENT OF ATTRIBUTES BY TYPE	
	# ----------------------------------------------------#

	attributes = json.loads(attributes)
	
	# All the attributes that exist in the attributes variable are processed 
	# in order to identify what types of attributes exist. 
	for key in attributes:
	
		# If the attribute is identiying, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.
		if key == 'identifying':
			flag_identifying = True
			identifying = attributes['identifying'].split(sep=", ")
			for i in identifying:
				dataset.set_attribute_type(AttributeType.IDENTIFYING, i)
				count+=1
				
		# If the attribute is quasiidentifying, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.
		elif key == 'quasiidentifying':
			flag_quasiidentifying = True
			quasiidentifying = attributes['quasiidentifying'].split(sep=", ")
			for i in quasiidentifying:
				dataset.set_attribute_type(AttributeType.QUASIIDENTIFYING, i)
				count+=1
				
		# If the attribute is insensitive, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.		
		elif key == 'insensitive':
			flag_insensitive = True
			insensitive = attributes['insensitive'].split(sep=", ")
			for i in insensitive:		
				dataset.set_attribute_type(AttributeType.INSENSITIVE, i)
				count+=1
				
		# If the attribute is sensitive, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.	
		elif key == 'sensitive':
			flag_sensitive = True
			sensitive = attributes['sensitive'].split(sep=", ")
			for i in sensitive:
				dataset.set_attribute_type(AttributeType.SENSITIVE, i)
				count+=1
		

	# Connection to ARXaaS service
	arxaas = ARXaaS("http://10.152.183.204:8080")

	# We check that the number of attributes passed as parameters is not less than 
	# the number of attributes in the database, as this will throw an error. By default, 
	# if the type of an attribute is not specified it will be QUASIIDENTIFYING, so if there 
	# is no hierarchy created it will generate an error when the dataset is privatized.
	if count != 10:
		return '{ "Error":"The data could not be privatized: You have entered a number of attributes that does not correspond to those in the database."}'
	
	# We check that quasiidentifying attributes exist. If these do not exist, the execution ends.
	if flag_quasiidentifying == False:
		return '{ "Error":"Failed to privatize data: At least one quasi-identifying attribute must be specified."}'


	# ----------------------------------------------------#
	#    CREATION OF HIERARCHIES FOR EACH ATTRIBUTE	
	# ----------------------------------------------------#
	
	# Se van a crear jerarquías para todos los atributos ya que se desconoce que 
	# atributos tendrá el usuario de tipo quasiidentifying. Para ello, se 
	# recorrerá la lista de atributos de dicho tipo y dependiendo de cual sea
	# se creará la jerarquía de un tipo u otro.
	
	# Hierarchies will be created for all attributes because it is not known which 
	# quasiidentifying attributes the user will have. To do this, we will go through 
	# the list of quasiidentifying attributes and depending on which one it is we will 
	# create the hierarchy
	for i in quasiidentifying:
		# --------------------- AGE -------------------------#
		if i == 'edad':
			# Creation of the hierarchy type
			interval_based_edad = IntervalHierarchyBuilder()
			# Interval insertion
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

			# Insertion of new interval level
			interval_based_edad.level(0).add_group(2, "0-10").add_group(2, "10-20").add_group(2, "20-30").add_group(2, "30-40").add_group(2, "40-50").add_group(2, "50-60").add_group(2, "60-70").add_group(2, "70-80").add_group(2, "80-90").add_group(2, "90-100");
	
			# Insertion of new interval level
			interval_based_edad.level(1).add_group(2, "0-20").add_group(2, "20-40").add_group(2, "40-60").add_group(2, "60-80").add_group(2, "80-100");
	
			# Insertion of new interval level
			interval_based_edad.level(2).add_group(2, "0-40").add_group(2, "40-80").add_group(1, ">=80");
	
			# Insertion of new interval level
			interval_based_edad.level(3).add_group(2, "0-80").add_group(1, ">=80");
	
			# Insertion of new interval level
			interval_based_edad.level(4).add_group(1, "0-100");
	
			# The previously created hierarchy is applied to the age values.
			edades = df["edad"].tolist()
			interval_hierarchy_edad = arxaas.hierarchy(interval_based_edad, edades)
			dataset.set_hierarchy("edad", interval_hierarchy_edad)
			
		elif i == 'sueldo':
			# --------------------- SALARY -------------------------#
			
			# Creation of the hierarchy type
			interval_based_sueldo = IntervalHierarchyBuilder()
			
			# Interval insertion
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
	
			# Insertion of new interval level
			interval_based_sueldo.level(0).add_group(2, "[0-10K)").add_group(2, "[10K-20K)").add_group(2, "[20K-30K)").add_group(2, "[30K-40K)").add_group(2, "[40K-50K)").add_group(2, "[50K-60K)").add_group(2, "[60K-70K)").add_group(2, "[70K-80K)").add_group(2, "[80K-90K)").add_group(2, "[90K-100K)");
		
			# Insertion of new interval level
			interval_based_sueldo.level(1).add_group(2, "[0-20K)").add_group(2, "[20K-40K)").add_group(2, "[40K-60K)").add_group(2, "[60-80K)").add_group(2, "[80K-100K)");
	
			# Insertion of new interval level
			interval_based_sueldo.level(2).add_group(2, "[0-40K)").add_group(2, "[40K-80K)").add_group(1, ">=80K");
	
			# Insertion of new interval level
			interval_based_sueldo.level(3).add_group(2, "[0-80K)").add_group(1, ">=80K");
		
			# The previously created hierarchy is applied to the salary values.
			sueldos = df["sueldo"].tolist()
			interval_hierarchy_sueldos = arxaas.hierarchy(interval_based_sueldo, sueldos)
			dataset.set_hierarchy("sueldo", interval_hierarchy_sueldos)

		elif i == 'lat':
			# --------------------- LAT -------------------------#
			
			# Creation of the hierarchy type
			redaction_builder_lat = RedactionHierarchyBuilder()
			
			# The previously created hierarchy is applied to the latitude values.
			lats = df["lat"].tolist()
			redaction_hierarchy_lat = arxaas.hierarchy(redaction_builder_lat, lats) 
			dataset.set_hierarchy("lat", redaction_hierarchy_lat)

		elif i=='lon':
			# --------------------- LONG -------------------------#	
			
			# Creation of the hierarchy type
			redaction_builder_lon = RedactionHierarchyBuilder()
			
			# The previously created hierarchy is applied to the longitude values.
			longs = df["lon"].tolist()
			redaction_hierarchy_lon = arxaas.hierarchy(redaction_builder_lon, longs) 
			dataset.set_hierarchy("lon", redaction_hierarchy_lon)
			
		elif i=='temperatura':
			# ------------------ TEMPERATURE -----------------------#	
			# Creation of the hierarchy type
			interval_based_temperatura = IntervalHierarchyBuilder()
			
			# Interval insertion
			interval_based_temperatura.add_interval(0.0,5.0, "0-5 ºC")
			interval_based_temperatura.add_interval(5.0,10.0, "5-10 ºC")
			interval_based_temperatura.add_interval(10.0,15.0, "10-15 ºC")
			interval_based_temperatura.add_interval(15.0,20.0, "15-20 ºC")
			interval_based_temperatura.add_interval(20.0,25.0, "20-25 ºC")
			interval_based_temperatura.add_interval(25.0,30.0, "25-30 ºC")
			interval_based_temperatura.add_interval(30.0,35.0, "30-35 ºC")
			interval_based_temperatura.add_interval(35.0,40.0, "35-40 ºC")
			interval_based_temperatura.add_interval(40.0,45.0, "40-45 ºC")
			interval_based_temperatura.add_interval(45.0,50.0, "45-50 ºC")

			# Insertion of new interval level
			interval_based_temperatura.level(0).add_group(2, "0-10 ºC").add_group(2, "10-20 ºC").add_group(2, "20-30 ºC").add_group(2, "30-40 ºC").add_group(2, "40-50 ºC");
	
			# Insertion of new interval level
			interval_based_temperatura.level(1).add_group(2, "0-20 ºC").add_group(2, "20-40 ºC").add_group(1, ">=40 ºC");
	
			# Insertion of new interval level
			interval_based_temperatura.level(2).add_group(2, "0-40 ºC").add_group(1, ">=40 ºC");
	
			# The previously created hierarchy is applied to the temperature values.
			temperaturas = df["temperatura"].tolist()
			interval_hierarchy_temperatura = arxaas.hierarchy(interval_based_temperatura, temperaturas)
			dataset.set_hierarchy("temperatura", interval_hierarchy_temperatura)
		
		elif i=='pulso':
			# --------------------- PULSE --------------------------#
			
			# Creation of the hierarchy type
			interval_based_pulso = IntervalHierarchyBuilder()
			
			# Interval insertion
			interval_based_pulso.add_interval(0,5, "0-5 bpm")
			interval_based_pulso.add_interval(5,10, "5-10 bpm")
			interval_based_pulso.add_interval(10,15, "10-15 bpm")
			interval_based_pulso.add_interval(15,20, "15-20 bpm")
			interval_based_pulso.add_interval(20,25, "20-25 bpm")
			interval_based_pulso.add_interval(25,30, "25-30 bpm")
			interval_based_pulso.add_interval(30,35, "30-35 bpm")
			interval_based_pulso.add_interval(35,40, "35-40 bpm")
			interval_based_pulso.add_interval(40,45, "40-45 bpm")
			interval_based_pulso.add_interval(45,50, "45-50 bpm")
			interval_based_pulso.add_interval(50,55, "50-55 bpm")
			interval_based_pulso.add_interval(55,60, "55-60 bpm")
			interval_based_pulso.add_interval(60,65, "60-65 bpm")
			interval_based_pulso.add_interval(65,70, "65-70 bpm")
			interval_based_pulso.add_interval(70,75, "70-75 bpm")
			interval_based_pulso.add_interval(75,80, "75-80 bpm")
			interval_based_pulso.add_interval(80,85, "80-85 bpm")
			interval_based_pulso.add_interval(85,90, "85-90 bpm")
			interval_based_pulso.add_interval(90,95, "90-95 bpm")
			interval_based_pulso.add_interval(95,100, "95-100 bpm")
			interval_based_pulso.add_interval(100,250, ">= 100 bpm")

			# Insertion of new interval level
			interval_based_pulso.level(0).add_group(2, "0-10 bpm").add_group(2, "10-20 bpm").add_group(2, "20-30 bpm").add_group(2, "30-40 bpm").add_group(2, "40-50 bpm").add_group(2, "50-60 bpm").add_group(2, "60-70 bpm").add_group(2, "70-80 bpm").add_group(2, "80-90 bpm").add_group(2, "90-100 bpm").add_group(1, ">=100 bpm");
	
			# Insertion of new interval level
			interval_based_pulso.level(1).add_group(2, "0-20 bpm").add_group(2, "20-40 bpm").add_group(2, "40-60 bpm").add_group(2, "60-80 bpm").add_group(2, "80-100 bpm").add_group(1, ">=100 bpm");
	
			# Insertion of new interval level
			interval_based_pulso.level(2).add_group(2, "0-40 bpm").add_group(2, "40-80 bpm").add_group(1, "80-100 bpm").add_group(1, ">=100 bpm");
	
			# Insertion of new interval level
			interval_based_pulso.level(3).add_group(2, "0-80 bpm").add_group(2, ">=80 bpm");
	
			# The previously created hierarchy is applied to the pulse values.
			pulsos = df["pulso"].tolist()
			interval_hierarchy_pulso = arxaas.hierarchy(interval_based_pulso, pulsos)
			dataset.set_hierarchy("pulso", interval_hierarchy_pulso)
			
		"""
		elif i=='enfermedad':
			# ------------------- ENFERMEDAD -----------------------#
			
			enfermedades = df["enfermedad"].tolist()
			
	
			num_sano = 0
			num_enfermo = 0
			
			for i in enfermedades:
				if i=='Sano':
					num_sano+=1
				else:
					num_enfermo+=1
								
			
			for i in enfermedades:
    				if i=='Sano':
        				enfermedades.remove('Sano')
        				enfermedades.append('Sano')
					
			order_based = OrderHierarchyBuilder()
			order_based.level(0).add_group(num_enfermo, "Si").add_group(num_sano, "No")

			order_hierarchy = arxaas.hierarchy(order_based, enfermedades)
			dataset.set_hierarchy("enfermedad", order_hierarchy)
		"""
			
		#elif i=='profesion':
			# -------------------- PROFESION -----------------------#	
			
			
			
		#elif i=='id':
			# ----------------------- ID ---------------------------#
			
			
		#elif i=='nombre':
			# --------------------- NOMBRE -------------------------#	
		

	# ----------------------------------------------------#
	#    	CHOICE OF PRIVATIZATION METHOD		
	# ----------------------------------------------------#
	
	# When using KAnonimity, check that there are no sensitive attributes.
	if method == "KAnonimity":
		if flag_sensitive == True:
			return '{ "Error":"It has not been possible to privatize the data: KAnonimity method does not support sensitive attributes."}'
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[KAnonymity(attributes['level'])])	
	
	# Check for sensitive attributes when using LDiversity
	elif method == "LDiversity":
		if flag_sensitive == False:
			return '{ "Error":"It has not been possible to privatize the data: LDiversity method needs a sensitive attribute."}'
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[LDiversityDistinct(int(attributes['level']), attributes['sensitive'])])
	
	# When using TCloseness, it must be checked that there are sensitive attributes
	elif method == "TCloseness":
		if flag_sensitive == False:
			return '{ "Error":"It has not been possible to privatize the data: TCloseness method needs a sensitive attribute."}'
		else:
			anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[TClosenessEqualDistance(float(attributes['level']), attributes['sensitive'])])
	
	# Transformation of the privatization result to Dataframe
	df = anon_result.dataset.to_dataframe()

	# Dataframe to JSON transformation
	out = df.to_json(orient='index')
	
	return out



# -- API REST --

class General(Resource):
	def get(self):
	
		# The value of the privatization method is obtained
		method = request.args.get('method')
		# The values of the attribute types are obtained
		attributes = request.args.get('attributes[]')
		sql_query = request.args.get('sql')
		
		# Both "method" and "attributes[]" are checked to see if they have value
		if not method:
			return "Privatization method not specified"
		elif not attributes:
			return "The type of the attributes have not been specified."
		elif not sql_query:
			return "The query to be performed has not been specified"
		else:
			jsonstring = script(method, attributes, sql_query)
			return json.loads(jsonstring)



# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
	app.run(host='0.0.0.0',port='8083')
