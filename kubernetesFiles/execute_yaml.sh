#!/bin/bash

python3 mysql/generateTables.py >> mysql/mysql-configmap2.yaml

microk8s.kubectl apply -f mysql/mysql-configmap.yaml
microk8s.kubectl apply -f mysql/mysql-configmap2.yaml
microk8s.kubectl apply -f mysql/mysql-statefulset.yaml

envsubst < mysql/mysql-master-service.yaml | microk8s.kubectl apply -f -

envsubst < mysql/mysql-service.yaml | microk8s.kubectl apply -f -

microk8s.kubectl label pod mysql-0 "mysql=mysqlMaster"

envsubst < mqttimg/mosquitto.yaml | microk8s.kubectl apply -f -

microk8s.kubectl apply -f ingress/ingress.yaml

envsubst < gen/gen.yaml | microk8s.kubectl apply -f -

envsubst < arx/arx.yaml | microk8s.kubectl apply -f -

envsubst < arxAas/pyarxass.yaml | microk8s.kubectl apply -f -
  
envsubst < nodejs/apiRest.yaml | microk8s.kubectl apply -f -

envsubst < nodejs/auth.yaml | microk8s.kubectl apply -f -

envsubst < nodejs/priv.yaml | microk8s.kubectl apply -f -

envsubst < phpmyadmin/phpmyadmin.yaml | microk8s.kubectl apply -f -

microk8s.kubectl apply -f phpmyadmin/ingress.yaml

envsubst < nodeRED/nodered.yaml | microk8s.kubectl apply -f -

envsubst < orion-broker/orion.yaml | microk8s.kubectl apply -f -

microk8s.kubectl apply -f connector/connector.yaml

microk8s.kubectl apply -f mongodb/mongodb-statefulset.yaml
envsubst < mongodb/mongodb-master-service.yaml | microk8s.kubectl apply -f -
envsubst < mongodb/mongodb-service.yaml | microk8s.kubectl apply -f -
microk8s.kubectl label pod mongo-0 "mongo=mongoMaster"

envsubst < mongodb/priv-mongo.yaml | microk8s.kubectl apply -f -
