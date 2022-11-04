## cambiar 

import os

path_list=["kubernetesFiles/connector/connector.yaml",
"kubernetesFiles/gen/gen.yaml",
"kubernetesFiles/nodejs/apiRest.yaml",
"kubernetesFiles/nodejs/auth.yaml",
"kubernetesFiles/nodejs/priv.yaml",
"kubernetesFiles/nodeRED/nodered.yaml",
"kubernetesFiles/mqttimg/mosquitto.yaml",
"kubernetesFiles/arx/arx.yaml"
]

cwd = os.getcwd()
#print(cwd)
cwd = cwd.replace("/privacy-manager","")

print(cwd)

for i in path_list:
    fd=i
    f = open(fd, "r")
    list_lines = f.readlines()

    for i in range (len(list_lines)):
        if "path: /home/jesus/Proyectos" in list_lines[i]:
            print(list_lines[i])
            list_lines[i]=list_lines[i].replace("/home/jesus/Proyectos",cwd)
            print(list_lines[i])

    f_write = open(fd, "w")
    list_lines = "".join(list_lines)
    f_write.write(list_lines)

