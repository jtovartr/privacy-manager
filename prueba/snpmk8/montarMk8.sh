#!/usr/bin/env bash
#HAY QUE MIRAR CUAL ES EL NUEMERO DE NUESTRA INSTALACION
sudo mksquashfs squashfs-root microk8s_1422.snap
sudo cp microk8s_1422.snap /var/lib/snapd/snaps/microk8s_1422.snap
sudo mount -t squashfs -o ro,nodev,relatime,x-gdu.hide /var/lib/snapd/snaps/microk8s_1422.snap /snap/microk8s/1422
sudo rm -rf microk8s_1422.snap
sudo rm -rf squashfs-root