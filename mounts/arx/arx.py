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

# method that calculates the depth of the ontology
def depth(d):
    if isinstance(d, dict):
        return 1 + (max(map(depth, d.values())) if d else 0)
    return 0


def procedure_json(data):
    ret = {}

    def process(x, key=""):

        if type(x) is dict:
            for current_key in x:
                if type(x[current_key]) is list:
                    long = len(x[current_key])
                else:
                    key_x = x[next(iter(x))].keys()
                    long = len(key_x)

                process(x[current_key], key + current_key + str(long) + '_')

        elif type(x) is list:
            i = 0
            for elem in x:
                process(elem, key + str(i) + '_')
                i += 1
        else:
            ret[key[:-1]] = x

    process(data)
    return ret


def process_list(data, variable_depth, all_the_lists):
    variable_depth_aux = variable_depth
    for value in data.values():
        all_the_lists[variable_depth_aux - 1].append(value)
    variable_depth_aux -= 1

    for key in data.keys():
        key_aux = key.split(sep='_')
        key_aux_aux = key_aux[::-1]
        variable_depth_aux = variable_depth - 1
        if key_aux_aux[0] == "0":
            key_aux_aux.pop(0)
            for i in key_aux_aux:
                i_without_number = i[:-1]
                if i_without_number not in all_the_lists[variable_depth_aux - 1]:
                    all_the_lists[variable_depth_aux - 1].append(i_without_number)
                    all_the_lists[variable_depth_aux - 1].append(i[-1])
                    variable_depth_aux -= 1


def script(method, attributes, sql_query):
	
	#arxaas = ARXaaS("http://10.152.183.204:8080") # connecting to online service
	arxaas = ARXaaS("http://arxass.default.svc.cluster.local:8080") # connecting to online service

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
	
	where = ""
	if 'WHERE' in sql_query:
		where = sql_query[sql_query.index('WHERE'):]
		
	query = "select * from personas " + where

	# Database query
	data_df = pd.read_sql(query, mydb)
	
	# Opening JSON file
	f = open('data.json')

	# returns JSON object as
	# a dictionary
	data = json.load(f)
	# print("json: " + str(data) + "\n")

	variable_depth = depth(data)
	
	dataset = Dataset.from_pandas(data_df)
	
	# it is checked if there are categorical attributes in the ontology
	if "categorical" in data:
		data_categorical = data["categorical"]
		for i in data_categorical:
    			data_categorical_aux = data_categorical[i]
    			data_processed = procedure_json(data_categorical_aux)
    			all_the_lists = [[] for x in range(int(variable_depth - 1))]
    			process_list(data_processed, variable_depth - 1, all_the_lists)
    			# we reverse the list
    			all_the_lists = all_the_lists[::-1]
    			# we keep the lowest level since it contains the names of the diseases
    			list_diseases = all_the_lists[0]
    			# creation of the hierarchy
    			order_based = OrderHierarchyBuilder()
    			for z in range(0, variable_depth - 2):
    				if z != variable_depth-2:
    					j = 0
    					while j < len(all_the_lists[z + 1]):
    						order_based.level(z).add_group(all_the_lists[z + 1][j + 1], all_the_lists[z + 1][j])
    						j += 2
    					
    					for attr in data_df:
    						if i == attr:
    							order_hierarchy = arxaas.hierarchy(order_based, list_diseases)		
    							dataset.set_hierarchy(i, order_hierarchy)
	
	# it is checked if there are numerical attributes in the ontology
	if "numerical" in data:
		data_numerical = data["numerical"]
		for i in data_numerical:
			data_numerical_aux = data_numerical[i]
			cont = 0
			cont_interval = 0
			cont_interval_aux = 1
			interval_based = IntervalHierarchyBuilder()
			
			values = data_numerical_aux.values()
			jump = list(values)[len(values) - 1]  # Convert to list and get last element
			min = list(values)[0]
			max = list(values)[len(values) - 2]
			min_aux = min
			jump_aux = jump
			while jump_aux < max:
				while min_aux < max:
					if cont == 0:
						interval_based.add_interval(min_aux, jump_aux, str(min_aux) + '-' + str(jump_aux))
					else:
						if cont_interval_aux % 2 == 0: # The number is even so it will always be the value 2
							interval_based.level(cont-1).add_group(2, str(min_aux) + '-' + str(jump_aux))
						else: # The number is odd so use 2 until 1 remains
							cont_interval_aux -= 2
							if cont_interval_aux > 0:
								interval_based.level(cont-1).add_group(2, str(min_aux) + '-' + str(jump_aux))
							else:
								interval_based.level(cont-1).add_group(1, str(min_aux) + '-' + str(jump_aux))
					
					min_aux = jump_aux
					jump_aux += jump
					cont_interval += 1
					
				jump = jump * 2
				jump_aux = jump
				min_aux = min
				cont += 1
				cont_interval_aux = cont_interval
				cont_interval = 0
					
			for attr in data_df:
				if i == attr:
					interval_hierarchy = arxaas.hierarchy(interval_based, data_df[i].tolist())
					dataset.set_hierarchy(i, interval_hierarchy)
	
	# it is checked if there are redaction attributes in the ontology			
	if "redaction" in data:
		data_redaction = data["redaction"]
		redaction_based = RedactionHierarchyBuilder()
		for i in data_redaction:
			redaction_hierarchy = arxaas.hierarchy(redaction_based, data_df[i].tolist())
			dataset.set_hierarchy(i, redaction_hierarchy)
	
	# ----------------------------------------------------#
	#    SEPARATION AND ASSIGNMENT OF ATTRIBUTES BY TYPE	
	# ----------------------------------------------------#
	
	attributes = json.loads(attributes)
	for key in attributes:
		# If the attribute is identiying, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.
		if key == 'identifying':
			identifying = attributes['identifying'].split(sep=", ")
			for i in identifying:
				dataset.set_attribute_type(AttributeType.IDENTIFYING, i)
					
		# If the attribute is insensitive, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.		
		elif key == 'insensitive':
			insensitive = attributes['insensitive'].split(sep=", ")
			for i in insensitive:		
				dataset.set_attribute_type(AttributeType.INSENSITIVE, i)
				
		# If the attribute is sensitive, all of them are separated in a new structure 
		# that is processed to assign that type in the Dataset.	
		elif key == 'sensitive':
			sensitive = attributes['sensitive'].split(sep=", ")
			for i in sensitive:
				dataset.set_attribute_type(AttributeType.SENSITIVE, i)
	

	# ----------------------------------------------------#
	#    	CHOICE OF PRIVATIZATION METHOD		
	# ----------------------------------------------------#
	
	# When using KAnonimity, check that there are no sensitive attributes.
	if method == "KAnonimity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[KAnonymity(attributes['level'])])	
	
	# Check for sensitive attributes when using LDiversity
	elif method == "LDiversity":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[LDiversityDistinct(int(attributes['level']), attributes['sensitive'])])
	
	# When using TCloseness, it must be checked that there are sensitive attributes
	elif method == "TCloseness":
		anon_result = arxaas.anonymize(dataset=dataset, privacy_models=[TClosenessEqualDistance(float(attributes['level']), attributes['sensitive'])])
	
	
	
	
	
	string_aux = sql_query[7:sql_query.index('FROM')-1]

	list_sql = string_aux.split(',')

	df = anon_result.dataset.to_dataframe()
	
	if list_sql[0] != "*":	
		df = df[list_sql]
	
	out = df.to_json(orient='index')
	out_json = json.loads(out)
	return out_json




# -- API REST --

class General(Resource):
	def get(self):
	
		# The value of the privatization method is obtained
		method = request.args.get('method')
		# The values of the attribute types are obtained
		attributes = request.args.get('attributes[]')
		sql_query = request.args.get('sql')
		
		# "method", "attributes[]" and "sql_query" are checked to see if they have value
		if not method:
			return "Privatization method not specified"
		elif not attributes:
			return "The type of the attributes have not been specified."
		elif not sql_query:
			return "The query to be performed has not been specified"
		else:
			jsonstring = script(method, attributes, sql_query)
			return jsonstring
		



# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
	#app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
	#app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
	app.run(host='0.0.0.0',port='8083')
