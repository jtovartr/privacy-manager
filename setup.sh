#!/bin/bash

#Installing microk8s
sudo apt update
sudo apt install snapd

sudo snap install microk8s --classic

sudo usermod -a -G microk8s $USER
sudo chown -f -R $USER ~/.kube

#Starting microk8s
sudo microk8s.start

#First step: enable addons
sudo microk8s.enable dns dashboard ingress storage metallb

sudo microk8s status --wait-ready

#Second step: configure ingress for mqtt traffic
sudo microk8s.stop
sudo ./extra/snpmk8/edit-ingress.sh

#Fourth step: change some file paths needed
python3 extra/setup/step4.py

microk8s.start

sudo microk8s status --wait-ready

sudo apt-get install gettext-base

#cd kubernetesFiles

#sudo ./execute_yaml.sh

#Token para entrar en el dashboard
#token=$(microk8s kubectl -n kube-system get secret | grep default-token | cut -d " " -f1)
#microk8s kubectl -n kube-system describe secret $token
