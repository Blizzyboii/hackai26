from flask import Flask, request
import requests
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)

client = MongoClient(os.getenv("MONGODB_URI"))
db = client.clubs_data
clubs_collection = db.clubs

@app.route("/")
def hello():
    return "Hello, World!"

@app.route("/getClubs/<search_query>", methods=["GET"])
def get_clubs(search_query):
    headers = {
        "x-api-key": os.getenv("NEBULA_API_KEY"),
    }
    response = requests.get(f"https://api.utdnebula.com/club/search?q={search_query}", headers=headers)
    data = response.json()
    
    # Only store first 30 clubs cause too much is returned
    clubs_to_store = data["data"][:30]
    
    for club in clubs_to_store:
      club_data = {
        "id": club.get("id"),
        "name": club.get("name"),
        "description": club.get("description"),
        "tags": club.get("tags", []),
        "officers": club.get("officers", []),
      }
      clubs_collection.update_one(
        {"id": club_data["id"]},
        {"$set": club_data},
        upsert=True
      )
    print("Stored clubs in database")
    return data
    

if __name__ == "__main__":
    app.run(debug=True)
