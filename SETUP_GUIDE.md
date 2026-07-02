# 🛠️ Setup Guide: 📅 CommuteSync

Welcome to the installation guide for **CommuteSync**.

Because Google handles permissions differently depending on your account type, this guide is split into two paths. Choose the one that matches your Google account:

1. **[The Standard Path](#-the-standard-path-personal-gmail-accounts):** For regular, free `@gmail.com` users. (Takes ~5 minutes).
2. **[The Enterprise Path](#-the-enterprise-path-workspace--legacy-admin-accounts):** For users with company email domains, active Google Workspace accounts, or accounts previously linked to GCP billing/admin services.

---

<details name="selected-path-type" open>
<summary>
<h2 style="display: inline-block; border:none;"> 🟢 The Standard Path (Personal Gmail Accounts) </h2>
</summary>

*Follow these steps if you are using a standard, personal Google account.*

### Step 1: Create the Apps Script Project
1. Go to [script.google.com](https://script.google.com/) and ensure you are logged into your primary Google account.
2. Click **New Project** in the top left.
3. Rename the project at the top to `CommuteSync` (or whatever you prefer).

### Step 2: Add the Code & Advanced Services
1. In the editor (`Code.gs`), delete the empty `myFunction()`.
2. Copy the entire contents of the `code.gs` file from this repository and paste it into the editor.
3. **Enable the Calendar API:** On the left sidebar, click the **`+`** icon next to **Services**. Scroll down, select **Google Calendar API** (v3), and click **Add**.
   > *(Note: The Google Maps routing service is native to Apps Script, so it is already included in the script scope by default!)*
4. Click the 💾 **Save** icon (or hit `Cmd/Ctrl + S`).

### Step 3: Configure Script Properties (Environment Variables)
The script needs to know your home address and preferences. We store these securely in the Project Settings.
1. Click the ⚙️ **Project Settings** (gear icon) on the left sidebar.
2. Scroll down to **Script Properties** and click **Edit script properties**.
3. Add the required variables (Refer to the `README.md` for the full list of optional properties).
   * **Property:** `HOME_ADDRESS` | **Value:** `123 Your Street, City, ZIP`
   * **Property:** `WORKER_DEBOUNCE_TIMER` | **Value:** `5`
   * **Property:** `MULTI_ORIGIN` | **Value:** `true` (or `false`)
4. Click **Save script properties**.

### Step 4: Initialize the Watchers & Authorize
You only need to do this once to turn the automation on. This requires setting up two distinct triggers: one for real-time updates, and one for the Nightly Sweeper.

**Part A: The Real-Time Watcher**
1. Go back to the `< > Editor` view in Apps Script.
2. From the function dropdown menu at the top, select `setCalendarUpdateTriggers`.
3. Click **▶ Run**.
4. **Authorization Required:** Google will prompt you to authorize the script.
   * Click **Review Permissions**.
   * Choose your Google Account.
   * You will see a warning: *"Google hasn't verified this app."* (This is normal).
   * Click **Advanced** at the bottom, then click **Go to CommuteSync (unsafe)** (or whatever you named the project).
   * Click **Allow**.

**Part B: The Nightly Sweeper (Time-Driven)**
1. On the left sidebar of Apps Script, click the ⏰ **Triggers** icon (looks like a clock).
2. Click the **+ Add Trigger** button in the bottom right corner.
3. Configure the modal exactly as follows:
   * **Choose which function to run:** `markCalendarDirty`
   * **Choose which deployment should run:** `Head`
   * **Select event source:** `Time-driven`
   * **Select type of time based trigger:** `Day timer`
   * **Select time of day:** `4am to 5am` (or your preferred off-hours window)
4. Click **Save**.

🎉 **You are done!** Create a test event on your calendar with a physical location in the next 4 days, wait a few minutes, and watch the commute block magically appear.
</details>

---

<details name="selected-path-type">
<summary>
<h2 style="display: inline-block; border:none;"> 🏢 The Enterprise Path (Workspace & Legacy Admin Accounts) </h2>
</summary>

*Follow these steps if you are using a custom domain (e.g., `you@yourcompany.com`), or if your personal account was previously a Workspace Admin and the script randomly stops working after 7 days.*

Google Workspace environments sandbox Apps Script projects. To give the script permanent access to the Maps and Calendar APIs, you must link it to a standard Google Cloud Platform (GCP) project.

### Step 1: Complete the Standard Setup
First, follow **Steps 1 through 3** from the Standard Path above to get your code, Calendar v3 service, and properties loaded into Apps Script. *Do not run Step 4 yet.*

### Step 2: Create a Dedicated GCP Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the Project Dropdown at the top left and select **New Project**.
3. Name it `CommuteSync-Engine` and click **Create**.
4. Once created, ensure the project is selected. Go to your dashboard and copy the **Project Number** (a long string of digits).

### Step 3: Enable the Required APIs
When using a custom GCP project, it needs explicit permission to use Maps and Calendar.
1. In the GCP Console, go to **APIs & Services > Library**.
2. Search for **Google Calendar API** and click **Enable**.
3. Search for **Directions API** (Google Maps) and click **Enable**.

### Step 4: Link GCP to Apps Script
1. Go back to your Apps Script tab (`script.google.com`).
2. Click the ⚙️ **Project Settings** (gear icon).
3. Scroll down to **Google Cloud Platform (GCP) Project** and click **Change project**.
4. Paste the **Project Number** you copied in Step 2 and click **Set project**.

### Step 5: The "7-Day Expiration" Fix (Crucial)
If you don't do this step, your OAuth token will expire exactly 7 days from now, and the script will silently fail.
1. Back in the GCP Console, go to **APIs & Services > OAuth consent screen**.
2. Select **External** (or **Internal** if available in your active Workspace) and hit Create.
3. Fill in the required fields (App Name: `CommuteSync`, User Support Email: your email). You can skip the domain and logo fields. Save and continue through Scopes and Test Users.
4. **The Fix:** Once back on the OAuth consent screen dashboard, look under "Publishing status". It will currently say *Testing*. Click the **PUBLISH APP** button to push it to **In Production**.
   > *Note: Google will warn you that the app needs verification. Because you are the only user and not distributing this to the public, you can safely ignore this verification warning.*

### Step 6: Initialize the Watchers & Authorize
You only need to do this once to turn the automation on. This requires setting up two distinct triggers: one for real-time updates, and one for the Nightly Sweeper.

**Part A: The Real-Time Watcher**
1. Return to your Apps Script `< > Editor` view.
2. From the function dropdown menu at the top, select `setCalendarUpdateTriggers`.
3. Click **▶ Run**.
4. **Authorization Required:** Google will prompt you to authorize the app. Because it is linked to your GCP project in "Production" mode, the token will now last indefinitely.
   * Click **Review Permissions** and choose your Google Account.
   * If you see an unverified app warning, click **Advanced** at the bottom, then click **Go to [Your Project Name]**.
   * Click **Allow**.

**Part B: The Nightly Sweeper (Time-Driven)**
1. On the left sidebar of Apps Script, click the ⏰ **Triggers** icon (looks like a clock).
2. Click the **+ Add Trigger** button in the bottom right corner.
3. Configure the modal exactly as follows (refer to the screenshot above):
   * **Choose which function to run:** `markCalendarDirty`
   * **Choose which deployment should run:** `Head`
   * **Select event source:** `Time-driven`
   * **Select type of time based trigger:** `Day timer`
   * **Select time of day:** `4am to 5am` (or your preferred off-hours window)
4. Click **Save**.

🎉 **Setup complete!** Your enterprise-grade routing engine is live.
</details>