FROM python:3.7

#Prepare the directory inside the image
RUN mkdir -p /mount
WORKDIR /mount

#Install the desired libraries
RUN pip3 install pandas
RUN pip3 install pyarxaas
RUN pip3 install matplotlib
RUN pip3 install mysql-connector
RUN pip3 install flask flask-jsonpify flask-restful
RUN pip3 install pyopenssl
