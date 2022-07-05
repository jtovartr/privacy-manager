#!/bin/bash

microk8s.kubectl delete -n default deployment gen
microk8s.kubectl delete -n default deployment arx
microk8s.kubectl delete -n default deployment arxass-deployment
microk8s.kubectl delete -n default deployment api-rest
microk8s.kubectl delete -n default deployment auth
microk8s.kubectl delete -n default deployment priv
microk8s.kubectl delete -n default deployment connector
microk8s.kubectl delete -n default deployment phpmyadmin-deployment 
microk8s.kubectl delete -n default deployment mosquitto-broker
microk8s.kubectl delete -n default deployment orion
microk8s.kubectl delete -n default deployment node-red


microk8s.kubectl delete -n default service gen
microk8s.kubectl delete -n default service arx
microk8s.kubectl delete -n default service arxass
microk8s.kubectl delete -n default service api-rest
microk8s.kubectl delete -n default service auth
microk8s.kubectl delete -n default service priv
microk8s.kubectl delete -n default service mysql-read
microk8s.kubectl delete -n default service mysql-master
microk8s.kubectl delete -n default service phpmyadmin-service
microk8s.kubectl delete -n default service mysql
microk8s.kubectl delete -n default service mosquitto-broker
microk8s.kubectl delete -n default service orion
microk8s.kubectl delete -n default service node-red


microk8s.kubectl delete -n default ingress k8s-ingress
microk8s.kubectl delete -n default ingress phpmyadmin-http-ingress

microk8s.kubectl delete -n default configmap mysql
microk8s.kubectl delete -n default configmap mysql-initdb-config

microk8s.kubectl delete -n default statefulset mysql
