FROM node:12.14

#Preparar el directorio dentro de la imagen
RUN mkdir -p /node
WORKDIR /node

#instalar las librerias deseadas
RUN npm install mongodb-client-encryption
RUN npm install express
RUN npm install body-parser
RUN npm install helmet
RUN npm install fs
RUN npm install uuid-base64
RUN npm install aes-cbc-hmac-sha2

#Cuando nos hemos bajado los modulos, cambiamos de directorio para no machacarlo
RUN mkdir -p /node/mount
WORKDIR /node/mount
