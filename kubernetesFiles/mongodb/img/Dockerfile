FROM node:12.14

#Prepare the directory inside the image
RUN mkdir -p /node
WORKDIR /node

#Install the desired libraries
RUN npm install mongodb-client-encryption
RUN npm install express
RUN npm install body-parser
RUN npm install helmet
RUN npm install fs
RUN npm install uuid-base64
RUN npm install aes-cbc-hmac-sha2

#When we have downloaded the modules, we change the directory so as not to destroy it.
RUN mkdir -p /node/mount
WORKDIR /node/mount
