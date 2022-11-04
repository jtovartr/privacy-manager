# Privacy Manager system for IoT and Edge Computing
A privacy system made for my Degree Final Project.

# How to configure

## Step 0

***ADDED NEW INSTALLER "setup.sh" that involves Steps 1 to 5. You should have Python3 installed.***

## Step 1

You have to configure your own kubernetes cluster. You need to have a storage class, an ingress controller, and a load balancer.

You can easily get this with microk8s, and its addons. If you are using microk8s, you have to enable the following addons: dns, dashboard, ingress, storage, metallb

## Step 2
You have to add the following lines in your ingress controller. This will allow you to expose tcp services like mosquitto in your Ingress.

```
#This allow us to pass tcp traffic through the Ingress
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-ingress-tcp-microk8s-conf
  namespace: ingress
data:
  8083: "default/mosquitto-broker:1883"
---
#This goes inside the DaemonSet
kind: DaemonSet
metadata:
  ...
spec:
  selector:
    ...
  template:
    ...
    spec:
      containers:
      - name: nginx-ingress-microk8s
        ports:
        - containerPort: 80
        - containerPort: 443
        #This right here
        - name: prxy-tcp-8083
          containerPort: 8083
          hostPort: 1883
          protocol: TCP

```
If you are using microk8s installed through snap, you can use the comands in /extra/snpmk8 to unmount and mount the volume where the Ingress Controller is located. To update the info on the Ingress Controller, disable and enable again the Ingress addon.

## Step 3 (optional)

You can change the certificate used in TLS by Ingress.
First, you have to create a secret with the cert in your kubernetes cluster. You can add it with this command:
```
kubectl create secret tls ${CERT_NAME} --key ${KEY_FILE} --cert ${CERT_FILE}
```

Then, you need to add this line in your Ingress Controller:
```
#This goes inside the DaemonSet
kind: DaemonSet
metadata:
  ...
spec:
  ...
  template:
    ...
    spec:
      ...
      containers:
        ...
        args
        ...
        - --default-ssl-certificate=default/${CERT_NAME}
```


## Step 4
Kubernetes doesn't work with relative pathing (see [pathing rules](https://github.com/kubernetes/kubernetes/pull/20328/files)), so you will have to change the volume hostpath of the following files:

```
kubernetesFiles/connector/connector.yaml
kubernetesFiles/gen/gen.yaml
kubernetesFiles/nodejs/apiRest.yaml
kubernetesFiles/nodejs/auth.yaml
kubernetesFiles/nodejs/priv.yaml
kubernetesFiles/nodeRED/nodered.yaml
kubernetesFiles/mqttimg/mosquitto.yaml
```

You have to put the path to the folders inside mounts/ on this git.

## Step 5

envsubst needs to be installed in order to automate yaml files:

```
apt-get install gettext-base
```

## Step 6
In the same way that policies can be specified for each user, each user must specify the data that their database will have and the privatization hierarchies that will be performed on it.

There is the file [data.json](https://github.com/jtovartr/privacy-manager/blob/main/mounts/arx/data.json), in which the hierarchies will be specified and, at the same time, the database attributes, which will later be read automatically to create the database.

## Step 7
In order to be able to use the field level encryption feature of MongoDB, an IAM user and a Private Key must be generated for use in the [priv-mongo.js](https://github.com/jtovartr/privacy-manager/blob/main/mounts/mongodb/prueba.js) file.


## Step 8

## Step 7
Now you have to wait for the system to be ready. You can check the status with ```microk8s kubectl get all -A```. When every pod and service is ready, you can deploy the privacy manager. 

For deploying the whole system, you have to execute (if you are working with microk8s) kubernetesFiles/execute_yaml.sh. If you aren't, you can copy the kubectl commands and execute in a terminal.

## Step 8

At this point, the database contains two tables. The first one is usuarios, which has a default user (admin). The other table is personas, which is empty.

These tables are created automatically thanks to the [generateTables.py](https://github.com/jtovartr/privacy-manager/blob/main/kubernetesFiles/mysql/generateTables.py) script. To create the personas table, the [data.json](https://github.com/jtovartr/privacy-manager/blob/main/mounts/arx/data.json) file is read and depending on the type of attribute in the file an appropriate MySQL value type will be assigned.

## Step 8
You will notice that everything is deployed correctly, except for the connector pod. It is trying to connect to the database, but mysql doesn't have the correct configuration. For it to work correctly, you have to enter the phpMyAdmin pod, and create the database with de following command:

- Create database
```
CREATE DATABASE test
```
## Step 9 (optional)
You can add some preloaded data to the database for testing purposes. You should execute this SQL queries in the phpMyAdmin pod.

- Create "personas" table.
```
CREATE TABLE `test`.`personas` ( `id` INT NOT NULL AUTO_INCREMENT , `name` VARCHAR(255) NOT NULL , `age` INT NOT NULL , `lat` FLOAT NOT NULL , `lon` FLOAT NOT NULL , `job` VARCHAR(255) NOT NULL , `salary` INT NOT NULL , `pulse` INT NOT NULL , `temperature` FLOAT NOT NULL , `disease` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`))
```
- Insert into "personas"
```
INSERT INTO `personas` (`id`, `name`, `age`, `lat`, `lon`, `job`, `salary`, `pulse`, `temperature`, `disease`) VALUES (NULL, 'Manuel Ruiz Ruiz', '21', '1234', '5678', 'software eng', '0', '60', '36', 'SARS'), (NULL, 'Alberto', '22', '123.567', '23.12344', 'mining eng', '0', '59', '35.4', 'pneumonia'), (NULL, 'Juan', '34', '534.3521', '5363.3235', 'computer eng', '60000', '58', '38', 'bronchitis'), (NULL, 'Alvaro', '64', '984.1234', '734.565', 'cubist painter', '70000', '66', '35.2', 'gastric flu'), (NULL, 'Miguel', '23', '546.234', '765.234', 'realist painter', '90000', '67', '37.8', 'gastric ulcer'), (NULL, 'Ana', '3', '543.645', '123.456', 'software eng', '0', '61', '36.3', 'intestinal cancer'), (NULL, 'Elena', '43', '6.432534', '3.2345234', 'computer eng', '30000', '67', '35.8', 'SARS'), (NULL, 'Rocio', '70', '6546.3', '4563.2', 'mining eng', '20000', '56', '35.4', 'pneumonia'), (NULL, 'Maria', '33', '867.6456', '342.123', 'software eng', '70000', '63', '36.5', 'bronchitis'), (NULL, 'Manuel Jesús', '23', '674.56', '4353.345', 'computer eng', '50000', '69', '38.2', 'gastric flu') 
```
- Create "usuarios" table
```
CREATE TABLE `test`.`usuarios` ( `id` INT NOT NULL AUTO_INCREMENT , `email` VARCHAR(255) NOT NULL , `password` VARCHAR(255) NOT NULL ,`salt` VARCHAR(255) NOT NULL , `type` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`))
```
- Insert into "usuarios"
```
INSERT INTO `usuarios` (`id`, `email`, `password`, `salt`, `type`) VALUES (NULL, 'nicslab', '$2b$10$yRmIctt/Mo.5mkceNy0fheeqwE6JJnTHmDPrvAoCiE0zv4a6KoStS', '$2b$10$yRmIctt/Mo.5mkceNy0fhe', 'admin') 
```
