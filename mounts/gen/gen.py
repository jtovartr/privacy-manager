#Modified by: Manuel Ruiz Ruiz
# 
# Esta API recibe un GET y devuelve la tabla entera anonimizada

import mysql.connector
import pandas as pd
import matplotlib.pylab as pl
import matplotlib.patches as patches

from flask import Flask, request
from flask_restful import Resource, Api
from json import dumps
from flask import jsonify

import json

#Flask
app = Flask(__name__)
api = Api(app)

# -- ANONYMITY --

#CONSTANTES
names = (
    'id',
    'name',
    'lat', 
    'lon',
    'job',
    'salary',
    'pulse',
    'temperature',
    'disease'
)

categorical = set((
    'name',
    'job',
    'disease'
))

feature_columns = [ 'lat','lon', 'salary', 'pulse', 'temperature']
sensitive_column = 'job'

# FUNCIONES

def get_spans(df, partition, scale=None):
    spans = {}
    for column in df.columns:
        if column in categorical:
            span = len(df[column][partition].unique())
        else:
            span = df[column][partition].max()-df[column][partition].min()
        if scale is not None:
            span = span/scale[column]
        spans[column] = span
    return spans

def split(df, partition, column):
    dfp = df[column][partition]
    if column in categorical:
        values = dfp.unique()
        lv = set(values[:len(values)//2])
        rv = set(values[len(values)//2:])
        return dfp.index[dfp.isin(lv)], dfp.index[dfp.isin(rv)]
    else:        
        median = dfp.median()
        dfl = dfp.index[dfp < median]
        dfr = dfp.index[dfp >= median]
        return (dfl, dfr)

def is_k_anonymous(df, partition, sensitive_column, k=3):
    if len(partition) < k:
        return False
    return True

def partition_dataset(df, feature_columns, sensitive_column, scale, is_valid):
    finished_partitions = []
    partitions = [df.index]
    while partitions:
        partition = partitions.pop(0)
        spans = get_spans(df[feature_columns], partition, scale)
        for column, span in sorted(spans.items(), key=lambda x:-x[1]):
            lp, rp = split(df, partition, column)
            if not is_valid(df, lp, sensitive_column) or not is_valid(df, rp, sensitive_column):
                continue
            partitions.extend((lp, rp))
            break
        else:
            finished_partitions.append(partition)
    return finished_partitions

def build_indexes(df):
    indexes = {}
    for column in categorical:
        values = sorted(df[column].unique())
        indexes[column] = { x : y for x, y in zip(values, range(len(values)))}
    return indexes

def get_coords(df, column, partition, indexes, offset=0.1):
    if column in categorical:
        sv = df[column][partition].sort_values()
        l, r = indexes[column][sv[sv.index[0]]], indexes[column][sv[sv.index[-1]]]+1.0
    else:
        sv = df[column][partition].sort_values()
        next_value = sv[sv.index[-1]]
        larger_values = df[df[column] > next_value][column]
        if len(larger_values) > 0:
            next_value = larger_values.min()
        l = sv[sv.index[0]]
        r = next_value
    l -= offset
    r += offset
    return l, r

def get_partition_rects(df, partitions, column_x, column_y, indexes, offsets=[0.1, 0.1]):
    rects = []
    for partition in partitions:
        xl, xr = get_coords(df, column_x, partition, indexes, offset=offsets[0])
        yl, yr = get_coords(df, column_y, partition, indexes, offset=offsets[1])
        rects.append(((xl, yl),(xr, yr)))
    return rects

def get_bounds(df, column, indexes, offset=1.0):
    if column in categorical:
        return 0-offset, len(indexes[column])+offset
    return df[column].min()-offset, df[column].max()+offset

def plot_rects(df, ax, rects, column_x, column_y, edgecolor='black', facecolor='none'):
    for (xl, yl),(xr, yr) in rects:
        ax.add_patch(patches.Rectangle((xl,yl),xr-xl,yr-yl,linewidth=1,edgecolor=edgecolor,facecolor=facecolor, alpha=0.5))
    ax.set_xlim(*get_bounds(df, column_x, indexes))
    ax.set_ylim(*get_bounds(df, column_y, indexes))
    ax.set_xlabel(column_x)
    ax.set_ylabel(column_y)

def agg_categorical_column(series):
    return [','.join(set(series))]

def agg_numerical_column(series):
    return [series.mean()]

def build_anonymized_dataset(df, partitions, feature_columns, sensitive_column, max_partitions=None):
    aggregations = {}
    for column in feature_columns:
        if column in categorical:
            aggregations[column] = agg_categorical_column
        else:
            aggregations[column] = agg_numerical_column
    rows = []
    for i, partition in enumerate(partitions):
        if i % 100 == 1:
            print("Finished {} partitions...".format(i))
        if max_partitions is not None and i > max_partitions:
            break
        grouped_columns = df.loc[partition].agg(aggregations, squeeze=False)
        sensitive_counts = df.loc[partition].groupby(sensitive_column).agg({sensitive_column : 'count'})
        values = grouped_columns.iloc[0].to_dict()
        for sensitive_value, count in sensitive_counts[sensitive_column].items():
            if count == 0:
                continue
            values.update({
                sensitive_column : sensitive_value,
                'count' : count,

            })
            rows.append(values.copy())
    return pd.DataFrame(rows)

def diversity(df, partition, column):
    return len(df[column][partition].unique())

def is_l_diverse(df, partition, sensitive_column, l=2):
    return diversity(df, partition, sensitive_column) >= l

def t_closeness(df, partition, column, global_freqs):
    total_count = float(len(partition))
    d_max = None
    group_counts = df.loc[partition].groupby(column)[column].agg('count')
    for value, count in group_counts.to_dict().items():
        p = count/total_count
        d = abs(p-global_freqs[value])
        if d_max is None or d > d_max:
            d_max = d
    return d_max

def is_t_close(df, partition, sensitive_column, global_freqs, p=0.2):
    if not sensitive_column in categorical:
        raise ValueError("this method only works for categorical values")
    return t_closeness(df, partition, sensitive_column, global_freqs) <= p

# SCRIPT

def script(sql_query):

    #connection to the database
    #Este no tendría por que conectarse al master porque solo lee datos
    mydb = mysql.connector.connect(
    #host="10.152.183.232", #mysql read
    host="mysql-master.default.svc.cluster.local",
    port="3306",
    user="root",
    passwd="",
    database="test"
    )

    #We tried to collect the data from mysql instead of csv
    #df = pd.read_csv("./data/k-anonymity/my-adult.all.txt", sep=", ", header=None, names=names, index_col=False, engine='python');
    df = pd.read_sql(sql_query, mydb)
    print('----------------TABLA-------------------')
    print(df.head())
        
    for name in categorical:
        df[name] = df[name].astype('category')

    full_spans = get_spans(df, df.index)
    print('----------------SPANS-------------------')
    print(full_spans)

    finished_partitions = partition_dataset(df, feature_columns, sensitive_column, full_spans, is_k_anonymous)
    print('----------------PARTITIONS-------------------')
    print(len(finished_partitions))

    indexes = build_indexes(df)
    column_x, column_y = feature_columns[:2]
    rects = get_partition_rects(df, finished_partitions, column_x, column_y, indexes, offsets=[0.0, 0.0])
    print('----------------RECTS-------------------')
    print(rects[:10])

    # pl.figure(figsize=(20,20))
    # ax = pl.subplot(111)
    # plot_rects(df, ax, rects, column_x, column_y, facecolor='r')
    # pl.scatter(df[column_x], df[column_y])
    # pl.show()

    dfn = build_anonymized_dataset(df, finished_partitions, feature_columns, sensitive_column)
    print('----------------DFN-------------------')
    print(dfn.sort_values(feature_columns+[sensitive_column]))

    finished_l_diverse_partitions = partition_dataset(df, feature_columns, sensitive_column, full_spans, lambda *args: is_k_anonymous(*args) and is_l_diverse(*args))

    print('----------------L-DIVERSE-------------------')
    print(len(finished_l_diverse_partitions))

    column_x, column_y = feature_columns[:2]
    l_diverse_rects = get_partition_rects(df, finished_l_diverse_partitions, column_x, column_y, indexes, offsets=[0.0, 0.0])

    # pl.figure(figsize=(20,20))
    # ax = pl.subplot(111)
    # plot_rects(df, ax, l_diverse_rects, column_x, column_y, edgecolor='b', facecolor='b')
    # plot_rects(df, ax, rects, column_x, column_y, facecolor='r')
    # pl.scatter(df[column_x], df[column_y])
    # pl.show()

    dfl = build_anonymized_dataset(df, finished_l_diverse_partitions, feature_columns, sensitive_column)
    
    print('----------------SORT-------------------')
    print(dfl.sort_values([column_x, column_y, sensitive_column]))

    global_freqs = {}
    total_count = float(len(df))
    group_counts = df.groupby(sensitive_column)[sensitive_column].agg('count')
    for value, count in group_counts.to_dict().items():
        p = count/total_count
        global_freqs[value] = p
    
    print('----------------FREQS-------------------')
    print(global_freqs)

    finished_t_close_partitions = partition_dataset(df, feature_columns, sensitive_column, full_spans, lambda *args: is_k_anonymous(*args) and is_t_close(*args, global_freqs))

    print('----------------T-CLOSE-------------------')
    print(len(finished_t_close_partitions))

    dft = build_anonymized_dataset(df, finished_t_close_partitions, feature_columns, sensitive_column)

    # out is the string json
    out = dft.to_json(orient='index')
    
    print('----------------DFT-------------------')
    print(dft.sort_values([column_x, column_y, sensitive_column]))

    column_x, column_y = feature_columns[:2]
    t_close_rects = get_partition_rects(df, finished_t_close_partitions, column_x, column_y, indexes, offsets=[0.0, 0.0])

    print('----------------OUT-------------------')
    print(out)

    # pl.figure(figsize=(20,20))
    # ax = pl.subplot(111)
    # plot_rects(df, ax, t_close_rects, column_x, column_y, edgecolor='b', facecolor='b')
    # pl.scatter(df[column_x], df[column_y])
    # pl.show()
    return out


# -- API REST --

class General(Resource):
    def get(self):
    	sql_query = request.args.get('sql')
    	jsonstring = script(sql_query)               
    	return json.loads(jsonstring)        

        
# Routes
api.add_resource(General, '/')

if __name__ == '__main__':
    #app.run(port='8083', ssl_context=('ssl/gen.pem', 'ssl/key.pem'))
    #app.run(host='0.0.0.0',port='8083', ssl_context=('ssl/hellfish.test.crt', 'ssl/hellfish.test.key'))
    app.run(host='0.0.0.0',port='8083')
