from flask import Flask, request
import requests
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from bs4 import BeautifulSoup
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import ssl

def linkedin_scrape_with_selenium(profile_url):
    """
    Scrape LinkedIn profile using Selenium with login
    """
    email = os.getenv("LINKEDIN_EMAIL")
    password = os.getenv("LINKEDIN_PASSWORD")
    
    if not email or not password:
        return {"error": "LinkedIn credentials not found in .env"}
    
    chrome_options = Options()
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    driver = None
    
    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=chrome_options
        )
        
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
            except:
                continue
        
        headline = None
        for selector in ["div.text-body-medium", "div.ph5 div.text-body-medium", ".pv-text-details__left-panel div"]:
            try:
                headline = driver.find_element(By.CSS_SELECTOR, selector).text
                if headline and headline != name:
                    break
            except:
                continue
        
        # Scroll to load experience section
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)
        
        experiences = []
        
        # Try to get all text content from experience section
        try:
            # Look for experience section by text
            page_text = driver.page_source
            
            # Try to find experience items using different approaches
            exp_items = driver.find_elements(By.CSS_SELECTOR, "li.artdeco-list__item")
            
            if not exp_items:
                exp_items = driver.find_elements(By.CSS_SELECTOR, "section li")
            
            for item in exp_items[:10]:
                try:
                    item_text = item.text
                    if item_text and len(item_text) > 10:
                        # Split by newlines to extract info
                        lines = [line.strip() for line in item_text.split('\n') if line.strip()]
                        if len(lines) >= 2:
                            experiences.append({
                                "title": lines[0] if len(lines) > 0 else None,
                                "company": lines[1] if len(lines) > 1 else None,
                                "duration": lines[2] if len(lines) > 2 else None,
                                "raw_text": item_text[:200]
                            })
                except:
                    continue
        except Exception as e:
            print(f"Error extracting experiences: {e}")
        
        return {
            "success": True,
            "name": name,
            "headline": headline,
            "experiences": experiences
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
    
    finally:
        if driver:
            driver.quit()

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


@app.route("/scrapeLinkedIn/<officer_name>", methods=["GET"])
def scrape_linkedin_profile(officer_name):
    """
    Scrape LinkedIn profile for an officer
    """
    club = clubs_collection.find_one(
        {"officers.name": officer_name},
        {"officers.$": 1, "name": 1}
    )
    
    if not club or not club.get("officers"):
        return {"error": "Officer not found"}, 404
    
    officer = club["officers"][0]
    linkedin_url = officer.get("linkedin_url")
    
    if not linkedin_url:
        return {"error": "No LinkedIn URL for this officer"}, 404
    
    result = linkedin_scrape_with_selenium(linkedin_url)
    
    if result.get("success"):
        # Store only the experience section
        clubs_collection.update_many(
            {"officers.name": officer_name},
            {
                "$set": {
                    "officers.$[elem].experience": result.get("experiences", []),
                    "officers.$[elem].last_scraped": time.time()
                }
            },
            array_filters=[{"elem.name": officer_name}]
        )
    
    return result


@app.route("/scrapeAllOfficersLinkedIn", methods=["GET"])
def scrape_all_officers_linkedin():
    """
    Scrape all officers with LinkedIn URLs (limited to 10 to avoid ban)
    """
    clubs = clubs_collection.find({})
    
    results = []
    scraped_count = 0
    
    for club in clubs:
        officers = club.get("officers", [])
        
        for officer in officers:
            linkedin_url = officer.get("linkedin_url")
            
            if linkedin_url and scraped_count < 10:
                officer_name = officer.get("name")
                
                result = linkedin_scrape_with_selenium(linkedin_url)
                
                if result.get("success"):
                    # Store only the experience section
                    clubs_collection.update_many(
                        {"officers.name": officer_name},
                        {
                            "$set": {
                                "officers.$[elem].experience": result.get("experiences", []),
                                "officers.$[elem].last_scraped": time.time()
                            }
                        },
                        array_filters=[{"elem.name": officer_name}]
                    )
                
                results.append({
                    "officer": officer_name,
                    "club": club.get("name"),
                    "result": result
                })
                
                scraped_count += 1
                time.sleep(5)
    
    return {
        "total_scraped": scraped_count,
        "results": results
    }


if __name__ == "__main__":
    app.run(debug=True)
