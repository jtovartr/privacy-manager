#!/bin/bash

microk8s.kubectl apply -f mysql/mysql-configmap.yaml
microk8s.kubectl apply -f mysql/mysql-statefulset.yaml
microk8s.kubectl apply -f mysql/mysql-master-service.yaml
microk8s.kubectl apply -f mysql/mysql-service.yaml

microk8s.kubectl label pod mysql-0 "mysql=mysqlMaster"

microk8s.kubectl apply -f mqttimg/mosquitto.yaml

microk8s.kubectl apply -f ingress/ingress.yaml

microk8s.kubectl apply -f gen/gen.yaml

microk8s.kubectl apply -f arx/arx.yaml

microk8s.kubectl apply -f arxAas/pyarxass.yaml
  
microk8s.kubectl apply -f nodejs/apiRest.yaml
microk8s.kubectl apply -f nodejs/auth.yaml
microk8s.kubectl apply -f nodejs/priv.yaml


microk8s.kubectl apply -f phpmyadmin/phpmyadmin.yaml
microk8s.kubectl apply -f phpmyadmin/ingress.yaml

#microk8s.kubectl apply -f connector/connector.yaml

microk8s.kubectl apply -f nodeRED/nodered.yaml

microk8s.kubectl apply -f orion-broker/orion.yaml

microk8s.kubectl apply -f connector/connector.yaml
