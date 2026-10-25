# The Action Database site (Cloudflare)

One free Cloudflare Worker that puts a sign in in front of the whole app. Nobody sees an action, photo or setting until they have signed in, and nobody can sign in until the admin has approved them by email. The GitHub key stays inside the worker, so the data repository can be private.

## How signing in works

A new person opens the site, enters their email, their details and a password, and sees "waiting for approval". The admin gets an email with a Review and approve button, which opens a page with Approve and Deny. Once approved, the person signs in with their email and password on any computer. A sign in lasts 30 days on each computer.

Forgot password works the same way. The person chooses a new password, and it starts working once the admin approves it. Until then the old one still works.

The admin's own account is approved without asking. In the app, the admin's profile menu has Accounts and approvals, which lists everyone and can approve, sign out or remove a person. Removing someone stops them within a minute.

Passwords are kept only as salted hashes in `data/auth.json` in the data repository. The worker never hands that file out, and the app can't change it.

## Set it up (about 15 minutes)

1. **Make the GitHub key.** On github.com go to Settings, Developer settings, Fine grained tokens, Generate new token. Name it "Action Database site". Set the expiration as long as you're allowed, and put a reminder in your calendar a week before it ends. Under Repository access pick Only select repositories, then `bijankle/action-kanban-data`. Under Permissions, Repository permissions, set Contents to Read and write. Generate it and copy it (it starts `github_pat_`).
2. **Make the email key.** Sign up at resend.com with the email that should get the approval requests. Go to API Keys, Create API Key, with Sending access. Copy it (it starts `re_`). On the free plan, without your own domain, Resend can only send to the email you signed up with, and that's all this needs.
3. **Make the worker.** Sign up at dash.cloudflare.com (free). Go to Workers & Pages, Create, Create Worker. Name it `action-database` and Deploy. Then Edit code, delete what's there, paste in all of [worker.js](worker.js), and Deploy.
4. **Give it the settings.** On the worker go to Settings, Variables and Secrets, and add:
   * `GH_TOKEN`, type Secret: the GitHub key.
   * `RESEND_KEY`, type Secret: the Resend key.
   * `ADMIN_EMAIL`, type Text: the email that approves sign ins (the same one you used for Resend).
5. **Open the site and make your account first.** The address looks like `https://action-database.<your-name>.workers.dev`. Sign in with the admin email. Your account is approved straight away.
6. **Send the address to Claude.** It gets built into the app, so the old GitHub Pages address sends everyone to the site.
7. **Make the data repository private.** On github.com open `bijankle/action-kanban-data`, Settings, scroll to Danger Zone, Change visibility, Make private. Do this after step 5 works.

## Notes

Attachments in a PDF export or work pack are links anyone can open without signing in, so a PDF sent to a contractor still opens its files. Each link names one file, is signed by the worker so it can't be changed into another, and stops working after a year. Word, Excel and other files download as themselves. After changing worker.js, paste it into the worker again (step 3) and Deploy.

The worker fetches the app's own files from GitHub Pages, so app updates show up on the site within a minute with no change here.

Every save is a commit by the GitHub key's owner, and the commit message names the person who made it.

Cloudflare's free plan allows 100 000 requests a day, far more than this needs. All sign ins share the one GitHub key, which GitHub limits to about 5000 requests an hour, enough for around 20 people with the app open all day.

When the GitHub key is about to expire, make a new one (step 1) and replace `GH_TOKEN` (step 4). Everyone then signs in again once, and any approval emails not yet answered stop working.

To test the worker away from Cloudflare, `env.API`, `env.APP_ORIGIN` and `env.MAIL_API` can point it at stand ins.
