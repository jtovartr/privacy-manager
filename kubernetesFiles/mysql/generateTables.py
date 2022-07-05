import json

sql_sentence = "    CREATE TABLE personas (id INT NOT NULL AUTO_INCREMENT, "

with open('../mounts/arx/data.json', 'r') as f:
    data = json.load(f)
    if "categorical" in data:
        for i in data["categorical"]:
            sql_sentence += i + " VARCHAR(255) NOT NULL, "
    if "numerical" in data:
        for i in data["numerical"]:
            sql_sentence += i + " INT NOT NULL, "
    if "redaction" in data:
        for i in data["redaction"]:
            sql_sentence += i + " FLOAT NOT NULL, "
    if "other" in data:
    	for i in data["other"]:
    		sql_sentence += i + " " + data["other"][i] + " NOT NULL, "

sql_sentence += "PRIMARY KEY(id));"

print(sql_sentence)

sql_sentence2 = "    CREATE TABLE usuarios (id INT NOT NULL AUTO_INCREMENT, email VARCHAR(255) NOT NULL, password VARCHAR(255) NOT NULL, salt VARCHAR(255) NOT NULL, type VARCHAR(255) NOT NULL, PRIMARY KEY (id));"

print(sql_sentence2)
