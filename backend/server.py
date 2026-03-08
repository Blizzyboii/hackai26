from __future__ import annotations

import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

try:
    from backend.graph_builder import build_graph_dataset
except ModuleNotFoundError:
    from graph_builder import build_graph_dataset


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

allowed_origins = [origin.strip() for origin in os.getenv("API_ALLOWED_ORIGINS", "*").split(",") if origin.strip()]
if allowed_origins == ["*"]:
    CORS(app)
else:
    CORS(app, origins=allowed_origins)

client = None
clubs_collection = None


def get_clubs_collection():
    global client, clubs_collection

    if clubs_collection is not None:
        return clubs_collection

    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise RuntimeError("MONGODB_URI is not configured in backend/.env")

    client = MongoClient(mongo_uri)
    db = client.clubs_data
    clubs_collection = db.clubs
    return clubs_collection


def linkedin_scrape_with_selenium(profile_url: str) -> dict[str, object]:
    """Scrape LinkedIn profile using Selenium with login."""
    email = os.getenv("LINKEDIN_EMAIL")
    password = os.getenv("LINKEDIN_PASSWORD")

    if not email or not password:
        return {"error": "LinkedIn credentials not found in .env"}

    chrome_options = Options()
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    driver = None

    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

        driver.get("https://www.linkedin.com/login")
        time.sleep(2)

        email_field = driver.find_element(By.ID, "username")
        email_field.send_keys(email)

        password_field = driver.find_element(By.ID, "password")
        password_field.send_keys(password)

        login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        login_button.click()

        time.sleep(3)
        driver.get(profile_url)
        time.sleep(5)

        name = None
        for selector in ["h1.text-heading-xlarge", "h1", "div.ph5 h1"]:
            try:
                name = driver.find_element(By.CSS_SELECTOR, selector).text
                if name:
                    break
            except Exception:
                continue

        headline = None
        for selector in ["div.text-body-medium", "div.ph5 div.text-body-medium", ".pv-text-details__left-panel div"]:
            try:
                headline = driver.find_element(By.CSS_SELECTOR, selector).text
                if headline and headline != name:
                    break
            except Exception:
                continue

        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)

        experiences = []
        exp_items = driver.find_elements(By.CSS_SELECTOR, "li.artdeco-list__item")
        if not exp_items:
            exp_items = driver.find_elements(By.CSS_SELECTOR, "section li")

        for item in exp_items[:10]:
            try:
                item_text = item.text
                if not item_text or len(item_text) <= 10:
                    continue
                lines = [line.strip() for line in item_text.split("\n") if line.strip()]
                if len(lines) >= 2:
                    experiences.append(
                        {
                            "title": lines[0] if len(lines) > 0 else None,
                            "company": lines[1] if len(lines) > 1 else None,
                            "duration": lines[2] if len(lines) > 2 else None,
                            "raw_text": item_text[:200],
                        }
                    )
            except Exception:
                continue

        return {
            "success": True,
            "name": name,
            "headline": headline,
            "experiences": experiences,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        if driver:
            driver.quit()


@app.route("/")
def hello() -> str:
    return "Hello, World!"


@app.route("/getClubs/<search_query>", methods=["GET"])
def get_clubs(search_query: str):
    collection = get_clubs_collection()
    headers = {"x-api-key": os.getenv("NEBULA_API_KEY")}
    response = requests.get(f"https://api.utdnebula.com/club/search?q={search_query}", headers=headers, timeout=30)
    data = response.json()

    clubs_to_store = data.get("data", [])[:30]

    for club in clubs_to_store:
        club_data = {
            "id": club.get("id"),
            "name": club.get("name"),
            "description": club.get("description"),
            "tags": club.get("tags", []),
            "officers": club.get("officers", []),
        }
        collection.update_one({"id": club_data["id"]}, {"$set": club_data}, upsert=True)

    return jsonify(data)


@app.route("/graph", methods=["GET"])
def get_graph_dataset():
    try:
        collection = get_clubs_collection()
        clubs = list(
            collection.find(
                {},
                {
                    "_id": 0,
                    "id": 1,
                    "name": 1,
                    "description": 1,
                    "tags": 1,
                    "officers": 1,
                },
            )
        )
        return jsonify(build_graph_dataset(clubs))
    except Exception as exc:
        return (
            jsonify(
                {
                    "error_code": "GRAPH_BUILD_FAILED",
                    "message": "Failed to build graph dataset from Mongo data.",
                    "detail": str(exc),
                }
            ),
            500,
        )


@app.route("/scrapeLinkedIn/<officer_name>", methods=["GET"])
def scrape_linkedin_profile(officer_name: str):
    collection = get_clubs_collection()
    club = collection.find_one({"officers.name": officer_name}, {"officers.$": 1, "name": 1})
    if not club or not club.get("officers"):
        return jsonify({"error": "Officer not found"}), 404

    officer = club["officers"][0]
    linkedin_url = officer.get("linkedin_url")
    if not linkedin_url:
        return jsonify({"error": "No LinkedIn URL for this officer"}), 404

    result = linkedin_scrape_with_selenium(linkedin_url)
    if result.get("success"):
        collection.update_many(
            {"officers.name": officer_name},
            {
                "$set": {
                    "officers.$[elem].experience": result.get("experiences", []),
                    "officers.$[elem].last_scraped": time.time(),
                }
            },
            array_filters=[{"elem.name": officer_name}],
        )

    return jsonify(result)


@app.route("/scrapeAllOfficersLinkedIn", methods=["GET"])
def scrape_all_officers_linkedin():
    collection = get_clubs_collection()
    clubs = collection.find({})
    results = []
    scraped_count = 0

    for club in clubs:
        officers = club.get("officers", [])
        if not isinstance(officers, list):
            continue

        for officer in officers:
            if not isinstance(officer, dict):
                continue

            linkedin_url = officer.get("linkedin_url")
            if not linkedin_url or scraped_count >= 10:
                continue

            officer_name = officer.get("name")
            result = linkedin_scrape_with_selenium(linkedin_url)

            if result.get("success") and officer_name:
                collection.update_many(
                    {"officers.name": officer_name},
                    {
                        "$set": {
                            "officers.$[elem].experience": result.get("experiences", []),
                            "officers.$[elem].last_scraped": time.time(),
                        }
                    },
                    array_filters=[{"elem.name": officer_name}],
                )

            results.append({"officer": officer_name, "club": club.get("name"), "result": result})
            scraped_count += 1
            time.sleep(5)

    return jsonify({"total_scraped": scraped_count, "results": results})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "1") == "1")
