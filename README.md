🎵 **StreaMusic**


![image](https://github.com/user-attachments/assets/069620bb-cbd9-4e85-834b-174bf4252dfb)

StreaMusic is a web app built with Python (Flask) that lets users connect to OneDrive and stream .mp3 files through a modern HTML5 music player. It includes features like keyboard controls, a music queue system, and file browsing with metadata.

![image](https://github.com/user-attachments/assets/76775ffe-766b-4e3b-9afc-66235edba491)

🔧 **Setup Instructions**
1. Clone the Repository
    
        git clone https://github.com/YOUR_USERNAME/strea-music.git
        cd strea-music

2. Create a Virtual Environment (Optional but Recommended)
    
        python -m venv venv
        source venv/bin/activate    # On Windows: venv\Scripts\activate

3. Install Dependencies

        pip install -r requirements.txt


🔑 **Environment Variables**

Create a .env file in the root directory of the project with the following content:
    
    CLIENT_ID=your_onedrive_app_client_id
    
    CLIENT_SECRET=your_onedrive_app_client_secret
    
    REDIRECT_URI=http://localhost:5000/callback
    
    FLASK_SECRET_KEY=your_flask_secret_key
    

⚠️ Never commit your .env file to GitHub. It contains secrets that should remain private.


🧑‍💻 **Setting Up the User Database**

Step 1: Initialize the SQLite Database

python

Then in the Python shell:

    from app import db
    from app.models import User  # Adjust import if needed
    db.create_all()

Step 2: Make Yourself an Admin

After logging in through OneDrive once, run the following:

    user = User.query.filter_by(email="your@email.com").first()
    user.is_admin = True
    db.session.commit()

🚀 Running the App
    
    python run.py

Then open http://localhost:5000 in your browser.


🛡️ **Features**

    ✅ OneDrive login integration
    📂 Folder navigation and MP3 streaming
    🎵 Playlist builder and queue system
    ♻️ Media player with shuffle/repeat
    🧑‍💼 Admin dashboard (only visible to admins)

💡 **Notes**

    You must use your own Microsoft Azure app credentials (Client ID and Secret) The app will need the following permissions to work:
    Files.Read — read access to the user’s OneDrive files.
    Files.Read.All (optional) — read access to all user's OneDrive files (if you want admin-level visibility across multiple users or shared drives).
    offline_access — allows refresh token usage so users don’t have to log in every time.
    User.Read — allows access to basic user profile (used for login/session management).
    
    This project is intended for personal or developer use only unless you’ve added proper security and deployment measures

📜 **License**

This project is licensed under a custom non-commercial license based on the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).

You are free to:

    Share — copy and redistribute the material in any medium or format
    Adapt — remix, transform, and build upon the material

Under the following terms:

    Attribution — You must give appropriate credit and indicate if changes were made.
    NonCommercial — You may not use the material for any commercial purpose, including monetization or paid access, unless you have received written permission from the author.
    No resale or commercial distribution is permitted without explicit consent.

Any unauthorized use of this software for commercial gain or by commercial entities will be considered a violation of this license.

Full license details: https://creativecommons.org/licenses/by-nc/4.0/
