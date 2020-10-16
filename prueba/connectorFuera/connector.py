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

    # Los mensajes siguen el siguiente formato: 
    #   tema: "perosna"
    #   payload: nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad

    payloadTroceado=str(msg.payload).split(', ')
    topic=str(msg.topic)

    print("topic: "+topic+" valor: "+str(msg.payload))

    #Vamos a almacenar en este orden:
    #   tabla personas
    #       columna id (AI)
    #       columna nombre
    #       columna edad
    #       columna lat
    #       columna lon
    #       columna profesion
    #       columna sueldo
    #       columna pulso
    #       columna temperatura
    #       columna enfermedad 

    #Comprobamos que se han introducido todos los valores
    print('len: ' + str(len(payloadTroceado)))
    print()
    if (len(payloadTroceado) == 9):
      print('Me meto en ID nuevo')
      sql = "INSERT INTO personas (nombre, edad, lat, lon, profesion, sueldo, pulso, temperatura, enfermedad) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)"
      val = payloadTroceado
      try:
        mycursor.execute(sql, val)
        mydb.commit()
        print(mycursor.rowcount, "record inserted.")
      except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))   
    else:
      print('No se han introducido los datos correctamente')

# Nos conectamos al mqtt broker
client = mqtt.Client(client_id="Connector")
client.on_connect = on_connect
client.on_message = on_message

client.tls_set(ca_certs="ssl/myCA.pem", cert_reqs=mqtt.ssl.CERT_REQUIRED)
client.username_pw_set("manuel", password="manuel")
client.connect("broker", 8883, 60)

#Nos conectamos a la base de datos
mydb = mysql.connector.connect(
  host="10.152.183.137", #master
  port="3306",
  user="root",
  passwd="",
  database="test"
)

#creamos el cursor
mycursor = mydb.cursor()

# Blocking call that processes network traffic, dispatches callbacks and
# handles reconnecting.
# Other loop*() functions are available that give a threaded interface and a
# manual interface.
client.loop_forever()
