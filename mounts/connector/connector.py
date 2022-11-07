import paho.mqtt.client as mqtt
import mysql.connector

# The callback for when the client receives a CONNACK response from the server.
def on_connect(client, userdata, flags, rc):
    print("Connected with result code "+str(rc))

    # Subscribing in on_connect() means that if we lose the connection and
    # reconnect then subscriptions will be renewed.
    client.subscribe("persona/#")

# The callback for when a PUBLISH message is received from the server.
def on_message(client, userdata, msg):

    print("Topic: "+msg.topic+" Payload: "+msg.payload)

    # Messages follow the following format: 
    #   topic: "persona"
    #   payload: nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad

    payloadTroceado=str(msg.payload).split(', ')
    topic=str(msg.topic)

    print("topic: "+topic+" valor: "+str(msg.payload))

    # We will store in this order:
    #   table personas
    #       column id (AI)
    #       column name
    #       column age
    #       column lat
    #       column lon
    #       column job
    #       column salary
    #       column pulse
    #       column temperature
    #       column disease 

    # We check that all values have been entered
    print('len: ' + str(len(payloadTroceado)))
    if (len(payloadTroceado) == 9):
      sql = "INSERT INTO personas (name, age, lat, lon, job, salary, pulse, temperature, disease) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)"
      val = payloadTroceado
      try:
        mycursor.execute(sql, val)
        mydb.commit()
        print(mycursor.rowcount, "record inserted.")
      except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))   
    else:
      print('Data have not been entered correctly')

# create the customer properties
client = mqtt.Client(client_id="Connector")
client.on_connect = on_connect
client.on_message = on_message

# Configure the connection via TLS and with usr + pwd
# client.tls_set(ca_certs="ssl/myCA.pem", cert_reqs=mqtt.ssl.CERT_REQUIRED)
# client.username_pw_set("manuel", password="manuel")

# broker connection
client.connect("mosquitto-broker.default.svc.cluster.local", 1883, 60)

# Nos conectamos a la base de datos
mydb = mysql.connector.connect(
	host="mysql-master.default.svc.cluster.local",
	port="3306",
	user="root",
	passwd="",
	database="test"
)

# create the cursor
mycursor = mydb.cursor()

# Blocking call that processes network traffic, dispatches callbacks and
# handles reconnecting.
# Other loop*() functions are available that give a threaded interface and a
# manual interface.
client.loop_forever()
