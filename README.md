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
kubernetesFiles/arx/arx.yaml
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
In order to be able to use the field level encryption feature of MongoDB, a GPC service accout and Customer Master Key must be generated for use in the [priv-mongo.js](https://github.com/jtovartr/privacy-manager/blob/main/mounts/mongodb/prueba.js) file. To do this you can follow the links below.

[GPC-service-account](https://www.mongodb.com/docs/manual/core/csfle/tutorials/gcp/gcp-automatic/#register-a-gcp-service-account)

[GPC-customer-master-key](https://www.mongodb.com/docs/manual/core/csfle/tutorials/gcp/gcp-automatic/#create-a-gcp-customer-master-key)

[GPC-create-dek](https://www.mongodb.com/docs/manual/core/csfle/tutorials/gcp/gcp-automatic/#create-a-data-encryption-key)

## Step 8
Now you have to wait for the system to be ready. You can check the status with ```microk8s kubectl get all -A```. When every pod and service is ready, you can deploy the privacy manager. 

For deploying the whole system, you have to execute (if you are working with microk8s) kubernetesFiles/execute_yaml.sh. If you aren't, you can copy the kubectl commands and execute in a terminal.

## Step 9

At this point, the database contains two tables. The first one is usuarios, which has a default user (admin). The other table is personas, which is empty.

These tables are automatically created by the script [generateTables.py](https://github.com/jtovartr/privacy-manager/blob/main/kubernetesFiles/mysql/generateTables.py) script. To create the personas table, the [data.json](https://github.com/jtovartr/privacy-manager/blob/main/mounts/arx/data.json) file is read and depending on the type of attribute in the file an appropriate MySQL value type will be assigned.
